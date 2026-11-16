/* Cube Remote · Copyright (c) 2026 José Renato · Jr_Tech_OFC. Todos os direitos reservados.
   Cálculos de áudio compartilhados pelo Editor de IR e pelo Equalizador.
   A Cube Baby usa IRs de 512 amostras a 48 kHz. Equalizar = passar o IR original pelos filtros
   e cortar de novo em 512 amostras (o IR resultante já leva a curva do EQ dentro dele). */
"use strict";
var CR = window.CR || (window.CR = {});

CR.DSP = (function () {
  var FS = 48000, LEN = 512, PAD = 4096;

  /* Filtros biquad (fórmulas clássicas de Robert Bristow-Johnson).
     type: "hp", "lp", "peak", "shelf"/"lshelf" (grave), "hshelf" (agudo). Devolve [b0, b1, b2, a1, a2]. */
  function biquad(type, f0, q, gainDb) {
    var A = Math.pow(10, (gainDb || 0) / 40), w = 2 * Math.PI * f0 / FS, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * q);
    var b0, b1, b2, a0, a1, a2, sq = 2 * Math.sqrt(A) * (sn / 2) * Math.SQRT2;   // shelves com inclinação S = 1
    if (type === "hp") { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
    else if (type === "lp") { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
    else if (type === "peak") { b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; }
    else if (type === "hshelf") {
      b0 = A * ((A + 1) + (A - 1) * cs + sq); b1 = -2 * A * ((A - 1) + (A + 1) * cs); b2 = A * ((A + 1) + (A - 1) * cs - sq);
      a0 = (A + 1) - (A - 1) * cs + sq; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - sq;
    } else {
      b0 = A * ((A + 1) - (A - 1) * cs + sq); b1 = 2 * A * ((A - 1) - (A + 1) * cs); b2 = A * ((A + 1) - (A - 1) * cs - sq);
      a0 = (A + 1) + (A - 1) * cs + sq; a1 = -2 * ((A - 1) + (A + 1) * cs); a2 = (A + 1) + (A - 1) * cs - sq;
    }
    return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
  }
  function filter(x, c) {
    var y = new Array(x.length), x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (var i = 0; i < x.length; i++) {
      var v = c[0] * x[i] + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2;
      x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
    }
    return y;
  }
  /* Ganho (dB) de um biquad na frequência f, calculado direto da fórmula (curva "pedida"). */
  function gainAt(c, f) {
    var w = 2 * Math.PI * f / FS, c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
    var nr = c[0] + c[1] * c1 + c[2] * c2, ni = -(c[1] * s1 + c[2] * s2);
    var dr = 1 + c[3] * c1 + c[4] * c2, di = -(c[3] * s1 + c[4] * s2);
    return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di) + 1e-30);
  }
  function energy(x) { var e = 0; for (var i = 0; i < x.length; i++) e += x[i] * x[i]; return e; }

  /* Corta em 512 amostras com um final suave (evita estalo no fim do IR). */
  function fit512(x) {
    var y = new Array(LEN), fade = 48;
    for (var i = 0; i < LEN; i++) {
      var v = x[i] || 0;
      if (i >= LEN - fade) v *= 0.5 * (1 + Math.cos(Math.PI * (i - (LEN - fade)) / fade));
      y[i] = v;
    }
    return y;
  }

  /* Resposta em frequência (dB) em 90 pontos de 40 Hz a 20 kHz (escala logarítmica).
     Usa tabelas de seno e cosseno prontas: rápido o bastante para redesenhar enquanto o dedo arrasta. */
  var FREQS = (function () { var f = []; for (var i = 0; i < 90; i++) f.push(40 * Math.pow(500, i / 89)); return f; })();
  var COS = [], SIN = [];
  FREQS.forEach(function (f) {
    var w = 2 * Math.PI * f / FS, c = new Float32Array(LEN), s = new Float32Array(LEN);
    for (var n = 0; n < LEN; n++) { c[n] = Math.cos(w * n); s[n] = Math.sin(w * n); }
    COS.push(c); SIN.push(s);
  });
  function response(x) {
    var out = new Array(FREQS.length);
    for (var k = 0; k < FREQS.length; k++) {
      var re = 0, im = 0, c = COS[k], s = SIN[k], n = Math.min(LEN, x.length);
      for (var i = 0; i < n; i++) { re += x[i] * c[i]; im -= x[i] * s[i]; }
      out[k] = 20 * Math.log10(Math.sqrt(re * re + im * im) + 1e-9);
    }
    return out;
  }

  function impulse() { var x = new Array(LEN).fill(0); x[0] = 1; return x; }

  return { FS: FS, LEN: LEN, PAD: PAD, biquad: biquad, filter: filter, gainAt: gainAt, energy: energy,
           fit512: fit512, response: response, FREQS: FREQS, impulse: impulse };
})();
