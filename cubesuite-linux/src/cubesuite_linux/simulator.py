"""
simulator.py — Uma Cube Baby "de mentira" (para testar sem o aparelho)
=====================================================================

Implementa o lado da PEDALEIRA do protocolo, com memória simulada.
É usado pelos testes automáticos e pelo modo:  cubesuite-linux --simular
"""

from __future__ import annotations

import struct
from collections import deque

from . import protocol as P
from .device import FACTORY_PRESETS, FLASH_BLOCK, FLASH_SIZE


class SimulatedCube:
    def __init__(self, product_id: int = 0x4F06, name: str = "SINCO-CubeBaby",
                 ir_base: int = 0x60000, magic: bytes = b"\x00\x59"):
        self.name = name
        self.magic = magic          # a Cube Baby nova só responde a 00 59
        self.flash = bytearray(b"\xFF" * FLASH_SIZE)
        self.ram = bytearray(0x1000)
        self.presets = bytearray(FACTORY_PRESETS)
        info = struct.pack("<5I", 1, product_id, 0, 0, ir_base)
        self.flash[0x2100:0x2114] = info
        self.flash[0x3000] = 0
        self.log: list[tuple] = []

    # --- lado do aparelho ---------------------------------------------
    def handle(self, pkt: bytes):
        """Resposta da pedaleira, ou None se ela ignorar (cabeçalho errado)."""
        if pkt[:2] != self.magic:
            return None
        saved = P.MAGIC
        P.set_magic(self.magic)
        try:
            return self._handle(pkt)
        finally:
            P.set_magic(saved)

    def _handle(self, pkt: bytes) -> bytes:
        cmd, p = P.parse_packet(pkt)
        if cmd == P.CMD_IDENTIFY:
            # resposta igual à da Cube Baby real (log do Cube Remote 1.2)
            payload = self.name.encode().ljust(19, b" ") + bytes([1, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19])
            return P.build_packet(P.CMD_IDENTIFY, payload)
        region = p[0]
        addr = struct.unpack("<I", p[1:5])[0]
        mem, a = self._mem(region, addr)
        if cmd == P.CMD_READ:
            n = p[5] | (p[6] << 8) | (p[7] << 16)
            data = bytes(mem[a:a + n])
            self.log.append(("read", region, addr, n))
            return P.build_packet(P.CMD_READ, p[:8] + data)
        if cmd == P.CMD_WRITE:
            n = p[5] | (p[6] << 8) | (p[7] << 16)
            data = p[8:8 + n]
            mem[a:a + n] = data
            self.log.append(("write", region, addr, bytes(data)))
            return P.build_packet(P.CMD_ACK, b"\x00")
        if cmd == P.CMD_ERASE:
            if region != 0 or addr % FLASH_BLOCK:
                return P.build_packet(P.CMD_ACK, b"\x01")
            mem[a:a + FLASH_BLOCK] = b"\xFF" * FLASH_BLOCK
            self.log.append(("erase", region, addr))
            return P.build_packet(P.CMD_ACK, b"\x00")
        if cmd == P.CMD_CHECKSUM:
            n = struct.unpack("<I", p[5:9])[0]
            s = P.sum16(bytes(mem[a:a + n]))
            return P.build_packet(P.CMD_CHECKSUM,
                                  p[:8] + b"\x00" + struct.pack("<H", s))
        return P.build_packet(P.CMD_ACK, b"\x02")

    def _mem(self, region: int, addr: int):
        if region == 0:
            return self.flash, addr
        if region == 4:
            return self.ram, addr
        if region == 5:
            return self.presets, addr & 0x7FFFFFFF
        raise P.ProtocolError("região desconhecida %d" % region)


class SimulatedTransport:
    """Substitui o RawMidiTransport, falando com um SimulatedCube."""

    def __init__(self, cube: SimulatedCube):
        self.cube = cube
        self.queue: deque[bytes] = deque()
        self.sent = 0

    def send(self, msg: bytes) -> None:
        self.sent += 1
        reply = self.cube.handle(P.from_sysex(msg))
        if reply is not None:
            self.queue.append(P.to_sysex(reply))

    def recv_sysex(self, timeout: float):
        return self.queue.popleft() if self.queue else None

    def flush_input(self) -> None:
        self.queue.clear()

    def close(self) -> None:
        pass
