# 🎸 CubeSuite Linux

Editor para a pedaleira **Cuvave / M-VAVE Cube Baby** no **Debian/Ubuntu**, recriado a partir
do programa original para Windows (`CubeSuite.exe` V2.8.10) por engenharia reversa do protocolo.

> Projeto independente, sem vínculo com o fabricante. Use por sua conta e risco:
> o protocolo foi extraído do `.exe` e testado num simulador. **Ainda não foi testado com a
> pedaleira real** (veja a seção “Status dos testes”).

---

## ✨ O que ele faz

| Função | Original (Windows) | CubeSuite Linux |
|---|:-:|:-:|
| Detectar a pedaleira, modelo e firmware | ✅ | ✅ |
| Editar presets **A / B / C** (VOLUME, IR CAB, REVERB, MIX, FB, TIME, MOD, TONE, GAIN, TYPE) | ✅ | ✅ |
| Ligar/desligar os blocos A (IR/Reverb), B (Delay/Mod), C (Tone/Amp) | ✅ | ✅ |
| Restaurar presets de fábrica | ✅ | ✅ |
| Importar IR `.wav`, prévia na hora e ajuste de **Distância** | ✅ | ✅ |
| Salvar IR em um dos **8 slots** | ✅ | ✅ |
| Restaurar IRs de fábrica (`BFI.bin` / `MICRORIG.bin`) | ✅ | ✅ |
| **USB Loopback** | ✅ | ✅ |
| Atualização de firmware (`.up`) | ✅ | ❌ (não implementado — risco de travar o aparelho) |
| Outros aparelhos da marca (Looper, Cube Sugar, Drum…) | ✅ | ❌ |

---

## 📦 Instalação (pacote .deb)

```bash
sudo apt install ./cubesuite-linux_1.1.0_all.deb
```

Depois abra **CubeSuite Linux** no menu de aplicativos, ou rode `cubesuite-linux` no terminal.

* **Dependência:** só o `python3` (já vem no Debian). Nenhuma biblioteca extra.
* A interface abre numa janela própria do **Chromium/Chrome/Brave/Edge** (se tiver algum
  instalado). Sem eles, abre no navegador padrão (Firefox). Recomendado:
  `sudo apt install chromium`.

### Permissão para acessar o USB-MIDI
Na maioria das instalações com área de trabalho, já funciona. Se aparecer *“Sem permissão”*:

```bash
sudo usermod -aG audio $USER
# depois saia da sessão e entre de novo (ou reinicie)
```

---

## ▶️ Como usar

1. Ligue a Cube Baby no USB e abra o programa — ele **procura sozinho** a pedaleira.
2. **Presets:** escolha A, B ou C e gire os knobs (arraste para cima/baixo, roda do mouse ou setas
   do teclado). Cada mudança vai na hora para a pedaleira.
3. **IR Cab:** arraste um `.wav`, ajuste a distância, escolha o slot e clique em **Salvar IR**.
4. **Sistema:** liga/desliga o USB Loopback.

### Opções de linha de comando

```bash
cubesuite-linux --simular                     # testa a interface sem a pedaleira
cubesuite-linux --listar                      # lista as portas MIDI encontradas
cubesuite-linux --porta-midi /dev/snd/midiC1D0  # força uma porta específica
cubesuite-linux --sem-janela                  # só mostra o endereço (abra no navegador)
```

### IRs de fábrica
O botão **Restaurar IRs de fábrica** precisa do arquivo `BFI.bin` (ou `MICRORIG.bin`, para a
variante 0x4F09) que vem na pasta `bin/` do CubeSuite para Windows. Na primeira vez o programa
pede o arquivo e guarda uma cópia em `~/.local/share/cubesuite-linux/factory/`.
Se o `.deb` foi gerado com a pasta do CubeSuite (veja abaixo), os arquivos já vêm junto.

---

## 🛠️ Gerar o .deb você mesmo

```bash
cd cubesuite-linux
./packaging/build-deb.sh                       # sem arquivos de fábrica
./packaging/build-deb.sh ~/Downloads/CubeSuite  # incluindo BFI.bin e MICRORIG.bin
# resultado: dist/cubesuite-linux_1.1.0_all.deb
```

Rodar sem instalar (para desenvolver):

```bash
cd cubesuite-linux
PYTHONPATH=src python3 -m cubesuite_linux --simular
python3 -m unittest discover -s tests -v        # testes automáticos
```

---

## 📁 Organização das pastas

```
cubesuite-linux/
├── src/cubesuite_linux/
│   ├── __main__.py     → abre o programa (servidor local + janela)
│   ├── server.py       → "ponte" entre a tela e a pedaleira (API em 127.0.0.1)
│   ├── device.py       → operações da Cube Baby (presets, IR, fábrica, loopback)
│   ├── protocol.py     → formato das mensagens (SysEx, 7 bits, checksum)
│   ├── transport.py    → leitura/escrita em /dev/snd/midiC*D* (ALSA)
│   ├── wav.py          → leitura do .wav de IR
│   ├── simulator.py    → pedaleira simulada (testes / --simular)
│   └── web/            → INTERFACE: index.html, style.css, app.js, icon.svg
├── tests/test_protocol.py
├── packaging/          → build-deb.sh e atalho .desktop
└── README.md
```

### ✏️ Como personalizar
* **Cores:** `web/style.css`, bloco `:root` no início (ex.: `--accent: #33eab8;`).
* **Textos da tela:** `web/index.html`.
* **Nomes dos knobs/grupos:** lista `PARAMS` e `SWITCHES` em `device.py` e `GROUPS` em `web/app.js`.
* Depois de editar, gere o `.deb` de novo (ou rode direto com `PYTHONPATH=src`).

---

## 🔬 O que a engenharia reversa descobriu

* O `CubeSuite.exe` é um app **Qt5 (C++) de 32 bits** que fala com a pedaleira por **USB-MIDI**,
  usando a biblioteca RtMidi (WinMM no Windows). No Linux a pedaleira aparece como um dispositivo
  ALSA comum (`/dev/snd/midiC*D*`), então **não precisa de driver**.
* Mensagem: `F0 <dados em 7 bits> F7`. Os bytes são empacotados em fluxo de bits LSB-primeiro.
* Pacote interno: `00 59 | CMD | TAMANHO(3) | DADOS | CHECKSUM (NOT da soma)`.
  **Confirmado na pedaleira real** (chip Smartlink, USB `301A:5555`, responde como `SINCO-CubeBaby`).
  O programa também tenta `59 00` automaticamente, para versões antigas.
* Comandos: `11` identificar · `21` apagar bloco · `22` escrever · `23` ler · `24` soma16 · ACK `00`.
* Memória:
  * Região 0 (flash 512 KB): bloco de informações em `0x2100` (ou `0x180`/`0x4180`) com o **ID do
    produto** e o **endereço dos IRs**; USB Loopback em `0x3000`; IRs em `base + slot×0x1000`
    (`0x808` bytes: flag, distância float, 512 amostras float).
  * Região 4 (RAM do DSP): prévia de IR em `0x764`–`0xF6B`.
  * Região 5: presets A/B/C, 16 bytes cada. Ordem dos bytes:
    `TYPE, GAIN, TONE, REVERB, FB, VOLUME, TIME, MIX, MOD, IR CAB, blocoA, blocoB, blocoC`.
* IDs reconhecidos: Cube Baby `0x272E`, `0x2792` (geração antiga, só IR) e `0x4EA2`, `0x4E3E`,
  `0x4F06`, `0x4F09` (geração nova, editor completo).

## ✅ Status dos testes
* Testes automáticos do protocolo, do leitor de WAV e de um fluxo completo através de um
  dispositivo de caractere (pty) imitando o `/dev/snd/midi*` — **todos passando**.
* Interface testada no Chromium (desktop e celular) com a pedaleira simulada.
* **Não testado com a pedaleira física.** Pontos a conferir no primeiro uso:
  a detecção automática, o movimento dos knobs e qual chave liga qual bloco
  (a correspondência A/B/C foi deduzida da posição das chaves na tela original).

## 🩺 Problemas comuns
| Mensagem | Solução |
|---|---|
| “Nenhuma porta MIDI encontrada” | Confira o cabo USB (alguns só carregam). Rode `ls /dev/snd/` — deve aparecer `midiC?D0`. |
| “Sem permissão para abrir…” | `sudo usermod -aG audio $USER` e reinicie a sessão. |
| “…está em uso por outro programa” | Feche DAWs (Ardour, Reaper, Bitwig), JACK ou outro app MIDI. |
| “a pedaleira não respondeu” | Desligue/ligue o USB e clique em **Reconectar**. Teste outra porta com `--listar`. |
