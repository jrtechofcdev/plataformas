#!/usr/bin/env bash
# ============================================================================
#  build-deb.sh — gera o pacote cubesuite-linux_<versão>_all.deb
#
#  Uso:
#     ./packaging/build-deb.sh                          # pacote sem arquivos de fábrica
#     ./packaging/build-deb.sh /caminho/para/CubeSuite  # inclui BFI.bin e MICRORIG.bin
#
#  (a pasta CubeSuite é a do programa original para Windows; os arquivos
#   bin/BFI.bin e bin/MICRORIG.bin são usados pelo botão "Restaurar IRs de fábrica")
#
#  Precisa apenas de: bash, dpkg-deb (já vem no Debian/Ubuntu).
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(sed -n 's/^__version__ = "\(.*\)"/\1/p' "$ROOT/src/cubesuite_linux/__init__.py")"
PKG="cubesuite-linux"
OUT="$ROOT/dist"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
chmod 755 "$STAGE"

echo "==> Montando $PKG $VERSION"

# 1) Código Python + interface
install -d "$STAGE/usr/lib/$PKG"
cp -r "$ROOT/src/cubesuite_linux" "$STAGE/usr/lib/$PKG/"
find "$STAGE" -name '__pycache__' -prune -exec rm -rf {} +

# 2) Comando no terminal: cubesuite-linux
install -d "$STAGE/usr/bin"
cat > "$STAGE/usr/bin/$PKG" <<'EOF'
#!/bin/sh
# Inicia o CubeSuite Linux
export PYTHONPATH="/usr/lib/cubesuite-linux${PYTHONPATH:+:$PYTHONPATH}"
exec /usr/bin/python3 -m cubesuite_linux "$@"
EOF
chmod 755 "$STAGE/usr/bin/$PKG"

# 3) Atalho no menu de aplicativos + ícone
install -Dm644 "$ROOT/packaging/$PKG.desktop" "$STAGE/usr/share/applications/$PKG.desktop"
install -Dm644 "$ROOT/src/cubesuite_linux/web/icon.svg" \
  "$STAGE/usr/share/icons/hicolor/scalable/apps/$PKG.svg"

# 4) Arquivos de fábrica (opcional)
if [ "${1:-}" != "" ]; then
  for f in BFI.bin MICRORIG.bin; do
    src="$(find "$1" -type f -iname "$f" | head -n1 || true)"
    if [ -n "$src" ]; then
      install -Dm644 "$src" "$STAGE/usr/share/$PKG/factory/$f"
      echo "    + incluído $f"
    else
      echo "    ! $f não encontrado em $1"
    fi
  done
fi

# 5) Documentação
install -Dm644 "$ROOT/README.md" "$STAGE/usr/share/doc/$PKG/README.md"
cat > "$STAGE/usr/share/doc/$PKG/copyright" <<EOF
CubeSuite Linux — software independente, sem vínculo com Cuvave/M-VAVE/Sinco.
Criado por interoperabilidade a partir do protocolo do CubeSuite para Windows.
Arquivos em /usr/share/$PKG/factory (se existirem) pertencem ao fabricante.
EOF

# 6) Metadados do pacote
SIZE="$(du -sk "$STAGE/usr" | cut -f1)"
install -d "$STAGE/DEBIAN"
cat > "$STAGE/DEBIAN/control" <<EOF
Package: $PKG
Version: $VERSION
Section: sound
Priority: optional
Architecture: all
Depends: python3 (>= 3.9)
Recommends: chromium | google-chrome-stable | brave-browser | firefox-esr | firefox
Installed-Size: $SIZE
Maintainer: Jr_Tech_OFC <jr.tech.ofc@gmail.com>
Homepage: https://github.com/jrtechofcdev/plataformas
Description: Editor para a pedaleira Cuvave / M-VAVE Cube Baby
 Recriação para Linux do CubeSuite (Windows): edita os presets A/B/C
 (VOLUME, IR CAB, REVERB, MIX, FB, TIME, MOD, TONE, GAIN, TYPE),
 liga/desliga os blocos, importa IRs .wav para os 8 slots, restaura
 presets e IRs de fábrica e controla o USB Loopback. Comunica-se por
 USB-MIDI (ALSA), sem drivers extras.
EOF

cat > "$STAGE/DEBIAN/postinst" <<'EOF'
#!/bin/sh
set -e
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database -q /usr/share/applications || true
command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -q -t /usr/share/icons/hicolor || true
exit 0
EOF
chmod 755 "$STAGE/DEBIAN/postinst"

# remove o cache do Python criado durante o uso, para desinstalar limpo
cat > "$STAGE/DEBIAN/prerm" <<'EOF'
#!/bin/sh
set -e
rm -rf /usr/lib/cubesuite-linux/cubesuite_linux/__pycache__
exit 0
EOF
chmod 755 "$STAGE/DEBIAN/prerm"

find "$STAGE/usr" -type d -exec chmod 755 {} +
find "$STAGE/usr/lib" "$STAGE/usr/share" -type f -exec chmod 644 {} +

mkdir -p "$OUT"
DEB="$OUT/${PKG}_${VERSION}_all.deb"
dpkg-deb --root-owner-group --build "$STAGE" "$DEB" >/dev/null
echo "==> Pronto: $DEB"
echo "    Instale com:  sudo apt install ./$(basename "$DEB")"
