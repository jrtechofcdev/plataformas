"""Ponte de teste: simulador Python (versão PC) falando por stdin/stdout em hex."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "cubesuite-linux" / "src"))
from cubesuite_linux import protocol as P
from cubesuite_linux.simulator import SimulatedCube

cube = SimulatedCube(product_id=int(sys.argv[1], 16) if len(sys.argv) > 1 else 0x4F06)
for line in sys.stdin:
    line = line.strip()
    if line == "DUMP":   # devolve os presets e um pedaço da RAM/flash para conferência
        print(bytes(cube.presets).hex() + " " + bytes(cube.ram[0x764:0x76C]).hex() + " " + bytes(cube.flash[0x0060000:0x0060010]).hex() + " " + bytes(cube.flash[0x3000:0x3001]).hex(), flush=True)
        continue
    r = cube.handle(P.from_sysex(bytes.fromhex(line)))
    print(P.to_sysex(r).hex() if r is not None else "", flush=True)   # "" = pedaleira ignorou
