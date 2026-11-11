# Cube Remote · by Jr_Tech_OFC

App Android para controlar a pedaleira **Cube Baby** pelo cabo USB (OTG), em tempo real,
em pé ou deitado. Criado do zero por José Renato (Jr_Tech_OFC).
© 2026 José Renato · Jr_Tech_OFC. Todos os direitos reservados (veja `LICENSE`).

## Funções (versão 2.1 · modo culto)
Feito para mexer rápido e com precisão durante o culto, com botões grandes.
- **Palco** (tela principal, nunca rola):
  - **Presets A, B, C** em botões grandes (LED verde, azul, vermelho, como na pedaleira).
  - **Módulos 1, 2, 3** (IR CAB + REVERB, DELAY + MOD, AMP): um toque liga ou desliga no preset.
  - **10 controles** em blocos grandes com as cores e nomes do painel, nome completo, valor
    e o modelo do TYPE e do IR CAB. Em pé: 2 colunas x 5 linhas. Deitado: 5 colunas x 2 linhas.
- **Tela de ajuste** (toque em qualquer controle):
  - Valor gigante, slider largo e atalhos 0, 25, 50, 75, 100% (no MOD: Chorus, OFF, Phaser).
  - Botões **−** e **+** grandes: um toque = um passo; segurando, repete e acelera.
  - **Ativo / Zerado** (o MOD zera no centro) e **Valor anterior** (desfaz o ajuste feito ali).
  - Setas **‹ ›** passam para o controle anterior ou seguinte sem fechar a tela.
  - TYPE e IR CAB: os 9 modelos com número e nome do manual, escolha com um toque.
  - "O que é": explicação rápida e atalho para a aba Aprender.
  - O botão Voltar do Android fecha a tela de ajuste.
- **Afinador** em aba própria: nota gigante, ponteiro largo, cents, Hz, cordas E A D G B E,
  microfone ou entrada USB, A4 de 430 a 450 Hz.
  - Pela **entrada USB**, o app pausa os controles enquanto o afinador está aberto e reconecta
    sozinho ao sair. Motivo: a pedaleira é um único aparelho USB (áudio + MIDI). Para mandar os
    ajustes o app toma a interface MIDI, e o Android (driver snd-usb-audio do Linux) desliga junto
    a placa de áudio dela. O afinador USB devolve as interfaces ao Android para a placa voltar.
- **Ferramentas**: metrônomo com tap tempo, importação de IR (.wav), reenviar preset,
  ler presets, presets de fábrica e USB Loopback.
- **Aprender**: controles, módulos, combinações, os 9 TYPE e os 9 IR CAB, modos e receitas.
- **Ajustes**: orientação, vibração, afinador, conexão, log e Sobre.
- Desfazer e **trava de palco** (segurar o cadeado 1 s para destravar) no topo.

## Instalar
1. Copie `CubeRemote-2.1.1.apk` para o celular e abra (permita "fontes desconhecidas").
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
ANDROID_HOME=~/android-sdk ./build.sh        # gera dist/CubeRemote-2.1.1.apk
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
│   ├── css/app.css           layout (em pé, deitado e celulares pequenos)
│   ├── js/model.js           controles da pedaleira, nomes do TYPE e IR CAB, envio, desfazer
│   ├── js/controls.js        slider e chave liga/desliga
│   ├── js/stage.js           tela Palco e tela de ajuste
│   ├── js/tuner.js           aba Afinador
│   ├── js/learn-data.js      textos da aba Aprender e do "O que é"
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
