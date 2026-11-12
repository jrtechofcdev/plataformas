/* Cube Remote · Copyright (c) 2026 José Renato · Jr_Tech_OFC. Todos os direitos reservados.
   Sons prontos para o culto (aba Memórias > Sons prontos).

   Cada som tem os 16 bytes do preset, na ordem da pedaleira:
     [TYPE, GAIN, TONE, REVERB, FB, VOLUME, TIME, MIX, MOD, IR CAB, módulo 1, módulo 2, módulo 3, 0, 0, 0]
   Faixas: TYPE 0-8 (slot = valor + 1), GAIN 0-7, TONE 0-15, REVERB 0-15, FB 0-127, VOLUME 0-127,
           TIME 0-31, MIX 0-118, MOD 0-15 (7 = desligado, abaixo chorus, acima phaser),
           IR CAB 0-8 (0 = sem gabinete, slot = valor + 1), módulos 0 ou 1.
   Para criar ou mudar um som, edite esta lista (o app confere as faixas ao carregar).
   Os volumes são ponto de partida: nivele no ensaio, com a banda tocando. */
"use strict";
var CR = window.CR || (window.CR = {});

CR.SOUNDS = [
  { id: "r0", group: "Harmonia e fundo", name: "Fundo Ambiente",
    desc: "Limpo e macio, reverb grande, delay longo e chorus leve. Para oração, ministração e fundo musical. Combina com o Swell da aba Culto.",
    values: [0, 1, 8, 12, 70, 40, 22, 55, 5, 1, 1, 1, 1, 0, 0, 0] },
  { id: "r1", group: "Harmonia e fundo", name: "Fundo Brilhante",
    desc: "Limpo mais aberto, reverb quase no máximo, delay com mais repetições e phaser suave. Notas longas e acordes abertos.",
    values: [1, 2, 10, 14, 85, 40, 26, 65, 10, 1, 1, 1, 1, 0, 0, 0] },
  { id: "r2", group: "Tocar normal", name: "Base Limpa",
    desc: "Limpo com corpo, chorus bem leve, delay discreto e reverb médio. Dedilhados e louvor do dia a dia.",
    values: [1, 3, 9, 5, 25, 45, 10, 18, 6, 1, 1, 1, 1, 0, 0, 0] },
  { id: "r3", group: "Tocar normal", name: "Base Crunch",
    desc: "Overdrive leve, firme e sem embolar, sem delay (módulo 2 desligado). Músicas mais animadas e base com a banda.",
    values: [2, 3, 8, 4, 20, 40, 10, 12, 7, 2, 1, 0, 1, 0, 0, 0] },
  { id: "r4", group: "Hinos", name: "Hinos da Harpa",
    desc: "Limpo e claro com um delay leve (poucas repetições, baixo) e reverb de salão. Para os hinos da Harpa Cristã.",
    values: [0, 2, 9, 6, 18, 45, 12, 22, 7, 1, 1, 1, 1, 0, 0, 0] },
  { id: "r5", group: "Solo", name: "Solo Cantado",
    desc: "Overdrive cheio e redondo, com sustain, delay médio e agudo controlado. Solo melódico que canta sem chiar.",
    values: [4, 5, 7, 5, 40, 50, 16, 30, 7, 2, 1, 1, 1, 0, 0, 0] },
  { id: "r6", group: "Solo", name: "Solo Distorção",
    desc: "Distorção firme com ganho de sobra mas sem estourar (GAIN 5 de 7), agudo mais baixo e gabinete 2x12 macio, para não virar chiadeira.",
    values: [8, 5, 7, 4, 35, 48, 14, 25, 7, 5, 1, 1, 1, 0, 0, 0] },
];
