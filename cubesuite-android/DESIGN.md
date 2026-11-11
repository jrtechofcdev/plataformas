# Cube Remote · direção de design

Dono da marca: José Renato · Jr_Tech_OFC. Este documento é a referência visual do app;
qualquer tela nova segue o que está aqui.

## Ideia central
O app é a pedaleira na mão. A tela principal é uma réplica do painel físico (preto anodizado,
serigrafia branca condensada, knobs creme com LED no centro) para que a pessoa reconheça cada
controle sem ler nada. Tudo o que não é painel (navegação, ajustes, textos) fica discreto e escuro,
para não competir com os LEDs.

## Dials (anti-slop)
- ENERGY 2: presença firme, sem efeitos chamativos.
- RHYTHM 1: painel de instrumento, alinhamento previsível. Nada de mosaico de cartões.
- MOTION 1: só movimentos funcionais (LED acende e apaga, agulha do afinador, folha de ajuste sobe).

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
Usado somente em LEDs e no centro dos knobs ativos, porque espelha o hardware: LED aceso quer
dizer efeito ligado (manual do fabricante, modo LIVE). Nenhum outro elemento brilha.

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
- Tela Pedal nunca rola, em pé ou deitado; o tamanho dos knobs se adapta à altura disponível.
- Alvos de toque de no mínimo 44 px.
- Knob e slider só mudam de valor depois de 6 px de arrasto; toque simples não altera nada
  (abre o ajuste fino). Isso evita mudanças acidentais com o celular no pedestal.
- Trava de palco: bloqueia todos os controles; destrava segurando o cadeado por 1 segundo.

## Texto
Português direto, termos de áudio quando ajudam (wet/dry, ganho, feedback, headroom).
Sem travessão, sem exclamação de marketing, sem números inventados: o que o fabricante não
informa (por exemplo, milissegundos do TIME) é dito como não informado.

## Estados
Toda tela trata: carregando (procurando a pedaleira), vazio (sem pedaleira / sem IR carregado),
erro (mensagem clara + caminho para o Log).
