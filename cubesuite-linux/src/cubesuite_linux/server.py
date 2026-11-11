"""
server.py — Servidor local que liga a interface (HTML) à pedaleira
==================================================================

A interface é uma página HTML/CSS/JS (pasta web/) aberta numa janela do
navegador. Ela conversa com este servidor por pedidos HTTP em
http://127.0.0.1:<porta>/api/...  — só o seu próprio computador acessa,
e cada pedido precisa de um "token" secreto gerado a cada execução.
"""

from __future__ import annotations

import json
import os
import secrets
import threading
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from . import __version__
from . import device as D
from .transport import MidiPort, TransportError, list_ports, sort_ports
from .wav import WavError, read_ir

WEB_DIR = Path(__file__).resolve().parent / "web"
USER_DATA = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local/share")) / "cubesuite-linux"
FACTORY_DIRS = [USER_DATA / "factory",
                Path("/usr/share/cubesuite-linux/factory"),
                Path(__file__).resolve().parent / "factory"]

MIME = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
        ".js": "application/javascript; charset=utf-8", ".svg": "image/svg+xml",
        ".png": "image/png", ".ico": "image/x-icon"}


class AppState:
    """Tudo que o servidor guarda enquanto o programa está aberto."""

    def __init__(self, simulate: bool = False, fixed_port: str = ""):
        self.simulate = simulate
        self.fixed_port = fixed_port
        self.dev: D.CubeDevice | None = None
        self.ir_samples: list[float] | None = None
        self.ir_meta: dict = {}
        self.ir_name = ""
        self.progress = {"active": False, "done": 0, "total": 0, "label": ""}
        self.last_ping = time.monotonic()
        self.log: list[str] = []
        self.lock = threading.Lock()

    # -- conexão ---------------------------------------------------------
    def connect(self, path: str = "") -> dict:
        self.disconnect()
        if self.simulate:
            from .simulator import SimulatedCube, SimulatedTransport
            dev = D.CubeDevice(SimulatedTransport(SimulatedCube()))
            dev.connect("simulador", "Cube Baby (simulada)")
            self.dev = dev
            self.log = ["Modo simulação: nenhuma pedaleira real é usada."]
            return self.state()
        path = path or self.fixed_port
        ports = sort_ports(list_ports())
        if path:
            match = [p for p in ports if p.path == path]
            ports = match or [MidiPort(path, -1, -1, path)]
        if not ports:
            self.log = ["Nenhuma porta MIDI encontrada. A pedaleira está ligada "
                        "no USB? (verifique com: ls /dev/snd/)"]
            return self.state()
        dev, self.log = D.auto_connect(ports)
        self.dev = dev
        return self.state()

    def disconnect(self) -> None:
        if self.dev:
            try:
                self.dev.close()
            except Exception:
                pass
        self.dev = None

    def state(self, with_presets: bool = True) -> dict:
        st = {"version": __version__, "simulate": self.simulate,
              "connected": self.dev is not None, "log": self.log,
              "params": [p.__dict__ for p in D.PARAMS],
              "switches": [p.__dict__ for p in D.SWITCHES],
              "presetNames": D.PRESET_NAMES, "irSlots": D.IR_SLOTS,
              "ports": [p.to_dict() for p in list_ports()],
              "ir": self.ir_public()}
        if self.dev:
            st["info"] = self.dev.info.to_dict()
            if self.dev.info.generation == 2 and with_presets:
                st["presets"] = self.dev.read_presets()
                st["loopback"] = self.dev.get_loopback()
            st["factoryFileFound"] = self.find_factory() is not None
        return st

    def ir_public(self) -> dict | None:
        if self.ir_samples is None:
            return None
        return {"name": self.ir_name, "meta": self.ir_meta,
                "samples": [round(x, 6) for x in self.ir_samples]}

    def need_dev(self) -> D.CubeDevice:
        if not self.dev:
            raise D.DeviceError("Pedaleira não conectada")
        return self.dev

    # -- arquivos de fábrica ----------------------------------------------
    def factory_name(self) -> str:
        dev = self.need_dev()
        return "MICRORIG.bin" if dev.info.product_id == 0x4F09 else "BFI.bin"

    def find_factory(self) -> Path | None:
        if not self.dev:
            return None
        name = self.factory_name()
        for d in FACTORY_DIRS:
            p = d / name
            if p.is_file():
                return p
        return None

    # -- progresso ----------------------------------------------------------
    def start_progress(self, label: str):
        self.progress = {"active": True, "done": 0, "total": 1, "label": label}

        def cb(done, total):
            self.progress.update(done=done, total=max(total, 1))
        return cb

    def end_progress(self):
        self.progress = {"active": False, "done": 0, "total": 0, "label": ""}


def make_handler(app: AppState, token: str):
    class Handler(BaseHTTPRequestHandler):
        server_version = "CubeSuiteLinux/" + __version__

        def log_message(self, fmt, *args):   # silencioso
            pass

        # ---------------- respostas ----------------
        def _send(self, code: int, body: bytes, ctype: str):
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(body)

        def _json(self, obj, code: int = 200):
            self._send(code, json.dumps(obj).encode(), "application/json")

        # ---------------- arquivos estáticos ----------------
        def do_GET(self):
            path = urlparse(self.path).path
            if path == "/":
                path = "/index.html"
            f = (WEB_DIR / path.lstrip("/")).resolve()
            if WEB_DIR not in f.parents or not f.is_file():
                return self._send(404, b"nao encontrado", "text/plain")
            self._send(200, f.read_bytes(), MIME.get(f.suffix, "application/octet-stream"))

        # ---------------- API ----------------
        def do_POST(self):
            if not secrets.compare_digest(self.headers.get("X-Token", ""), token):
                return self._json({"error": "token inválido"}, 403)
            route = urlparse(self.path).path
            n = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(n) if n else b""
            ctype = self.headers.get("Content-Type", "")
            body = {}
            if ctype.startswith("application/json") and raw:
                body = json.loads(raw.decode())
            app.last_ping = time.monotonic()
            try:
                result = self.route(route, body, raw)
                self._json(result if result is not None else {"ok": True})
            except (D.DeviceError, WavError, ValueError) as e:
                self._json({"error": str(e)}, 400)
            except TransportError as e:
                app.disconnect()
                self._json({"error": str(e), "disconnected": True}, 400)
            except Exception as e:   # erro inesperado: mostra detalhes
                traceback.print_exc()
                self._json({"error": "Erro interno: %s" % e}, 500)
            finally:
                if route in ("/api/ir/save", "/api/ir/factory"):
                    app.end_progress()

        def route(self, route: str, b: dict, raw: bytes):
            if route == "/api/ping":
                return {"ok": True}
            if route == "/api/progress":
                return app.progress
            if route == "/api/state":
                return app.state()
            if route == "/api/connect":
                return app.connect(b.get("path", ""))
            if route == "/api/disconnect":
                app.disconnect()
                return app.state()
            if route == "/api/presets":
                return {"presets": app.need_dev().read_presets()}
            if route == "/api/param":
                app.need_dev().set_param(int(b["preset"]), str(b["key"]), int(b["value"]))
                return {"ok": True}
            if route == "/api/send-preset":
                return {"presets": app.need_dev().send_preset(int(b["preset"]), list(b["values"]))}
            if route == "/api/factory-presets":
                return {"presets": app.need_dev().factory_reset_presets()}
            if route == "/api/loopback":
                app.need_dev().set_loopback(bool(b["on"]))
                return {"loopback": app.need_dev().get_loopback()}
            if route == "/api/ir/load":
                # corpo = bytes do .wav ; nome do arquivo no cabeçalho X-File-Name
                samples, meta = read_ir(raw)
                app.ir_samples, app.ir_meta = samples, meta
                app.ir_name = unquote(self.headers.get("X-File-Name", "ir.wav"))
                if app.dev and self.headers.get("X-Preview") == "1":
                    app.dev.ir_preview(samples, int(self.headers.get("X-Distance", "50")))
                return {"ir": app.ir_public(), "previewed": bool(app.dev)}
            if route == "/api/ir/preview":
                if app.ir_samples is None:
                    raise D.DeviceError("Escolha um arquivo .wav primeiro")
                app.need_dev().ir_preview(app.ir_samples, int(b.get("distance", 50)))
                return {"ok": True}
            if route == "/api/ir/distance":
                app.need_dev().ir_set_distance(int(b["distance"]))
                return {"ok": True}
            if route == "/api/ir/save":
                if app.ir_samples is None:
                    raise D.DeviceError("Escolha um arquivo .wav primeiro")
                cb = app.start_progress("Gravando IR no slot %d" % (int(b["slot"]) + 1))
                app.need_dev().ir_save(int(b["slot"]), app.ir_samples,
                                       int(b.get("distance", 50)), cb)
                return {"ok": True}
            if route == "/api/ir/factory":
                dev = app.need_dev()
                if raw and not ctype.startswith("application/json"):
                    data = raw
                    # guarda uma cópia para não precisar escolher de novo
                    dest = USER_DATA / "factory" / app.factory_name()
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    dest.write_bytes(data)
                else:
                    p = app.find_factory()
                    if not p:
                        raise D.DeviceError("NEED_FACTORY_FILE:" + app.factory_name())
                    data = p.read_bytes()
                cb = app.start_progress("Restaurando IRs de fábrica")
                dev.factory_ir(data, cb)
                return {"ok": True}
            raise ValueError("rota desconhecida: " + route)

    return Handler


def serve(app: AppState, host: str = "127.0.0.1", port: int = 0):
    token = secrets.token_urlsafe(24)
    httpd = ThreadingHTTPServer((host, port), make_handler(app, token))
    httpd.daemon_threads = True
    return httpd, token
