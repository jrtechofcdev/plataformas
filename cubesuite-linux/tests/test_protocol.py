"""
Testes automáticos — rode com:   python3 -m unittest discover -s tests -v
(a partir da pasta cubesuite-linux/)
"""

import os
import random
import struct
import sys
import threading
import tty
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from cubesuite_linux import device as D            # noqa: E402
from cubesuite_linux import protocol as P          # noqa: E402
from cubesuite_linux.simulator import SimulatedCube, SimulatedTransport  # noqa: E402
from cubesuite_linux.transport import RawMidiTransport  # noqa: E402
from cubesuite_linux.wav import make_test_wav, read_ir  # noqa: E402


class TestPacking(unittest.TestCase):
    def test_roundtrip(self):
        rnd = random.Random(1)
        for n in range(0, 300):
            data = bytes(rnd.randrange(256) for _ in range(n))
            packed = P.pack7(data)
            self.assertTrue(all(b < 0x80 for b in packed))
            self.assertEqual(P.unpack7(packed)[:n], data)

    def test_known_identify(self):
        pkt = P.req_identify()
        self.assertEqual(pkt, bytes([0x59, 0x00, 0x11, 0, 0, 0, 0xFF]))
        # 7 bytes = 56 bits -> 8 grupos de 7 bits
        self.assertEqual(P.to_sysex(pkt)[0], 0xF0)
        self.assertEqual(len(P.to_sysex(pkt)), 10)

    def test_checksum(self):
        self.assertEqual(P.checksum(b""), 0xFF)
        self.assertEqual(P.checksum(b"\x01\x02"), 0xFC)
        cmd, payload = P.parse_packet(P.build_packet(0x23, b"abc"))
        self.assertEqual((cmd, payload), (0x23, b"abc"))
        bad = bytearray(P.build_packet(0x23, b"abc"))
        bad[-1] ^= 1
        with self.assertRaises(P.ProtocolError):
            P.parse_packet(bytes(bad))

    def test_write_layout(self):
        pkt = P.req_write(5, 0x80000003, b"\x07")
        # 59 00 | 22 | len=9 | região 5 | addr | tam=1 | dado | chk
        self.assertEqual(pkt[:6], bytes([0x59, 0, 0x22, 9, 0, 0]))
        self.assertEqual(pkt[6], 5)
        self.assertEqual(struct.unpack("<I", pkt[7:11])[0], 0x80000003)
        self.assertEqual(pkt[11:14], b"\x01\x00\x00")
        self.assertEqual(pkt[14], 7)


class TestDeviceSimulated(unittest.TestCase):
    def setUp(self):
        self.cube = SimulatedCube(product_id=0x4F06)
        self.dev = D.CubeDevice(SimulatedTransport(self.cube))
        self.dev.connect("sim")

    def test_identify_and_info(self):
        self.assertEqual(self.dev.info.model, "Cube Baby")
        self.assertEqual(self.dev.info.generation, 2)
        self.assertEqual(self.dev.info.name, "CubeBaby")
        self.assertEqual(self.dev.info.version, "20240615010")
        self.assertEqual(self.dev.info.ir_base, 0x60000)

    def test_presets(self):
        p = self.dev.read_presets()
        self.assertEqual(p[0]["type"], 2)
        self.assertEqual(p[0]["volume"], 38)
        self.dev.set_param(1, "gain", 6)
        self.assertEqual(self.cube.presets[16 + 1], 6)
        self.assertEqual(self.cube.log[-1][2], 0x80000000 | 17)   # endereço "ao vivo"
        self.dev.set_param(2, "swB", 0)
        self.assertEqual(self.dev.read_presets()[2]["swB"], 0)
        self.dev.set_param(0, "mix", 999)                        # limitado ao máximo
        self.assertEqual(self.dev.read_presets()[0]["mix"], 118)
        self.dev.factory_reset_presets()
        self.assertEqual(bytes(self.cube.presets), D.FACTORY_PRESETS)

    def test_loopback(self):
        self.assertFalse(self.dev.get_loopback())
        self.dev.set_loopback(True)
        self.assertEqual(self.cube.log[-1][1:], (0, 0x3000, b"\x01"))
        self.assertTrue(self.dev.get_loopback())
        self.dev.set_loopback(False)
        self.assertFalse(self.dev.get_loopback())

    def test_ir_preview_and_save(self):
        samples = [((-1) ** i) * (0.9 ** i) for i in range(512)]
        self.dev.ir_preview(samples, 50)
        self.assertEqual(self.cube.ram[0x764], 1)
        self.assertAlmostEqual(struct.unpack("<f", self.cube.ram[0x768:0x76C])[0], 0.5)
        got = struct.unpack("<512f", self.cube.ram[0x76C:0x76C + 2048])
        self.assertAlmostEqual(got[3], samples[3], places=6)

        seen = []
        self.dev.ir_save(2, samples, 80, lambda d, t: seen.append((d, t)))
        base = 0x60000 + 2 * 0x1000
        blk = bytes(self.cube.flash[base:base + D.IR_BLOCK_LEN])
        self.assertEqual(blk[:4], b"\0\0\0\0")
        self.assertAlmostEqual(struct.unpack("<f", blk[4:8])[0], 0.8, places=6)
        self.assertEqual(seen[-1][0], seen[-1][1])

    def test_factory_ir(self):
        fake = bytes(range(256)) * (0x11000 // 256)
        self.dev.factory_ir(fake)
        self.assertEqual(bytes(self.cube.flash[0x60000:0x68000]), fake[0x9000:0x11000])
        with self.assertRaises(D.DeviceError):
            self.dev.factory_ir(b"curto")

    def test_real_factory_file_if_present(self):
        f = os.environ.get("CUBE_BFI")
        if not f or not os.path.isfile(f):
            self.skipTest("defina CUBE_BFI=/caminho/BFI.bin para testar com o arquivo real")
        data = Path(f).read_bytes()
        self.dev.factory_ir(data)
        self.assertEqual(bytes(self.cube.flash[0x60000:0x68000]), data[0x9000:0x11000])

    def test_old_generation_has_no_presets(self):
        cube = SimulatedCube(product_id=0x272E)
        dev = D.CubeDevice(SimulatedTransport(cube))
        dev.connect("sim")
        self.assertEqual(dev.info.generation, 1)
        with self.assertRaises(D.DeviceError):
            dev.read_presets()
        dev.ir_preview([0.0] * 512, 50)   # IR funciona nas duas gerações


class TestWav(unittest.TestCase):
    def test_16bit(self):
        s, meta = read_ir(make_test_wav([0.5, -0.5, 1.0]))
        self.assertEqual(len(s), 512)
        self.assertAlmostEqual(s[0], 0.5, places=3)
        self.assertAlmostEqual(s[2], 1.0, places=4)
        self.assertEqual(s[3], 0.0)
        self.assertEqual(meta["rate"], 48000)

    def test_24bit_stereo_float(self):
        pcm = b"".join(struct.pack("<i", v)[:3] + struct.pack("<i", 0)[:3]
                       for v in (0x400000, -0x400000))
        fmt = struct.pack("<HHIIHH", 1, 2, 44100, 44100 * 6, 6, 24)
        wav = (b"RIFF" + struct.pack("<I", 36 + len(pcm)) + b"WAVEfmt " + struct.pack("<I", 16) + fmt
               + b"data" + struct.pack("<I", len(pcm)) + pcm)
        s, _ = read_ir(wav)
        self.assertAlmostEqual(s[0], 0.5)
        self.assertAlmostEqual(s[1], -0.5)
        pcmf = struct.pack("<2f", 0.25, -0.75)
        fmtf = struct.pack("<HHIIHH", 3, 1, 48000, 48000 * 4, 4, 32)
        wavf = (b"RIFF" + struct.pack("<I", 36 + len(pcmf)) + b"WAVEfmt " + struct.pack("<I", 16) + fmtf
                + b"data" + struct.pack("<I", len(pcmf)) + pcmf)
        s, meta = read_ir(wavf)
        self.assertEqual(s[:2], [0.25, -0.75])
        self.assertTrue(meta["float"])


class TestRawMidiOverPty(unittest.TestCase):
    """Testa o transporte de verdade (arquivo de dispositivo) usando um pty."""

    def test_end_to_end(self):
        master, slave = os.openpty()
        tty.setraw(master)
        tty.setraw(slave)
        cube = SimulatedCube(product_id=0x4F09)
        stop = threading.Event()

        def device_side():
            buf = bytearray()
            while not stop.is_set():
                try:
                    chunk = os.read(master, 4096)
                except OSError:
                    return
                buf += chunk
                while 0xF7 in buf:
                    end = buf.index(0xF7)
                    start = buf.rfind(0xF0, 0, end)
                    msg = bytes(buf[start:end + 1])
                    del buf[:end + 1]
                    reply = P.to_sysex(cube.handle(P.from_sysex(msg)))
                    # envia em pedaços, com "lixo" MIDI no meio, como um aparelho real
                    os.write(master, b"\xFE" + reply[:5])
                    os.write(master, reply[5:])

        th = threading.Thread(target=device_side, daemon=True)
        th.start()
        try:
            t = RawMidiTransport(os.ttyname(slave))
            dev = D.CubeDevice(t)
            info = dev.connect("pty")
            self.assertEqual(info.product_id, 0x4F09)
            dev.factory_reset_presets()
            self.assertEqual(bytes(cube.presets), D.FACTORY_PRESETS_4F09)
            data = dev.read(0, 0x2100, 20)
            self.assertEqual(struct.unpack("<5I", data)[1], 0x4F09)
            t.close()
        finally:
            stop.set()
            os.close(slave)
            os.close(master)


if __name__ == "__main__":
    unittest.main()
