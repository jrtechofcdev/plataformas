# Cube Remote · direção de design

Dono da marca: José Renato · Jr_Tech_OFC. Este documento é a referência visual do app;
qualquer tela nova segue o que está aqui.

## Ideia central (versão 2.1: modo culto)
O app é usado de pé, durante o culto, com pouco tempo e pouca luz. Função vem antes de enfeite:
- **Palco**: tudo o que muda o som em uma tela, sem rolar. Presets A, B, C grandes em cima,
  módulos 1, 2, 3 logo abaixo e os 10 controles como blocos grandes (2 x 5 em pé, 5 x 2 deitado).
  Cada bloco mostra o nome do painel, o nome completo, o valor grande e, no TYPE e no IR CAB,
  o modelo escolhido. Bloco apagado = controle zerado; tracejado = módulo desligado.
- **Um toque abre a tela de ajuste** em tela cheia: valor gigante, slider largo, atalhos
  (0, 25, 50, 75, 100% ou CH/OFF/PH no MOD), botões − e + enormes (segurar repete e acelera),
  chave Ativo/Zerado, "Valor anterior" (volta ao valor de quando abriu) e setas para ir ao
  controle anterior ou seguinte sem fechar. No TYPE e no IR CAB a tela mostra os 9 modelos
  com número e nome, para escolher com um toque.
- Em pé, os botões − e + ficam embaixo, na zona do polegar.
- O botão Voltar do Android fecha a tela de ajuste; nunca sai do app por engano.
As cores e os nomes continuam os da pedaleira, para reconhecer cada controle sem ler.

## Dials (anti-slop)
- ENERGY 3 (versão 2.7): acabamento refinado, com vidro e gradiente só onde ajudam a ler e a navegar.
- RHYTHM 1: painel de instrumento, alinhamento previsível. Nada de mosaico de cartões.
- MOTION 3 (versão 2.7): movimento expressivo, mas sempre curto e com propósito. Ajustes > Tela >
  Animações > Leves (ou o Android pedindo menos movimento) volta para quase nenhum movimento.

## Acabamento (versão 2.7: "atual lapidado" + vidro e gradiente)
- **Superfícies**: fundo `#07090c` com um brilho verde-água bem leve no alto. Cartões e botões com
  gradiente vertical sutil (`--sheen`), borda de 1 px quase invisível, um fio de luz no topo (`--hl`)
  e sombra em 3 alturas (`--e1`, `--e2`, `--e3`). Tudo em `css/tokens.css`.
- **Vidro** (desfoque `--blur`): só no "cromo" do app, por onde o conteúdo passa por baixo: topo,
  barra de abas em pílula, janelas (folhas), avisos, abas internas e chips grudados no topo.
  Nunca nos 10 controles do Palco (desempenho e leitura).
- **Gradiente da marca** (`--brand-grad`, verde-água para ciano): botão principal, Conectar, aba
  ativa, opção escolhida e a assinatura "by Jr_Tech_OFC".
- **Gradiente do LED**: o estado ativo de preset, módulo, controle, atalho e modelo ganha um
  gradiente da cor do seu LED, com a borda acesa.

## Movimento (versão 2.7)
| Onde | O quê | Tempo |
|---|---|---|
| Barra de abas | destaque em pílula desliza com mola até a aba tocada | 320 ms |
| Troca de aba | a tela nova entra deslizando do lado da aba; a antiga some | 340 / 170 ms |
| Listas e cartões | entram em cascata (até 14 itens, 34 ms entre eles) | 380 ms |
| Toque | o botão afunda (96,5%) e solta uma onda de luz da cor do LED | 560 ms |
| Tela de ajuste | nasce do controle tocado e fecha voltando para ele; setas deslizam | 320 ms |
| Números | rolam para cima quando o valor sobe e para baixo quando desce | 230 ms |
| Trocar de preset | os 10 valores entram em cascata | 300 ms |
| LEDs acesos | halo "respira" devagar; módulo ligado dá um flash curto | 3,4 s / 550 ms |
| Janelas | sobem com mola; fecham descendo; arrastar a alça para baixo fecha | 320 ms |
| Avisos e "Aguarde" | avisos sobem em pílula; "Aguarde" só aparece se passar de 0,15 s | 200 ms |

Regras: animar só posição e transparência; o atributo `hidden` continua mandando (o CSS segura o
elemento visível pelo tempo da saída); nada de animação que atrase um toque. Código em `js/ui.js`.

## Cores
| Papel | Valor | Por quê |
|---|---|---|
| Fundo do app | `#0b0d10` | tela usada em palco e ensaio com pouca luz |
| Painel | `#0f1013` a `#17191c` | alumínio preto anodizado da pedaleira |
| Serigrafia | `#ecebe6` | branco levemente quente, como a tinta do painel |
| LED branco | `#eef3ff` | VOLUME |
| LED verde | `#38e27c` | IR CAB, REVERB, footswitch A, módulo 1 |
| LED azul | `#3f8cff` | MIX, FB, TIME, MOD, footswitch B, módulo 2 |
| LED vermelho | `#ff4436` | TONE, GAIN, TYPE, footswitch C, módulo 3 |
| Marca (teal) | `#33eab8` | só no "cromo" do app: aba ativa, ação principal, logo |

Regra do acento: as cores de LED pertencem aos controles da pedaleira; o teal pertence ao app.
Um nunca substitui o outro.

## Brilho (glow)
Principalmente nos LEDs, porque espelha o hardware: LED aceso quer dizer efeito ligado (manual do
fabricante, modo LIVE). Na versão 2.7 o brilho também marca o que está escolhido: o valor gigante
da tela de ajuste, a barra de cada controle ativo, o botão principal e a aba ativa. O que está
apagado ou zerado nunca brilha.

## Tipografia
- Barlow Condensed (500/600/700): nomes dos controles, números, cabeçalhos. Lembra a serigrafia
  condensada do painel e cabe em colunas estreitas.
- Barlow (400/500/600): textos corridos da aba Aprender e dos ajustes.
- Números com algarismos tabulares (`font-variant-numeric: tabular-nums`) para não "pular".

## Ícones
Conjunto próprio em SVG (js/icons.js), traço de 2 px com cantos retos, desenhado para cada função:
pedal, diapasão, metrônomo, livro, engrenagem, cadeado, desfazer, enviar, informação ("!").
Nenhum emoji em lugar algum, inclusive mensagens do Java.

## Toque e tamanho
- Palco e Afinador nunca rolam, em pé ou deitado; testado de 360 x 640 até tablet.
- Alvos de toque: mínimo 44 px; na tela Palco e na tela de ajuste, 54 a 112 px.
- Celulares baixos (até 760 px de altura em pé): blocos compactos com nome e valor na mesma linha.
- Slider só muda o valor depois de 6 px de arrasto. Botões − e +: um toque = um passo.
- Trava de palco: bloqueia todos os controles; destrava segurando o cadeado por 1 segundo.

## Texto
Português direto, termos de áudio quando ajudam (wet/dry, ganho, feedback, headroom).
Sem travessão, sem exclamação de marketing, sem números inventados: o que o fabricante não
informa (por exemplo, milissegundos do TIME) é dito como não informado.

## Estados
Toda tela trata: carregando (procurando a pedaleira), vazio (sem pedaleira / sem IR carregado),
erro (mensagem clara + caminho para o Log).
