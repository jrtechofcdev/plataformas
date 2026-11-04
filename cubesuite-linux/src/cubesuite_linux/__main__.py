"""
__main__.py — Ponto de entrada: `cubesuite-linux` ou `python3 -m cubesuite_linux`

O que acontece ao abrir o programa:
  1. sobe um servidor local em 127.0.0.1 (porta livre aleatória);
  2. abre a interface numa janela de "app" do Chromium/Chrome/Brave/Edge
     (sem barra de endereço). Sem eles, usa o navegador padrão;
  3. quando a janela é fechada (sem sinal por ~20 s), o programa encerra.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import threading
import time
import webbrowser

from . import __version__
from .server import AppState, serve
from .transport import list_ports

APP_BROWSERS = ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable",
                "brave-browser", "microsoft-edge", "vivaldi"]


def open_window(url: str) -> None:
    for b in APP_BROWSERS:
        exe = shutil.which(b)
        if exe:
            profile = os.path.join(os.path.expanduser("~"), ".cache", "cubesuite-linux", "browser")
            subprocess.Popen([exe, "--app=" + url, "--user-data-dir=" + profile,
                              "--window-size=1180,860", "--class=cubesuite-linux",
                              "--no-first-run", "--no-default-browser-check"],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                             start_new_session=True)
            return
    webbrowser.open(url)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="cubesuite-linux",
                                 description="Editor da pedaleira Cube Baby para Linux")
    ap.add_argument("--simular", action="store_true",
                    help="usa uma pedaleira simulada (para testar sem o aparelho)")
    ap.add_argument("--porta-midi", default="",
                    help="força uma porta, ex.: /dev/snd/midiC1D0")
    ap.add_argument("--porta-http", type=int, default=0, help="porta do servidor local")
    ap.add_argument("--sem-janela", action="store_true",
                    help="não abre a janela; só mostra o endereço")
    ap.add_argument("--listar", action="store_true", help="lista as portas MIDI e sai")
    ap.add_argument("--version", action="version", version="%(prog)s " + __version__)
    a = ap.parse_args(argv)

    if a.listar:
        ports = list_ports()
        if not ports:
            print("Nenhuma porta MIDI encontrada.")
        for p in ports:
            print("%-22s %s" % (p.path, p.name))
        return 0

    app = AppState(simulate=a.simular, fixed_port=a.porta_midi)
    httpd, token = serve(app, port=a.porta_http)
    url = "http://127.0.0.1:%d/?t=%s" % (httpd.server_address[1], token)
    print("CubeSuite Linux %s rodando em: %s" % (__version__, url))
    print("Feche a janela ou pressione Ctrl+C para sair.")

    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    if not a.sem_janela:
        open_window(url)
    app.last_ping = time.monotonic() + 40   # tempo extra para a janela abrir
    try:
        while True:
            time.sleep(1)
            # a interface manda um "ping" a cada 3 s; sem ping por 20 s = janela fechada
            if not a.sem_janela and time.monotonic() - app.last_ping > 20:
                break
    except KeyboardInterrupt:
        pass
    app.disconnect()
    httpd.shutdown()
    return 0


if __name__ == "__main__":
    sys.exit(main())
