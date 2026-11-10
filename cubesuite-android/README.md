# 📱 Cube Remote — controle da Cube Baby pelo celular (Android)

App Android simples para mexer na pedaleira **Cuvave / M-VAVE Cube Baby** pelo **cabo USB (OTG)**,
em tempo real, sem precisar se abaixar. Usa o mesmo protocolo descoberto para o CubeSuite Linux
(pasta `../cubesuite-linux`).

## ✨ Funções
- Presets **A / B / C**: VOLUME, IR CAB, REVERB, MIX, FB, TIME, MOD, TONE, GAIN, TYPE
  (sliders grandes + botões − / +). Cada toque vai **na hora** para a pedaleira.
- Liga/desliga dos blocos **A (IR/Reverb)**, **B (Delay/Mod)** e **C (Amp)** em botões grandes.
- IR: escolher `.wav`, ouvir a prévia, ajustar a distância do microfone e salvar em 1 dos 8 slots.
- USB Loopback, ler presets da pedaleira, restaurar presets de fábrica.
- A tela **não apaga** enquanto o app está aberto (bom para palco/ensaio).

## 🔌 Como o app se conecta (versão 1.1)
1. **MIDI do Android** — testa todos os aparelhos MIDI e todas as portas de cada um.
2. **USB direto** (plano B) — se o celular não listar a pedaleira como MIDI, o app fala direto com o
   USB (pacotes USB-MIDI de 4 bytes). O Android pode pedir **permissão USB**: toque em *Permitir*.

## 📋 Log
Botão **📋 Log** no topo (também na tela “Conecte a Cube Baby”):
- mostra cada passo da conexão e cada pacote enviado (TX) e recebido (RX), ao vivo;
- **🔍 Diagnóstico** lista tudo que o celular enxerga (aparelhos MIDI, USB, interfaces, endpoints, permissões);
- **📤 Compartilhar** envia o log por WhatsApp/e-mail; **📄 Copiar** copia para a área de transferência;
- o log também é salvo no arquivo interno `cuberemote.log` (até 1 MB).

## 📲 Instalar
1. Copie `CubeRemote-1.1.0.apk` para o celular e abra o arquivo.
2. Permita “instalar apps de fontes desconhecidas” quando o Android pedir.
3. Ligue a pedaleira no celular com **cabo USB + adaptador OTG** e abra o **Cube Remote**.

Requisitos: **Android 6.0 ou mais novo**, com suporte a USB OTG (quase todos os celulares atuais).

> *Dica:* o celular alimenta a pedaleira pelo OTG, então a bateria do celular gasta um pouco mais.

## 🛠️ Gerar o APK (sem Android Studio)
Precisa de Java (JDK 17+) e do Android SDK com `platforms;android-34` e `build-tools;35.0.0`:

```bash
sdkmanager "platforms;android-34" "build-tools;35.0.0"
ANDROID_HOME=~/android-sdk ./build.sh        # gera dist/CubeRemote-1.1.0.apk
```

A assinatura usa `~/.cuberemote.jks` (criada na primeira vez). **Guarde esse arquivo:** para
atualizar o app sem desinstalar, o APK novo precisa da mesma chave.

## 📁 Organização
```
cubesuite-android/
├── AndroidManifest.xml          → nome do app, permissões (MIDI/USB), abrir ao plugar a pedaleira
├── assets/www/                  → INTERFACE (edite aqui): index.html, style.css, app.js
├── src/com/jrtechofc/cuberemote/
│   ├── MainActivity.java        → tela + ponte JavaScript ↔ pedaleira, busca automática do USB
│   ├── MidiLink.java            → método 1: SysEx pelo android.media.midi
│   ├── UsbRawLink.java          → método 2: USB direto (pacotes USB-MIDI)
│   ├── SysexAssembler.java      → junta os pedaços recebidos em mensagens SysEx
│   ├── AppLog.java              → sistema de log (tela + arquivo)
│   ├── CubeDevice.java          → operações (presets, IR, loopback) — mesmo mapa de memória do PC
│   └── CubeProtocol.java        → formato das mensagens (7 bits, pacote 59 00, checksum)
├── res/                         → ícone, tema escuro, filtro USB
├── tests/                       → teste do Java contra o simulador Python da versão PC
└── build.sh                     → compila e assina o APK
```

### ✏️ Personalizar
- **Cores:** `assets/www/style.css`, bloco `:root` (ex.: `--accent: #33eab8;`).
- **Textos e nomes dos knobs:** `assets/www/index.html` e as listas `PARAMS` / `BLOCKS` em `assets/www/app.js`.
- **Ver a tela no PC:** abra `assets/www/index.html` no navegador — roda um simulador.
- Depois de editar, rode `./build.sh` de novo.

## ✅ Testes
- `CubeDevice`/`CubeProtocol` (Java) testados contra o simulador da versão PC:
  `javac -d /tmp/t src/com/jrtechofc/cuberemote/Cube*.java tests/DeviceTest.java && java -cp /tmp/t DeviceTest tests/sim_bridge.py`
- Interface testada em tela de celular (Chromium, Pixel 7).
- **Ainda não testado num celular real com a pedaleira.**

## 🩺 Problemas comuns
| Situação | O que fazer |
|---|---|
| “Nenhum aparelho MIDI encontrado” | Confira o adaptador OTG e o cabo (precisa passar dados). Em alguns celulares é preciso ativar “OTG” nas configurações. |
| Android pergunta qual app usar | Escolha **Cube Remote** (e “sempre”, se quiser que abra sozinho ao plugar). |
| Não conectou | Abra **📋 Log → 🔍 Diagnóstico → 📤 Compartilhar** e envie o texto. |
| Conectou, mas os knobs não respondem | Feche outros apps MIDI e toque em **Mais → Reconectar**. |
