"""
protocol.py — Protocolo de comunicação da pedaleira (Cuvave / M-VAVE Cube Baby)
==============================================================================

Tudo aqui foi obtido por engenharia reversa do CubeSuite.exe (Windows).
Este arquivo NÃO acessa hardware: são só funções que montam e desmontam
mensagens. Por isso ele é fácil de testar (veja tests/test_protocol.py).

Visão geral (do mais externo para o mais interno):

  1) Mensagem MIDI SysEx:      F0  <bytes de 7 bits>  F7
  2) Empacotamento 7 bits:     o MIDI só aceita bytes 0..127 dentro do SysEx,
                               então os bytes "normais" (8 bits) são lidos como
                               um fluxo de bits (bit menos significativo
                               primeiro) e cortados em pedaços de 7 bits.
  3) Pacote do aparelho:
        59 00 | CMD | LEN (3 bytes, little-endian) | PAYLOAD (LEN bytes) | CHK
        CHK = NOT(soma dos bytes do PAYLOAD) & 0xFF

Comandos descobertos:
  0x11  Identificar       -> resposta 0x11 com nome + versão
  0x21  Apagar bloco      payload: região(1) endereço(4)
  0x22  Escrever          payload: região(1) endereço(4) tamanho(3) dados
  0x23  Ler               payload: região(1) endereço(4) tamanho(3)
                          resposta 0x23: região endereço tamanho dados
  0x24  Soma de verificação payload: região(1) endereço(4) tamanho(4)
                          resposta 0x24: ... soma16 nos bytes 9..10
  0x00  (resposta) ACK    payload: status(1)  -> 0 = sucesso
"""

from __future__ import annotations

import struct

# Cabeçalho fixo de todo pacote (lido da variável global 0x756AD0 do .exe)
MAGIC = b"\x59\x00"

CMD_ACK = 0x00
CMD_IDENTIFY = 0x11
CMD_ERASE = 0x21
CMD_WRITE = 0x22
CMD_READ = 0x23
CMD_CHECKSUM = 0x24

HEADER_LEN = 6  # 2 (magic) + 1 (cmd) + 3 (len)


class ProtocolError(Exception):
    """Erro ao interpretar uma resposta da pedaleira."""


# ---------------------------------------------------------------------------
# 1) Empacotamento 8 bits -> 7 bits (e o inverso)
# ---------------------------------------------------------------------------

def pack7(data: bytes) -> bytes:
    """Converte bytes de 8 bits num fluxo de bytes de 7 bits (LSB primeiro).

    Reprodução exata da função 0x486980 do CubeSuite.exe.
    """
    out = bytearray()
    acc = 0      # acumulador de bits
    nbits = 0    # quantos bits válidos há no acumulador
    for b in data:
        acc |= b << nbits
        nbits += 8
        while nbits >= 7:
            out.append(acc & 0x7F)
            acc >>= 7
            nbits -= 7
    if nbits:
        out.append(acc & 0x7F)
    return bytes(out)


def unpack7(data: bytes) -> bytes:
    """Inverso de pack7: junta pedaços de 7 bits de volta em bytes de 8 bits.

    Bits que sobram no final (menos de 8) são descartados, como no original.
    """
    out = bytearray()
    acc = 0
    nbits = 0
    for b in data:
        acc |= (b & 0x7F) << nbits
        nbits += 7
        if nbits >= 8:
            out.append(acc & 0xFF)
            acc >>= 8
            nbits -= 8
    return bytes(out)


def to_sysex(packet: bytes) -> bytes:
    """Embrulha um pacote em uma mensagem SysEx (F0 ... F7)."""
    return b"\xF0" + pack7(packet) + b"\xF7"


def from_sysex(msg: bytes) -> bytes:
    """Extrai o pacote de dentro de uma mensagem SysEx completa."""
    if not msg or msg[0] != 0xF0 or msg[-1] != 0xF7:
        raise ProtocolError("mensagem SysEx inválida")
    return unpack7(msg[1:-1])


# ---------------------------------------------------------------------------
# 2) Pacotes
# ---------------------------------------------------------------------------

def checksum(payload: bytes) -> int:
    """NOT da soma dos bytes (8 bits)."""
    return (~sum(payload)) & 0xFF


def build_packet(cmd: int, payload: bytes = b"") -> bytes:
    n = len(payload)
    header = MAGIC + bytes([cmd, n & 0xFF, (n >> 8) & 0xFF, (n >> 16) & 0xFF])
    return header + payload + bytes([checksum(payload)])


def parse_packet(pkt: bytes) -> tuple[int, bytes]:
    """Valida um pacote recebido e devolve (cmd, payload)."""
    if len(pkt) < HEADER_LEN + 1:
        raise ProtocolError("pacote curto demais (%d bytes)" % len(pkt))
    if pkt[:2] != MAGIC:
        raise ProtocolError("cabeçalho desconhecido: %s" % pkt[:2].hex())
    cmd = pkt[2]
    n = pkt[3] | (pkt[4] << 8) | (pkt[5] << 16)
    if len(pkt) < HEADER_LEN + n + 1:
        raise ProtocolError("pacote incompleto: esperado %d bytes, veio %d"
                            % (HEADER_LEN + n + 1, len(pkt)))
    payload = pkt[HEADER_LEN:HEADER_LEN + n]
    got = pkt[HEADER_LEN + n]
    if checksum(payload) != got:
        raise ProtocolError("checksum errado (calc=%02X, recebido=%02X)"
                            % (checksum(payload), got))
    return cmd, payload


# ---------------------------------------------------------------------------
# 3) Montagem dos comandos (pedidos do computador -> pedaleira)
# ---------------------------------------------------------------------------

def _u24(n: int) -> bytes:
    return bytes([n & 0xFF, (n >> 8) & 0xFF, (n >> 16) & 0xFF])


def req_identify() -> bytes:
    return build_packet(CMD_IDENTIFY)


def req_erase(region: int, addr: int) -> bytes:
    return build_packet(CMD_ERASE, bytes([region]) + struct.pack("<I", addr))


def req_write(region: int, addr: int, data: bytes) -> bytes:
    return build_packet(CMD_WRITE, bytes([region]) + struct.pack("<I", addr)
                        + _u24(len(data)) + bytes(data))


def req_read(region: int, addr: int, length: int) -> bytes:
    return build_packet(CMD_READ, bytes([region]) + struct.pack("<I", addr)
                        + _u24(length))


def req_checksum(region: int, addr: int, length: int) -> bytes:
    return build_packet(CMD_CHECKSUM, bytes([region]) + struct.pack("<I", addr)
                        + struct.pack("<I", length))


# ---------------------------------------------------------------------------
# 4) Interpretação das respostas
# ---------------------------------------------------------------------------

def parse_ack(pkt: bytes) -> int:
    """Devolve o código de status do ACK (0 = OK)."""
    cmd, payload = parse_packet(pkt)
    if cmd != CMD_ACK or not payload:
        raise ProtocolError("esperava ACK, veio comando 0x%02X" % cmd)
    return payload[0]


def parse_identify(pkt: bytes) -> tuple[str, str]:
    """Devolve (nome, versão).

    O original lê os bytes 0..15 do payload como nome (removendo caracteres
    de controle) e os bytes 8..18 como dígitos da versão (+ '0').
    """
    cmd, p = parse_packet(pkt)
    if cmd != CMD_IDENTIFY:
        raise ProtocolError("esperava identificação, veio 0x%02X" % cmd)
    name = "".join(chr(c) for c in p[:16] if c >= 0x20 and c < 0x7F)
    ver = "".join(chr(c + 0x30) for c in p[8:19] if c < 10)
    return name.strip(), ver


def parse_read(pkt: bytes) -> tuple[int, int, bytes]:
    """Devolve (região, endereço, dados) de uma resposta de leitura."""
    cmd, p = parse_packet(pkt)
    if cmd != CMD_READ:
        raise ProtocolError("esperava dados (0x23), veio 0x%02X" % cmd)
    region = p[0]
    addr = struct.unpack("<I", p[1:5])[0]
    n = p[5] | (p[6] << 8) | (p[7] << 16)
    data = p[8:8 + n]
    if len(data) != n:
        raise ProtocolError("tamanho de dados errado")
    return region, addr, data


def parse_checksum(pkt: bytes) -> int:
    cmd, p = parse_packet(pkt)
    if cmd != CMD_CHECKSUM or len(p) < 11:
        raise ProtocolError("resposta de checksum inválida")
    return p[9] | (p[10] << 8)


def sum16(data: bytes) -> int:
    """Soma de 16 bits usada na verificação de gravação (comando 0x24)."""
    return sum(data) & 0xFFFF
