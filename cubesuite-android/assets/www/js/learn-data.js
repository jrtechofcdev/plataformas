/* Cube Remote · Copyright (c) 2026 José Renato · Jr_Tech_OFC. Todos os direitos reservados.
   Conteúdo da aba Aprender e dos botões "!" (escrito para o app; dados técnicos do manual do fabricante). */
"use strict";
var CR = window.CR || (window.CR = {});

CR.LEARN = {};

/* ---------------------------------------------------------------- cada controle */
CR.LEARN.controls = {
  volume: {
    what: "Volume do som que sai da pedaleira: fone, saída OUT e áudio USB.",
    use: "No modo PRESET ele é o volume final. No modo LIVE ele ajusta o nível da cadeia de efeitos (o manual informa volume final fixo em 80% nesse modo). Um timbre limpo costuma soar mais baixo que um distorcido com o mesmo VOLUME, então use este controle para nivelar os presets A, B e C.",
    combo: "Sempre que mexer no GAIN ou trocar o TYPE, confira o VOLUME para a troca de preset não dar salto de volume no meio da música.",
    zero: "Zerado, a pedaleira fica muda.",
  },
  irCab: {
    what: "IR (impulse response, resposta ao impulso) é uma captura sonora de uma caixa de guitarra: falante, gabinete e microfone. É o que dá corpo e grave de amplificador ao som direto da pedaleira.",
    use: "São 9 posições: a 1 desliga o IR e as posições 2 a 9 são os 8 gabinetes. Ligue quando tocar no fone, na mesa de som, no computador ou no celular. Se a pedaleira for ligada na entrada de um amplificador de guitarra (que já tem falante), experimente desligar para o som não ficar abafado e sem brilho.",
    combo: "Gabinetes 1x12 e 2x12 combinam com timbres limpos e crunch; os 4x12 sustentam bem distorção. Você pode trocar os gabinetes pelos seus próprios IRs em Ferramentas.",
    zero: "Zerar volta ao slot 1: IR desligado.",
  },
  reverb: {
    what: "Simula as reflexões do som em um ambiente: sala, palco, igreja. Este knob é o mix wet/dry, ou seja, quanto do som com ambiente é somado ao som direto.",
    use: "Todo à esquerda desliga o reverb (o LED apaga). Pouco, até perto de 25%, dá sensação de sala. Muito deixa o som distante, bom para clean, dedilhados lentos e intros.",
    combo: "Com GAIN alto, use pouco reverb para o som não embolar. Com o delay ligado, reduza um pouco o reverb: os dois somam cauda.",
    zero: "Zerar desliga o reverb.",
  },
  mix: {
    what: "Mix wet/dry do delay (eco): o volume das repetições em relação ao som original.",
    use: "Todo à esquerda desliga o delay inteiro; o manual informa que os três LEDs do delay apagam juntos. Entre 15% e 30% o eco fica por trás da guitarra; acima de 40% ele vira parte principal do som.",
    combo: "Trabalha junto com TIME (distância entre os ecos) e FB (quantas repetições). Sem MIX, TIME e FB não fazem diferença.",
    zero: "Zerar desliga o delay.",
  },
  fb: {
    what: "FB é feedback: quanto do eco volta para a entrada do delay. Na prática, define quantas repetições você ouve.",
    use: "Baixo: uma ou duas repetições, o eco curto e seco. Médio: algumas repetições que vão sumindo. Alto: repetições longas que se acumulam; cuidado para não virar uma massa de som.",
    combo: "FB alto com TIME longo cria ambientes para intros. FB baixo com TIME curto dá o eco colado (slapback) do rockabilly e do country.",
    zero: "Zerar deixa o mínimo de repetições.",
  },
  time: {
    what: "TIME é o tempo do delay: o intervalo entre a nota tocada e cada repetição. O manual chama de velocidade das repetições.",
    use: "Curto: eco rápido que engorda a nota. Médio: o clássico de solo. Longo: repetições bem separadas, para ambientes. O fabricante não informa os valores em milissegundos, então ajuste de ouvido ou acompanhando o metrônomo.",
    combo: "Para o eco andar junto com a música, ajuste o TIME até as repetições caírem no tempo do metrônomo (aba Ferramentas).",
    zero: "Zerar deixa o tempo mínimo.",
  },
  mod: {
    what: "Modulação: efeitos que fazem o som se mover. A metade esquerda do knob é CHORUS (som mais largo, como duas guitarras juntas) e a metade direita é PHASER (som que gira, varrendo os médios). No meio fica desligado.",
    use: "Comece perto do centro e vá abrindo para um lado. Em geral, quanto mais longe do centro, mais presente fica o efeito. No app, CH indica chorus e PH indica phaser.",
    combo: "Chorus brilha com TYPE clean e um pouco de reverb, ótimo para louvor e baladas. Phaser funciona bem em base com crunch e em solos de rock dos anos 70.",
    zero: "Zerar volta ao centro: modulação desligada.",
  },
  tone: {
    what: "Controla o brilho do pré-amplificador: agudos e presença.",
    use: "Para a esquerda o som fica mais escuro e encorpado; para a direita, mais brilhante e cortante. Com muita distorção, brilho demais deixa o som áspero (o chiado chamado de fizz).",
    combo: "Ajuste junto com o IR CAB: troque o gabinete e corrija o TONE até o som ficar equilibrado no fone e na caixa.",
    zero: "Zerar deixa o timbre o mais escuro possível.",
  },
  gain: {
    what: "Quanto o pré-amplificador empurra o sinal. Mais ganho significa mais saturação, mais sustain e mais compressão.",
    use: "Clean: ganho baixo para ter headroom (o som continua limpo mesmo tocando forte). Crunch: ganho médio. Solo e base pesada: ganho alto.",
    combo: "Mais GAIN pede menos REVERB, TONE moderado e um ajuste no VOLUME.",
    zero: "Zerar deixa o ganho mínimo do modelo escolhido no TYPE.",
  },
  type: {
    what: "Escolhe o modelo de pré-amplificador, a base do timbre. São 9 slots: 1 e 2 clean, 3 a 5 overdrive, 6 a 9 distortion.",
    use: "Escolha primeiro o TYPE, depois ajuste GAIN e TONE. A lista completa, com o nome de cada slot, está na aba Aprender.",
    combo: "É o primeiro bloco da cadeia: modulação, delay, reverb e gabinete trabalham em cima do que sai daqui.",
    zero: "Não existe posição desligada; zerar volta ao slot 1 (Power-Zone Clean). Para tirar o pré da cadeia, desligue o módulo 3.",
  },
};

/* ---------------------------------------------------------------- módulos 1, 2 e 3 */
CR.LEARN.modules = [
  { n: 1, color: "green", fs: "A", title: "Módulo 1: ambiente e caixa", parts: "IR CAB e REVERB",
    text: "Dá ao som o corpo de um amplificador de verdade (IR CAB) e o espaço de um ambiente (REVERB). Fica no fim da cadeia. Desligar este módulo deixa o som seco e direto, útil quando a pedaleira vai para um amplificador com reverb próprio." },
  { n: 2, color: "blue", fs: "B", title: "Módulo 2: tempo e movimento", parts: "MIX, FB, TIME e MOD",
    text: "Delay (MIX, FB, TIME) e modulação (MOD: chorus ou phaser). Acrescenta repetições e movimento. É o módulo que mais muda de música para música: ligue para solos, intros e dedilhados; desligue para bases secas." },
  { n: 3, color: "red", fs: "C", title: "Módulo 3: pré-amplificador", parts: "TYPE, GAIN e TONE",
    text: "O coração do timbre: de limpo a distorcido. Tudo começa aqui. Desligar este módulo tira o pré da cadeia, bom para quem já tem outro pedal de drive ou um amplificador fazendo esse papel." },
];

CR.LEARN.chain = ["Afinador", "Pré (TYPE, GAIN, TONE)", "Chorus ou Phaser", "Delay", "Reverb", "IR CAB"];

CR.LEARN.bestSets = [
  { style: "Louvor e dedilhados", modules: "1, 2 e 3", how: "TYPE clean, chorus leve, delay discreto e reverb médio." },
  { style: "Pop e rock leve", modules: "1 e 3", how: "Overdrive com GAIN médio; ligue o módulo 2 só nos solos." },
  { style: "Solo", modules: "1, 2 e 3", how: "Distortion ou overdrive forte, delay médio e reverb baixo." },
  { style: "Rock pesado e metal", modules: "1 e 3", how: "Distortion, gabinete 4x12 e módulo 2 desligado para a base ficar firme." },
  { style: "Amplificador de guitarra", modules: "2 e 3", how: "Desligue o módulo 1 (ou só o IR CAB) para não somar gabinete simulado ao falante real." },
];

/* ---------------------------------------------------------------- TYPE (slots do manual) */
CR.LEARN.types = {
  Clean: "Som limpo, com headroom. Mantém as notas separadas em acordes abertos e dedilhados e é a melhor base para chorus, delay e reverb. GAIN baixo a médio; subindo o GAIN, alguns cleans começam a saturar de leve.",
  Overdrive: "Saturação moderada: o som limpa quando você toca leve e suja quando ataca forte. Território do crunch, blues, rock clássico e pop rock. GAIN médio é o ponto de partida.",
  Distortion: "Saturação forte, com mais sustain e compressão. Para rock pesado, metal e solos longos. Use TONE moderado e pouco reverb para não embolar.",
};
CR.LEARN.typeUse = [
  "Dedilhados, louvor, acordes com chorus e reverb.",
  "Clean para receber um pouco de saturação subindo o GAIN; bom para pop.",
  "Crunch para bases de rock e blues.",
  "Overdrive para levadas com mais pegada.",
  "Overdrive versátil, de base com crunch a solo leve.",
  "Distorção para rock com bastante atitude.",
  "Distorção para riffs pesados.",
  "Distorção para solos com sustain.",
  "Distorção de alto ganho para metal e bases pesadas.",
];

/* ---------------------------------------------------------------- IR CAB (slots do manual) */
CR.LEARN.cabs = [
  "Desliga o gabinete simulado. Use quando a pedaleira for para um amplificador de guitarra com falante.",
  "1x12: um falante, som mais focado e com menos grave. Ótimo para clean e para tocar junto com outros instrumentos sem embolar.",
  "4x12 Marshall 1960AV (falantes Vintage 30): médios fortes e agressivos, a cara do rock e do hard rock.",
  "4x12 Marshall 1960A com falantes T75, captado com o pré de microfone LA-610: graves e agudos mais abertos, com cara de som gravado em estúdio.",
  "2x12 VHT Deliverance: moderno, grave firme sem exagero. Bom para overdrive e solos.",
  "2x12 Soldano: médios cheios, equilibrado para rock e blues rock.",
  "4x12 Mesa Oversized captado em rig Peavey 5150: grave grande e apertado, feito para metal.",
  "4x12 Mesa captado com rig JSX e microfone condensador AKG C1000: mais ar e brilho nos agudos.",
  "4x12 Diezel com falantes V30 e microfone SM57 (power amp Soldano HR): o som clássico de estúdio para alto ganho.",
];

/* ---------------------------------------------------------------- modos da pedaleira (manual) */
CR.LEARN.modes = [
  { name: "PRESET", how: "Modo padrão ao ligar. Os footswitches A, B e C chamam os 3 presets; o LED aceso mostra qual está em uso. Os knobs físicos não mudam o timbre, só o VOLUME final. O Cube Remote edita esses presets." },
  { name: "LIVE", how: "Toque B + C juntos. Os knobs físicos mandam no som do jeito que estão (o que você vê é o que ouve) e os footswitches ligam e desligam os módulos 1, 2 e 3. Segure A, B ou C para salvar no preset." },
  { name: "EDIT", how: "Toque A + B juntos. Serve para ajustar os 3 presets com calma, comparando um com o outro." },
  { name: "TUNER", how: "Segure B + C por 2 segundos. Os knobs IR CAB, REVERB, MIX, FB, TIME e MOD representam as cordas E A D G B E; TONE, GAIN e TYPE indicam baixo, afinado e alto. O Cube Remote tem um afinador mais preciso na aba Afinador." },
  { name: "BT", how: "Segure A + B por 2 segundos para ligar ou desligar o Bluetooth de áudio: o celular toca música através da pedaleira para você tocar junto." },
];

/* ---------------------------------------------------------------- receitas (pontos de partida)
   Valores em % do curso do knob; TYPE e IR CAB em número de slot; MOD em CH/PH a partir do centro. */
CR.LEARN.recipes = [
  { name: "Louvor limpo e aberto", desc: "Acordes e dedilhados com brilho e ambiente.",
    v: { type: 1, gain: 25, tone: 55, mod: -2, mix: 20, fb: 30, time: 45, reverb: 40, irCab: 2, volume: 60 } },
  { name: "Crunch de rock", desc: "Base com pegada, sem eco.",
    v: { type: 5, gain: 55, tone: 50, mod: 0, mix: 0, fb: 0, time: 0, reverb: 15, irCab: 6, volume: 55 } },
  { name: "Solo cantado", desc: "Sustain com eco por trás das notas.",
    v: { type: 8, gain: 70, tone: 50, mod: 0, mix: 25, fb: 35, time: 55, reverb: 20, irCab: 5, volume: 60 } },
  { name: "Base pesada", desc: "Alto ganho, seco e firme.",
    v: { type: 9, gain: 75, tone: 45, mod: 0, mix: 0, fb: 0, time: 0, reverb: 10, irCab: 7, volume: 55 } },
  { name: "Ambiente para intro", desc: "Notas longas que viram paisagem.",
    v: { type: 2, gain: 20, tone: 45, mod: 2, mix: 35, fb: 55, time: 80, reverb: 60, irCab: 3, volume: 60 } },
];

/* Converte uma receita para os 16 bytes do preset. */
CR.recipeBytes = function (r) {
  var out = CR.S.presets ? CR.S.presets[CR.S.preset].slice() : new Array(16).fill(0);
  CR.CONTROLS.forEach(function (c) {
    var x = r.v[c.key];
    if (x === undefined) return;
    if (c.list) out[c.off] = Math.max(0, Math.min(c.max, x - 1));
    else if (c.bipolar) out[c.off] = Math.max(0, Math.min(c.max, c.zero + x));
    else out[c.off] = Math.round(x / 100 * c.max);
  });
  out[10] = 1;
  out[11] = (r.v.mix > 0 || r.v.mod !== 0) ? 1 : 0;
  out[12] = 1;
  return out;
};
