"""
transport.py — Comunicação USB-MIDI no Linux (sem bibliotecas extras)
====================================================================

No Windows o CubeSuite usa a API "WinMM" (midiOutLongMsg / midiInOpen).
No Linux, toda interface USB-MIDI "class compliant" (como a pedaleira)
aparece automaticamente como um arquivo de dispositivo ALSA:

    /dev/snd/midiC<placa>D<dispositivo>     ex.: /dev/snd/midiC1D0

Ler e escrever nesse arquivo = receber e enviar bytes MIDI. Por isso este
módulo usa só a biblioteca padrão do Python (os, select).

Se der "Permissão negada": adicione seu usuário ao grupo 'audio'
    sudo usermod -aG audio $USER     (e depois saia e entre de novo)
"""

from __future__ import annotations

import errno
import glob
import os
import re
import select
import time
from dataclasses import dataclass


@dataclass
class MidiPort:
    path: str        # /dev/snd/midiC1D0
    card: int
    device: int
    name: str        # nome amigável vindo de /proc/asound

    def to_dict(self) -> dict:
        return {"path": self.path, "name": self.name,
                "card": self.card, "device": self.device}


def _card_name(card: int) -> str:
    """Lê o nome da placa de som/MIDI em /proc/asound/cards."""
    try:
        with open("/proc/asound/cards", encoding="utf-8", errors="replace") as f:
            for line in f:
                m = re.match(r"\s*(\d+)\s+\[[^\]]*\]:\s*(.*)", line)
                if m and int(m.group(1)) == card:
                    return m.group(2).split(" - ", 1)[-1].strip()
    except OSError:
        pass
    return "Placa %d" % card


def list_ports() -> list[MidiPort]:
    """Lista todas as portas MIDI "cruas" (rawmidi) do sistema."""
    ports = []
    for path in sorted(glob.glob("/dev/snd/midiC*D*")):
        m = re.search(r"midiC(\d+)D(\d+)$", path)
        if not m:
            continue
        card, dev = int(m.group(1)), int(m.group(2))
        ports.append(MidiPort(path, card, dev, _card_name(card)))
    return ports


# Palavras que indicam ser a pedaleira (testadas primeiro na busca automática)
LIKELY = re.compile(r"cube|cuvave|m-?vave|baby|sinco|ircab|micro", re.I)


def sort_ports(ports: list[MidiPort]) -> list[MidiPort]:
    return sorted(ports, key=lambda p: 0 if LIKELY.search(p.name) else 1)


class TransportError(Exception):
    pass


class RawMidiTransport:
    """Envia e recebe mensagens SysEx por uma porta /dev/snd/midiC*D*."""

    def __init__(self, path: str):
        self.path = path
        try:
            self.fd = os.open(path, os.O_RDWR | os.O_NONBLOCK)
        except OSError as e:
            if e.errno in (errno.EACCES, errno.EPERM):
                raise TransportError(
                    "Sem permissão para abrir %s. Rode: sudo usermod -aG audio "
                    "$USER e reinicie a sessão." % path) from e
            if e.errno == errno.EBUSY:
                raise TransportError(
                    "%s está em uso por outro programa (DAW, JACK, "
                    "PipeWire-MIDI...). Feche-o e tente de novo." % path) from e
            raise TransportError("Não consegui abrir %s: %s" % (path, e)) from e
        self._buf = bytearray()

    # -- envio ------------------------------------------------------------
    def send(self, msg: bytes) -> None:
        view = memoryview(msg)
        deadline = time.monotonic() + 5
        while view:
            try:
                n = os.write(self.fd, view)
                view = view[n:]
            except BlockingIOError:
                if time.monotonic() > deadline:
                    raise TransportError("timeout ao enviar dados")
                select.select([], [self.fd], [], 0.05)
            except OSError as e:
                raise TransportError("erro ao enviar: %s (a pedaleira foi "
                                     "desconectada?)" % e) from e

    # -- recepção ---------------------------------------------------------
    def flush_input(self) -> None:
        """Descarta qualquer coisa que esteja esperando na entrada."""
        self._buf.clear()
        while True:
            r, _, _ = select.select([self.fd], [], [], 0)
            if not r:
                return
            try:
                if not os.read(self.fd, 4096):
                    return
            except (BlockingIOError, OSError):
                return

    def recv_sysex(self, timeout: float) -> bytes | None:
        """Espera até `timeout` segundos por UMA mensagem SysEx completa."""
        deadline = time.monotonic() + timeout
        while True:
            msg = self._extract()
            if msg is not None:
                return msg
            left = deadline - time.monotonic()
            if left <= 0:
                return None
            r, _, _ = select.select([self.fd], [], [], left)
            if not r:
                return None
            try:
                chunk = os.read(self.fd, 4096)
            except BlockingIOError:
                continue
            except OSError as e:
                raise TransportError("erro ao ler: %s" % e) from e
            # Remove mensagens de tempo real (0xF8..0xFF exceto F7) que podem
            # aparecer no meio do fluxo, como o MIDI permite.
            self._buf.extend(b for b in chunk if b < 0xF8)

    def _extract(self) -> bytes | None:
        start = self._buf.find(0xF0)
        if start < 0:
            self._buf.clear()
            return None
        end = self._buf.find(0xF7, start)
        if end < 0:
            del self._buf[:start]
            return None
        msg = bytes(self._buf[start:end + 1])
        del self._buf[:end + 1]
        return msg

    def close(self) -> None:
        try:
            os.close(self.fd)
        except OSError:
            pass
