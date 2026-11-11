# Cube Remote · by Jr_Tech_OFC

App Android para controlar a pedaleira **Cube Baby** pelo cabo USB (OTG), em tempo real,
em pé ou deitado. Criado do zero por José Renato (Jr_Tech_OFC).
© 2026 José Renato · Jr_Tech_OFC. Todos os direitos reservados (veja `LICENSE`).

## Funções (versão 2.0)
- **Tela Pedal**: réplica do painel com os nomes e cores da pedaleira (VOLUME branco; IR CAB e
  REVERB verdes; MIX, FB, TIME e MOD azuis; TONE, GAIN e TYPE vermelhos). Nunca rola a tela.
  - Em pé: footswitches à esquerda e knobs em coluna, como a pedaleira em pé.
  - Deitado: knobs em linha e footswitches embaixo, como a pedaleira no chão.
  - **Knobs ou sliders** (Ajustes). O valor só muda depois de um arrasto curto; um toque simples
    abre o ajuste fino (slider grande, botões − e +, chave ativo/zerado).
  - **Chave ativo/zerado** em cada controle; o MOD zera no centro (manual do fabricante).
  - **Footswitch A, B, C**: toque escolhe o preset em edição (LED verde, azul, vermelho).
  - **Módulos 1, 2 e 3** (IR CAB/REVERB, DELAY/MOD, AMP) com chave liga/desliga por preset.
  - Botão **"!"** em cada controle e footswitch: o que é, como usar, com o que combina.
  - **Afinador** na própria tela: os LEDs dos knobs acendem como no afinador da pedaleira
    (E A D G B E e indicadores baixo/afinado/alto), com nota, cents e Hz precisos.
    Fonte: microfone do celular ou entrada de áudio USB da pedaleira (experimental).
  - Desfazer, Enviar preset completo e **trava de palco** (segurar o cadeado 1 s para destravar).
- **Aprender**: todos os controles, módulos e combinações, os 9 modelos do TYPE e os 9 gabinetes do
  IR CAB com número e nome do manual, os modos da pedaleira e receitas aplicáveis com um toque.
- **Ferramentas**: metrônomo com tap tempo, importação de IR (.wav), presets e USB Loopback.
- **Ajustes**: estilo dos controles, orientação, vibração, afinador, conexão, log e Sobre.

## Instalar
1. Copie `CubeRemote-2.0.0.apk` para o celular e abra (permita "fontes desconhecidas").
   Instala por cima das versões anteriores (mesma chave de assinatura).
2. Ligue a pedaleira com cabo USB + adaptador OTG. O app conecta sozinho.
3. Na primeira vez que abrir o afinador, permita o uso do microfone.

Requisitos: Android 6.0 ou mais novo com USB OTG.

## Protocolo (confirmado na pedaleira real)
Cabeçalho `00 59`, comandos 0x11 (identificar), 0x21, 0x22, 0x23, SysEx com empacotamento de 7 bits,
via USB direto (pacotes USB-MIDI). A pedaleira se identifica como `SINCO-CubeBaby`.
Presets na região 5 (16 bytes por preset): TYPE, GAIN, TONE, REVERB, FB, VOLUME, TIME, MIX, MOD,
IR CAB e os módulos 1, 2 e 3 nos bytes 10, 11 e 12.

## Gerar o APK (sem Android Studio)
```bash
sdkmanager "platforms;android-34" "build-tools;35.0.0"
ANDROID_HOME=~/android-sdk ./build.sh        # gera dist/CubeRemote-2.0.0.apk
```
A assinatura usa `~/.cuberemote.jks`. Guarde esse arquivo: sem ele, uma versão nova não instala por cima.

## Organização
```
cubesuite-android/
├── DESIGN.md                 direção visual (cores, fontes, ícones, regras de toque)
├── LICENSE                   direitos autorais e licenças de terceiros (fontes)
├── assets/www/               INTERFACE
│   ├── index.html
│   ├── css/tokens.css        cores, fontes e medidas (edite aqui para mudar o visual)
│   ├── css/app.css           layout (em pé e deitado)
│   ├── js/model.js           controles da pedaleira, nomes do TYPE e IR CAB, envio, desfazer
│   ├── js/controls.js        knob e slider
│   ├── js/pedal.js           tela Pedal, ajuste fino e botão "!"
│   ├── js/tuner.js           afinador
│   ├── js/learn-data.js      textos da aba Aprender e dos botões "!"
│   ├── js/learn.js, tools.js, settings.js, app.js, icons.js, bridge.js
│   └── fonts/                Barlow e Barlow Condensed (SIL OFL)
├── src/com/jrtechofc/cuberemote/
│   ├── MainActivity.java     tela, ponte JavaScript, conexão, afinador, orientação
│   ├── CubeDevice.java       operações da pedaleira
│   ├── CubeProtocol.java     formato das mensagens
│   ├── MidiLink.java / UsbRawLink.java / SysexAssembler.java   transporte USB
│   ├── PitchDetector.java    detecção de nota (YIN)
│   ├── TunerEngine.java      gravação de áudio do afinador
│   └── AppLog.java           log
├── tests/                    testes no computador (protocolo e afinador)
└── build.sh                  compila e assina o APK
```

### Personalizar
- Cores e fontes: `assets/www/css/tokens.css`.
- Nomes e textos explicativos: `assets/www/js/model.js` e `assets/www/js/learn-data.js`.
- Ver a interface no computador: abra `assets/www/index.html` no Chrome (roda com um simulador).

## Testes
```bash
J=~/android-sdk/platforms/android-34/android.jar
javac -cp $J -d /tmp/t src/com/jrtechofc/cuberemote/{CubeProtocol,CubeDevice,SysexAssembler,UsbRawLink,PitchDetector}.java tests/*.java
java -cp /tmp/t:$J DeviceTest tests/sim_bridge.py     # protocolo contra o simulador da versão PC
java -cp /tmp/t PitchDetectorTest                     # afinador: erro máximo < 1 cent
```
