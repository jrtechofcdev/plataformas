"""
wav.py — Lê um arquivo .wav de IR e devolve as 512 primeiras amostras
=====================================================================

Comportamento copiado do CubeSuite (função 0x50B2C0):
  * usa apenas o canal ESQUERDO (se o arquivo for estéreo);
  * pega as primeiras 512 amostras, sem reamostrar (use IR em 44.1/48 kHz);
  * 16 bits -> amostra / 32767 ;  24 bits -> amostra / 2^23 ;
  * se tiver menos de 512 amostras, completa com zeros.

Extra em relação ao original: aceita também 8 bits, 32 bits inteiro,
float 32/64 mono e o formato WAVE_FORMAT_EXTENSIBLE.
"""

from __future__ import annotations

import struct

N_SAMPLES = 512


class WavError(Exception):
    pass


def read_ir(data: bytes, n: int = N_SAMPLES) -> tuple[list[float], dict]:
    if len(data) < 12 or data[:4] != b"RIFF" or data[8:12] != b"WAVE":
        raise WavError("Não é um arquivo WAV válido (falta RIFF/WAVE)")
    pos = 12
    fmt = None
    pcm = None
    while pos + 8 <= len(data):
        cid = data[pos:pos + 4]
        size = struct.unpack("<I", data[pos + 4:pos + 8])[0]
        body = data[pos + 8:pos + 8 + size]
        if cid == b"fmt ":
            fmt = body
        elif cid == b"data":
            pcm = body
        pos += 8 + size + (size & 1)
    if fmt is None or len(fmt) < 16:
        raise WavError("WAV sem bloco de formato ('fmt ')")
    if pcm is None:
        raise WavError("WAV sem bloco de dados ('data')")

    tag, channels, rate, _brate, align, bits = struct.unpack("<HHIIHH", fmt[:16])
    if tag == 0xFFFE and len(fmt) >= 26:        # WAVE_FORMAT_EXTENSIBLE
        tag = struct.unpack("<H", fmt[24:26])[0]
    if channels < 1 or align < 1:
        raise WavError("WAV com cabeçalho inválido")

    width = align // channels
    frames = min(n, len(pcm) // align)
    out = []
    for i in range(frames):
        s = pcm[i * align:i * align + width]          # canal esquerdo
        if tag == 3 and width == 4:
            v = struct.unpack("<f", s)[0]
        elif tag == 3 and width == 8:
            v = struct.unpack("<d", s)[0]
        elif tag == 1 and width == 1:
            v = (s[0] - 128) / 128.0
        elif tag == 1 and width == 2:
            v = struct.unpack("<h", s)[0] / 32767.0
        elif tag == 1 and width == 3:
            iv = s[0] | (s[1] << 8) | (s[2] << 16)
            if iv & 0x800000:
                iv -= 1 << 24
            v = iv / float(1 << 23)
        elif tag == 1 and width == 4:
            v = struct.unpack("<i", s)[0] / float(1 << 31)
        else:
            raise WavError("Formato WAV não suportado (tipo %d, %d bits)" % (tag, bits))
        out.append(float(v))
    out += [0.0] * (n - len(out))
    meta = {"rate": rate, "channels": channels, "bits": bits,
            "frames": len(pcm) // align, "float": tag == 3}
    return out, meta


def make_test_wav(samples: list[float], rate: int = 48000) -> bytes:
    """Gera um WAV 16 bits mono (usado nos testes)."""
    pcm = b"".join(struct.pack("<h", max(-32767, min(32767, int(round(x * 32767)))))
                   for x in samples)
    fmt = struct.pack("<HHIIHH", 1, 1, rate, rate * 2, 2, 16)
    return (b"RIFF" + struct.pack("<I", 4 + 8 + len(fmt) + 8 + len(pcm)) + b"WAVE"
            + b"fmt " + struct.pack("<I", len(fmt)) + fmt
            + b"data" + struct.pack("<I", len(pcm)) + pcm)
