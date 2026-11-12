# Cube Remote · by Jr_Tech_OFC

App Android para controlar a pedaleira **Cube Baby** pelo cabo USB (OTG), em tempo real,
em pé ou deitado. Criado do zero por José Renato (Jr_Tech_OFC).
© 2026 José Renato · Jr_Tech_OFC. Todos os direitos reservados (veja `LICENSE`).

## Funções (versão 2.5)
Feito para mexer rápido e com precisão durante o culto, com botões grandes.
- **Palco** (tela principal, nunca rola):
  - **Presets A, B, C** em botões grandes (LED verde, azul, vermelho, como na pedaleira).
  - **Módulos 1, 2, 3** (IR CAB + REVERB, DELAY + MOD, AMP): um toque liga ou desliga no preset.
  - **10 controles** em blocos grandes com as cores e nomes do painel, nome completo, valor
    e o modelo do TYPE e do IR CAB. Em pé: 2 colunas x 5 linhas. Deitado: 5 colunas x 2 linhas.
- **Tela de ajuste** (toque em qualquer controle):
  - Valores em **passos reais da pedaleira** (GAIN 0 a 7; TONE, REVERB e MOD 0 a 15; TIME 0 a 31;
    MIX 0 a 118; VOLUME e FB 0 a 127), sempre de 1 em 1. Porcentagem é opcional em Ajustes.
  - GAIN, TONE e REVERB: um botão para cada posição.
  - Valor gigante, slider largo e atalhos 0, 25, 50, 75, 100% (no MOD: Chorus, OFF, Phaser).
  - Botões **−** e **+** grandes: um toque = um passo; segurando, repete mais rápido, sempre de 1 em 1.
  - **Ativo / Zerado** (o MOD zera no centro) e **Valor anterior** (desfaz o ajuste feito ali).
  - Setas **‹ ›** passam para o controle anterior ou seguinte sem fechar a tela.
  - TYPE e IR CAB: os 9 modelos com número e nome do manual, escolha com um toque.
  - "O que é": explicação rápida e atalho para a aba Aprender.
  - O botão Voltar do Android fecha a tela de ajuste.
- **Culto** (a tela para usar durante o culto):
  - **Setlist**: até 40 músicas na ordem, com tom, BPM, anotações e o som de A, B e C de cada
    uma (memórias ou fábrica, ou "manter como está"). **Próxima** e **Anterior** carregam os
    três footswitches de uma vez. Mostra a música atual, a seguinte e um pulso visual no BPM.
  - **Ao vivo**: **Boost de solo** (+5 a +60% de volume, opcionalmente liga o delay), **Mudo**,
    **Swell** (entrada suave) e **Fade out** (saída suave), de 1 a 12 segundos. Agem nos 3
    presets ao mesmo tempo porque o app não tem como saber qual footswitch está tocando;
    ao desligar, os volumes originais voltam.
  - **Pedal Bluetooth** (virador de páginas): direita e esquerda passam música, ou acionam
    Boost/Mudo, ou Swell/Fade. Opcional: os botões de volume do celular (e controles de selfie
    Bluetooth) funcionam como pedal. Funciona com a trava de palco ligada.
  - A setlist vai junto no backup das memórias. Arquivo do app: `setlist.json`.
- **Memórias** (10 sons guardados no celular, e **Criar memória** para ter até 60):
  - Cada memória tem botões grandes **A, B, C**: um toque carrega o som naquele footswitch
    (grava na pedaleira e confere). O botão fica marcado "atual" quando o preset já tem esse som.
  - Memória vazia: toque em A, B ou C para guardar o som atual daquele preset, com um nome.
  - Menu de cada memória: ver todos os valores, substituir, renomear, apagar, subir e descer.
  - **Presets de fábrica** sempre disponíveis como 3 memórias fixas, que não se apagam.
  - **Sons prontos para o culto** (js/sounds.js): Fundo Ambiente, Fundo Brilhante, Base Limpa,
    Base Crunch, Hinos da Harpa, Solo Cantado e Solo Distorção. Carregam em A/B/C, viram memória
    com um toque e aparecem na setlist. Para criar ou mudar um som, edite `js/sounds.js`.
  - Carregou errado? O **Desfazer** do topo volta o preset inteiro ao som anterior.
  - Os botões A, B, C do Palco mostram o nome da memória carregada em cada um.
  - **Biblioteca** (aba dentro de Memórias): sobe presets **em lote** (.zip com vários .json, ou vários
    .json de uma vez), separa por **categoria** (Worship e igreja, Limpo, Crunch e overdrive, Distorção e
    peso, Solo, Ambiente e efeitos, Violão), busca, situação (Para testar, Aprovados, Descartados).
    Cada preset: **Testar em A, B ou C**, **Aprovar e guardar** numa memória nova ou existente,
    Descartar, mudar a categoria. Presets com MOD 0 (chorus no máximo) têm o botão "Tirar o chorus".
    Formato do arquivo: veja o topo de `js/library.js`. Ignora presets de Cube Baby Bass e AC.
  - Backup: salvar na pasta Download, enviar (WhatsApp, e-mail, Drive) e importar
    (arquivo ou texto colado). Arquivo do app: `memorias.json`, com cópia automática `memorias.bak.json`.
- **Afinador** em aba própria: nota gigante, ponteiro ou **estroboscópio** (mostra menos de 1 cent),
  **afinações** Padrão, Meio tom abaixo, Um tom abaixo, Drop D, Drop C, Open G, DADGAD e Cromático,
  microfone ou entrada USB (pausa os controles enquanto aberto), A4 de 430 a 450 Hz.
- **Ferramentas**:
  - **Editor de IR**: abre um .wav (converte para 48 kHz) ou **lê o gabinete de um slot da pedaleira**;
    corte de grave, graves, médios, presença, corte de agudo e volume, com curva de resposta e
    **prévia ao vivo**. Antes de gravar, guarda uma cópia do slot (irbak.json) e permite voltar.
  - **Delay no tempo**: medição guiada pelo microfone (nota abafada, 8 posições) para saber os
    milissegundos de cada TIME. Depois: **Tap** e figuras (semínima, colcheia pontuada, colcheia) no
    ajuste do TIME, teste por BPM e delay automático em cada música da setlist.
  - **Modo ensaio**: liga o USB Loopback e solta o cabo para tocar YouTube/Spotify no fone da
    pedaleira; ao sair reconecta e devolve o Loopback como estava.
  - Metrônomo com tap, reenviar/ler presets, presets de fábrica e USB Loopback.
- **Aprender** (em Ajustes): controles, módulos, combinações, os 9 TYPE e os 9 IR CAB, modos e receitas.
- **Ajustes**: orientação, valores (passos ou %), vibração, afinador, conexão, log e Sobre.
  - **Footswitch ativo (experimental)**: 5 capturas da memória (A, B, C, A, B, só leitura) para achar
    onde a pedaleira guarda o footswitch ativo. Achando, o Palco mostra "Tocando", pode seguir a
    pedaleira e as ações ao vivo agem só no footswitch que toca. As capturas vão para o log.
- Desfazer e **trava de palco** (segurar o cadeado 1 s para destravar) no topo.

## Instalar
1. Copie `CubeRemote-2.5.0.apk` para o celular e abra (permita "fontes desconhecidas").
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
ANDROID_HOME=~/android-sdk ./build.sh        # gera dist/CubeRemote-2.5.0.apk
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
│   ├── js/memory.js          aba Memórias (10 sons, fábrica e backup)
│   ├── js/sounds.js          sons prontos para o culto (edite aqui)
│   ├── js/library.js         Biblioteca: importação em lote (.zip/.json) e categorias
│   ├── js/setlist.js         aba Culto (setlist e pedal Bluetooth)
│   ├── js/live.js            Boost, Mudo, Swell e Fade out
│   ├── js/irlab.js           editor de IR
│   ├── js/delay.js           delay no tempo (medição, Tap, BPM)
│   ├── js/discover.js        footswitch ativo (experimental)
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
│   ├── EnvelopeRecorder.java nível do som a cada 1 ms (medição do delay)
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
