"""
device.py — Funções de alto nível da pedaleira Cube Baby
========================================================

Aqui ficam as operações que a interface usa (ler presets, mudar um knob,
enviar IR, restaurar fábrica...). Cada operação é a tradução direta do que
o CubeSuite.exe faz, com os mesmos endereços de memória.

Mapa de memória descoberto (região = "banco" de memória do aparelho):

  Região 0 (flash, 512 KB, apagável em blocos de 4 KB)
    0x0180 / 0x2100 / 0x4180   bloco de informações (20 bytes):
                               [?, ID do produto, ?, ?, endereço base dos IRs]
    0x3000                     1 byte: USB Loopback (0 = desligado)
    base + slot*0x1000         IR do usuário (slot 0..7), 0x808 bytes cada

  Região 4 (RAM do processador de áudio — efeito imediato, não salva)
    0x764   1 byte   0 = "pausar IR" / 1 = "ativar IR"
    0x768   float    distância do microfone (1..100 / 100)
    0x76C   512 floats  resposta ao impulso (IR)

  Região 5 (parâmetros dos presets A, B, C — 16 bytes cada)
    leitura em 0x0000, escrita "ao vivo" em 0x80000000 + deslocamento
"""

from __future__ import annotations

import struct
import threading
import time
from dataclasses import dataclass, field
from typing import Callable

from . import protocol as P
from .transport import RawMidiTransport, TransportError

Progress = Callable[[int, int], None]   # (feito, total)

# ---------------------------------------------------------------------------
# Tabela de produtos (extraída da tabela em 0x7548E0 do .exe)
# ---------------------------------------------------------------------------
# gen 1 = Cube Baby antigo (só editor de IR)
# gen 2 = Cube Baby novo (editor completo: presets + IR)   <- a sua, com BT/tuner
PRODUCTS = {
    0x272E: ("Cube Baby", 1),
    0x2792: ("Cube Baby", 1),
    0x4EA2: ("Cube Baby", 2),
    0x4E3E: ("Cube Baby", 2),
    0x4F06: ("Cube Baby", 2),
    0x4F09: ("Cube Baby", 2),   # variante "MicroRig": IR e presets de fábrica próprios
    0x4FCE: ("Cube Baby AC", 0),    # 0 = reconhecido, mas não suportado aqui
    0x5032: ("Cube Baby Bass", 0),
    0x76DF: ("Cube Baby Bass", 0),
}

FLASH_REGION = 0
FLASH_BLOCK = 0x1000
FLASH_SIZE = 0x80000
RAM_REGION = 4
PRESET_REGION = 5
LIVE_FLAG = 0x80000000

CHUNK = 0x80               # tamanho máximo de pacote para a Cube Baby
READ_CHUNK = CHUNK - 15    # o original desconta 15 bytes de cabeçalho

IR_SLOTS = 8
IR_SAMPLES = 512
IR_BLOCK_LEN = 0x808       # 4 (flag) + 4 (distância) + 512*4 (amostras)
FACTORY_IR_OFFSET = 0x9000 # posição dentro do BFI.bin / MICRORIG.bin
FACTORY_IR_LEN = 0x8000

# ---------------------------------------------------------------------------
# Parâmetros de cada preset (posição do byte, nome, valor máximo)
# A ordem da lista = ordem dos knobs no painel da pedaleira.
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class Param:
    key: str
    label: str
    offset: int
    max: int
    group: str


PARAMS = [
    Param("volume", "VOLUME", 5, 127, "out"),
    Param("irCab",  "IR CAB", 9, 8,   "A"),
    Param("reverb", "REVERB", 3, 15,  "A"),
    Param("mix",    "MIX",    7, 118, "B"),
    Param("fb",     "FB",     4, 127, "B"),
    Param("time",   "TIME",   6, 31,  "B"),
    Param("mod",    "MOD",    8, 15,  "B"),
    Param("tone",   "TONE",   2, 15,  "C"),
    Param("gain",   "GAIN",   1, 7,   "C"),
    Param("type",   "TYPE",   0, 8,   "C"),
]
# Chaves liga/desliga de cada bloco (posição na tela original = topo do grupo)
SWITCHES = [
    Param("swA", "IR CAB / REVERB", 10, 1, "A"),
    Param("swB", "DELAY / MOD",     11, 1, "B"),
    Param("swC", "TONE / AMP",      12, 1, "C"),
]
PRESET_NAMES = ["A", "B", "C"]
PRESET_SIZE = 16

# Presets de fábrica (tabelas 0x5848AC e 0x58487C do .exe)
FACTORY_PRESETS = bytes([
    2, 4, 10, 4, 31, 38, 31, 19, 7, 8, 1, 1, 1, 0, 0, 0,
    6, 3, 10, 0, 31, 12, 31, 16, 7, 8, 1, 1, 1, 0, 0, 0,
    0, 5, 11, 0, 31, 32, 31, 19, 7, 8, 1, 1, 1, 0, 0, 0,
])
FACTORY_PRESETS_4F09 = bytes([
    7, 7, 9, 5, 52, 65, 20, 30, 7, 4, 1, 1, 1, 0, 0, 0,
    4, 2, 5, 5, 44, 70, 23, 30, 7, 5, 1, 1, 1, 0, 0, 0,
    1, 7, 7, 5, 52, 111, 20, 12, 5, 2, 1, 1, 1, 0, 0, 0,
])


class DeviceError(Exception):
    pass


@dataclass
class DeviceInfo:
    port: str = ""
    port_name: str = ""
    name: str = ""
    version: str = ""
    product_id: int = 0
    model: str = ""
    generation: int = 0
    ir_base: int = 0
    info_addr: int = 0
    raw_info: list = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "port": self.port, "portName": self.port_name, "name": self.name,
            "version": self.version, "productId": "0x%04X" % self.product_id,
            "model": self.model, "generation": self.generation,
            "irBase": "0x%X" % self.ir_base,
            "factoryFile": "MICRORIG.bin" if self.product_id == 0x4F09 else "BFI.bin",
        }


class CubeDevice:
    """Uma pedaleira conectada. Todas as operações são protegidas por lock."""

    def __init__(self, transport):
        self.t = transport
        self.lock = threading.RLock()
        self.info = DeviceInfo()

    # ------------------------------------------------------------------
    # Transações básicas
    # ------------------------------------------------------------------
    def _transact(self, packet: bytes, expect_cmd: int, timeout: float) -> bytes:
        self.t.send(P.to_sysex(packet))
        deadline = time.monotonic() + timeout
        while True:
            left = deadline - time.monotonic()
            msg = self.t.recv_sysex(max(left, 0))
            if msg is None:
                raise DeviceError("a pedaleira não respondeu (timeout)")
            try:
                pkt = P.from_sysex(msg)
                if pkt[:2] == P.MAGIC and pkt[2] == expect_cmd:
                    return pkt
            except P.ProtocolError:
                pass  # mensagem de outro tipo: ignora e continua esperando

    def identify(self, timeout: float = 1.0) -> tuple[str, str]:
        with self.lock:
            self.t.flush_input()
            pkt = self._transact(P.req_identify(), P.CMD_IDENTIFY, timeout)
            return P.parse_identify(pkt)

    def read(self, region: int, addr: int, length: int,
             progress: Progress | None = None) -> bytes:
        out = bytearray()
        with self.lock:
            while len(out) < length:
                n = min(READ_CHUNK, length - len(out))
                a = addr + len(out)
                pkt = self._transact(P.req_read(region, a, n), P.CMD_READ, 2.0)
                r, ra, data = P.parse_read(pkt)
                if r != region or ra != a or len(data) != n:
                    raise DeviceError("resposta de leitura inconsistente")
                out += data
                if progress:
                    progress(len(out), length)
        return bytes(out)

    def write(self, region: int, addr: int, data: bytes,
              progress: Progress | None = None) -> None:
        with self.lock:
            done = 0
            while done < len(data):
                part = data[done:done + CHUNK]
                pkt = self._transact(P.req_write(region, addr + done, part),
                                     P.CMD_ACK, 10.0)
                st = P.parse_ack(pkt)
                if st != 0:
                    raise DeviceError("gravação recusada (status %d) em 0x%X"
                                      % (st, addr + done))
                done += len(part)
                if progress:
                    progress(done, len(data))

    def erase(self, region: int, addr: int) -> None:
        with self.lock:
            pkt = self._transact(P.req_erase(region, addr), P.CMD_ACK, 30.0)
            if P.parse_ack(pkt) != 0:
                raise DeviceError("Erase 0x%08X falhou" % addr)

    def device_sum16(self, region: int, addr: int, length: int) -> int:
        with self.lock:
            pkt = self._transact(P.req_checksum(region, addr, length),
                                 P.CMD_CHECKSUM, 30.0)
            return P.parse_checksum(pkt)

    def write_ram_verified(self, addr: int, data: bytes) -> None:
        """Igual à função 0x507EA0: grava na RAM (região 4) e confere a soma."""
        with self.lock:
            self.write(RAM_REGION, addr, data)
            if self.device_sum16(RAM_REGION, addr, len(data)) != P.sum16(data):
                raise DeviceError("verificação da RAM falhou em 0x%X" % addr)

    # ------------------------------------------------------------------
    # Conexão / identificação
    # ------------------------------------------------------------------
    def connect(self, port_path: str = "", port_name: str = "") -> DeviceInfo:
        with self.lock:
            name, ver = self.identify()
            info = DeviceInfo(port=port_path, port_name=port_name,
                              name=name, version=ver)
            # Mesmo critério do original para achar o bloco de informações
            if "looperpro1" in name:
                order = [0x4180, 0x2100, 0x180]
            elif "Cuvave-IR" in name:
                order = [0x180, 0x2100, 0x4180]
            else:
                order = [0x2100, 0x180, 0x4180]
            last_err = None
            for addr in order:
                try:
                    raw = self.read(FLASH_REGION, addr, 20)
                except DeviceError as e:
                    last_err = e
                    continue
                vals = struct.unpack("<5I", raw)
                if vals[1] in PRODUCTS:
                    info.info_addr = addr
                    info.raw_info = list(vals)
                    info.product_id = vals[1]
                    info.model, info.generation = PRODUCTS[vals[1]]
                    info.ir_base = vals[4]
                    break
            else:
                raise DeviceError(
                    "Aparelho '%s' respondeu, mas não é uma Cube Baby "
                    "reconhecida%s" % (name, (" (%s)" % last_err) if last_err else ""))
            self.info = info
            return info

    def _require(self, gen: int | None = None) -> None:
        if self.info.generation == 0:
            raise DeviceError("Modelo %s ainda não suportado por esta versão"
                              % self.info.model)
        if gen and self.info.generation != gen:
            raise DeviceError("Função disponível só na Cube Baby geração %d" % gen)

    # ------------------------------------------------------------------
    # Presets (somente geração 2)
    # ------------------------------------------------------------------
    def read_presets(self) -> list[dict]:
        self._require(2)
        raw = self.read(PRESET_REGION, 0, PRESET_SIZE * 3)
        presets = []
        for i in range(3):
            chunk = raw[i * PRESET_SIZE:(i + 1) * PRESET_SIZE]
            p = {x.key: chunk[x.offset] for x in PARAMS + SWITCHES}
            presets.append(p)
        return presets

    def set_param(self, preset: int, key: str, value: int) -> None:
        """Muda um knob/chave ao vivo — igual a 0x49F520 / 0x49EB40."""
        self._require(2)
        par = {x.key: x for x in PARAMS + SWITCHES}.get(key)
        if par is None or not 0 <= preset < 3:
            raise DeviceError("parâmetro inválido")
        value = max(0, min(par.max, int(value)))
        addr = LIVE_FLAG | (preset * PRESET_SIZE + par.offset)
        self.write(PRESET_REGION, addr, bytes([value]))

    def factory_reset_presets(self) -> list[dict]:
        self._require(2)
        data = FACTORY_PRESETS_4F09 if self.info.product_id == 0x4F09 else FACTORY_PRESETS
        self.write(PRESET_REGION, 0, data)
        return self.read_presets()

    # ------------------------------------------------------------------
    # USB Loopback (devolve o áudio do PC para a saída da pedaleira)
    # ------------------------------------------------------------------
    def get_loopback(self) -> bool:
        self._require(2)
        return self.read(FLASH_REGION, 0x3000, 1)[0] != 0

    def set_loopback(self, on: bool) -> None:
        self._require(2)
        self.write(FLASH_REGION, 0x3000, bytes([1 if on else 0]))

    # ------------------------------------------------------------------
    # IR (resposta ao impulso da caixa) — ambas as gerações
    # ------------------------------------------------------------------
    @staticmethod
    def _ir_payload(samples: list[float], distance: int) -> bytes:
        s = list(samples[:IR_SAMPLES]) + [0.0] * max(0, IR_SAMPLES - len(samples))
        return struct.pack("<f", distance / 100.0) + struct.pack("<%df" % IR_SAMPLES, *s)

    def ir_preview(self, samples: list[float], distance: int) -> None:
        """Toca o IR na hora (RAM), sem salvar — igual a 0x4A0120."""
        self._require()
        with self.lock:
            self.write_ram_verified(0x764, b"\x00")
            self.write_ram_verified(0x768, self._ir_payload(samples, distance))
            self.write_ram_verified(0x764, b"\x01")

    def ir_set_distance(self, distance: int) -> None:
        """Slider 'Distance' — igual a 0x49E220."""
        self._require()
        with self.lock:
            self.write_ram_verified(0x764, b"\x00")
            self.write_ram_verified(0x768, struct.pack("<f", distance / 100.0))
            self.write_ram_verified(0x764, b"\x01")

    def _check_space(self, start: int, length: int) -> None:
        if start + length > FLASH_SIZE:
            raise DeviceError("Sem espaço na memória (No enough space!)")

    def _erase_range(self, start: int, length: int) -> None:
        a = start
        while a < start + length:
            self.erase(FLASH_REGION, a)
            a += FLASH_BLOCK

    def _write_and_verify(self, addr: int, data: bytes,
                          progress: Progress | None) -> None:
        total = len(data) * 2
        self.write(FLASH_REGION, addr, data,
                   (lambda d, t: progress(d, total)) if progress else None)
        back = self.read(FLASH_REGION, addr, len(data),
                         (lambda d, t: progress(len(data) + d, total)) if progress else None)
        if back != data:
            raise DeviceError("Verificação falhou: os dados lidos não conferem")

    def ir_save(self, slot: int, samples: list[float], distance: int,
                progress: Progress | None = None) -> None:
        """Salva o IR num dos 8 slots da flash — igual a 0x49E970."""
        self._require()
        if not 0 <= slot < IR_SLOTS:
            raise DeviceError("slot inválido")
        block = b"\x00\x00\x00\x00" + self._ir_payload(samples, distance)
        addr = self.info.ir_base + slot * FLASH_BLOCK
        with self.lock:
            self._check_space(addr, len(block))
            self._erase_range(addr, len(block))
            self._write_and_verify(addr, block, progress)

    def factory_ir(self, bin_data: bytes, progress: Progress | None = None) -> None:
        """Restaura os IRs de fábrica a partir do BFI.bin/MICRORIG.bin."""
        self._require()
        if len(bin_data) < FACTORY_IR_OFFSET + FACTORY_IR_LEN:
            raise DeviceError("Arquivo de fábrica inválido (tamanho %d bytes; "
                              "esperado %d)" % (len(bin_data),
                                                FACTORY_IR_OFFSET + FACTORY_IR_LEN))
        data = bin_data[FACTORY_IR_OFFSET:FACTORY_IR_OFFSET + FACTORY_IR_LEN]
        base = self.info.ir_base
        with self.lock:
            self._check_space(base, FACTORY_IR_LEN)
            self._erase_range(base, FACTORY_IR_LEN)
            self._write_and_verify(base, data, progress)

    def close(self) -> None:
        self.t.close()


# ---------------------------------------------------------------------------
# Busca automática
# ---------------------------------------------------------------------------
def open_device(port_path: str, port_name: str = "") -> CubeDevice:
    t = RawMidiTransport(port_path)
    dev = CubeDevice(t)
    try:
        dev.connect(port_path, port_name)
    except Exception:
        t.close()
        raise
    return dev


def auto_connect(ports) -> tuple[CubeDevice | None, list[str]]:
    """Testa cada porta MIDI até achar a pedaleira. Devolve (device, log)."""
    log = []
    for p in ports:
        try:
            dev = open_device(p.path, p.name)
            log.append("%s (%s): encontrada %s" % (p.path, p.name, dev.info.model))
            return dev, log
        except (TransportError, DeviceError, P.ProtocolError) as e:
            log.append("%s (%s): %s" % (p.path, p.name, e))
    return None, log
