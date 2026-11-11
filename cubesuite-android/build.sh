#!/usr/bin/env bash
# ============================================================================
#  build.sh — gera o APK do Cube Remote SEM Android Studio / Gradle
#
#  Precisa de: Java (JDK 17+) e o Android SDK com:
#     platforms;android-34   e   build-tools;35.0.0
#  (instale com:  sdkmanager "platforms;android-34" "build-tools;35.0.0")
#
#  Uso:   ANDROID_HOME=~/android-sdk ./build.sh
#  Saída: dist/CubeRemote-<versão>.apk
#
#  A assinatura usa a chave em $KEYSTORE (padrão ~/.cuberemote.jks). Ela é
#  criada na primeira vez. GUARDE esse arquivo: para atualizar o app no
#  celular sem desinstalar, o APK novo precisa ser assinado com a MESMA chave.
# ============================================================================
set -euo pipefail

VERSION_NAME="2.1.1"
VERSION_CODE=8
MIN_SDK=23        # Android 6.0 (primeira versão com MIDI USB)
TARGET_SDK=34

ROOT="$(cd "$(dirname "$0")" && pwd)"
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/android-sdk}}"
BT="$SDK/build-tools/35.0.0"
JAR="$SDK/platforms/android-34/android.jar"
KEYSTORE="${KEYSTORE:-$HOME/.cuberemote.jks}"
KEYPASS="${KEYPASS:-cuberemote}"
B="$ROOT/build"
[ -f "$JAR" ] || { echo "android.jar não encontrado em $SDK (defina ANDROID_HOME)"; exit 1; }

rm -rf "$B" && mkdir -p "$B/gen" "$B/classes" "$B/dex" "$ROOT/dist"

echo "==> 1/6 Compilando recursos (aapt2)"
"$BT/aapt2" compile --dir "$ROOT/res" -o "$B/res.zip"
"$BT/aapt2" link -o "$B/base.apk" -I "$JAR" \
  --manifest "$ROOT/AndroidManifest.xml" -A "$ROOT/assets" \
  --java "$B/gen" --min-sdk-version $MIN_SDK --target-sdk-version $TARGET_SDK \
  --version-code $VERSION_CODE --version-name $VERSION_NAME "$B/res.zip"

echo "==> 2/6 Compilando Java"
javac -nowarn -Xlint:-options -source 8 -target 8 -encoding UTF-8 \
  -bootclasspath "$JAR:$BT/core-lambda-stubs.jar" -d "$B/classes" \
  $(find "$ROOT/src" "$B/gen" -name '*.java')

echo "==> 3/6 Convertendo para DEX (d8)"
"$BT/d8" --release --min-api $MIN_SDK --lib "$JAR" --output "$B/dex" $(find "$B/classes" -name '*.class')

echo "==> 4/6 Montando o APK"
(cd "$B/dex" && zip -q -u "$B/base.apk" classes.dex)
"$BT/zipalign" -f -p 4 "$B/base.apk" "$B/aligned.apk"

echo "==> 5/6 Chave de assinatura"
if [ ! -f "$KEYSTORE" ]; then
  keytool -genkeypair -keystore "$KEYSTORE" -storepass "$KEYPASS" -keypass "$KEYPASS" \
    -alias cuberemote -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=Jr_Tech_OFC, O=Jr_Tech_OFC, C=BR" >/dev/null 2>&1
  echo "    chave nova criada em $KEYSTORE (guarde este arquivo!)"
fi

echo "==> 6/6 Assinando"
OUT="$ROOT/dist/CubeRemote-$VERSION_NAME.apk"
"$BT/apksigner" sign --ks "$KEYSTORE" --ks-pass "pass:$KEYPASS" --key-pass "pass:$KEYPASS" \
  --out "$OUT" "$B/aligned.apk"
"$BT/apksigner" verify "$OUT"
echo "==> Pronto: $OUT"
