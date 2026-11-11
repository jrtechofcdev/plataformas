/* Cube Remote · Copyright (c) 2026 José Renato · Jr_Tech_OFC. Todos os direitos reservados.
   Editor de IR (aba Ferramentas).
   Fonte: um arquivo .wav ou um gabinete que já está na pedaleira (slot 2 a 9).
   Ajustes: corte de grave, graves, médios, presença, corte de agudo e volume, com curva de resposta
   e prévia ao vivo na pedaleira. Antes de gravar num slot, o app guarda uma cópia do que estava nele
   (arquivo irbak.json), para poder voltar.

   A Cube Baby usa IRs de 512 amostras a 48 kHz (cerca de 11 ms): o editor sempre entrega esse formato. */
"use strict";
var CR = window.CR || (window.CR = {});

CR.IrLab = (function () {
  var FS = 48000, LEN = 512, MAX_SRC = 4096, KEEP_BACKUPS = 3;
  var $ = function (s, r) { return (r || document).querySelector(s); };

  /* EQ: valores padrão e faixas. hp/lp = 0 quer dizer desligado. */
  var DEF = { hp: 0, low: 0, mid: 0, pres: 0, lp: 0, gain: 0 };
  var SLIDERS = [
    { k: "hp",   label: "Corte de grave",  min: 0, max: 300, step: 10, fmt: function (v) { return v ? v + " Hz" : "Desligado"; },
      hint: "Tira o grave que embola no som da igreja. 80 a 150 Hz costuma limpar sem afinar demais." },
    { k: "low",  label: "Graves (120 Hz)", min: -12, max: 12, step: 1, fmt: db, hint: "Corpo do som." },
    { k: "mid",  label: "Médios (700 Hz)", min: -12, max: 12, step: 1, fmt: db, hint: "Mais médio aparece na banda; menos médio fica mais escavado." },
    { k: "pres", label: "Presença (3,2 kHz)", min: -12, max: 12, step: 1, fmt: db, hint: "Definição e ataque da palhetada. Demais fica estridente." },
    { k: "lp",   label: "Corte de agudo",  min: 0, max: 12000, step: 500, fmt: function (v) { return v ? (v / 1000).toLocaleString("pt-BR") + " kHz" : "Desligado"; },
      hint: "Tira o chiado e o agudo que fura. 6 a 9 kHz deixa mais macio." },
    { k: "gain", label: "Volume do IR", min: -12, max: 6, step: 1, fmt: db, hint: "O app mantém o volume parecido com o original; ajuste fino aqui." },
  ];
  var STARTS = [
    ["Neutro", { hp: 0, low: 0, mid: 0, pres: 0, lp: 0 }],
    ["Menos embolado", { hp: 120, low: -3, mid: 0, pres: 0, lp: 0 }],
    ["Mais presença", { hp: 80, low: 0, mid: 1, pres: 3, lp: 9000 }],
    ["Menos estridente", { hp: 80, low: 0, mid: 0, pres: -3, lp: 6500 }],
  ];
  function db(v) { return (v > 0 ? "+" : "") + v + " dB"; }

  var S = { src: null, eq: Object.assign({}, DEF), dist: 50, slot: 0, preview: true, out: null, origResp: null, backups: null };

  /* ================================================================ áudio */
  function readWav(buf) {
    var d = new DataView(buf);
    var tag = function (o) { return String.fromCharCode(d.getUint8(o), d.getUint8(o + 1), d.getUint8(o + 2), d.getUint8(o + 3)); };
    if (buf.byteLength < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("Não é um arquivo WAV válido");
    var pos = 12, fmt = null, data = null;
    while (pos + 8 <= buf.byteLength) {
      var id = tag(pos), size = d.getUint32(pos + 4, true);
      if (id === "fmt ") fmt = pos + 8;
      if (id === "data") data = { off: pos + 8, len: Math.min(size, buf.byteLength - pos - 8) };
      pos += 8 + size + (size & 1);
    }
    if (fmt === null || !data) throw new Error("WAV incompleto (sem bloco de formato ou de dados)");
    var fmtTag = d.getUint16(fmt, true), ch = d.getUint16(fmt + 2, true), rate = d.getUint32(fmt + 4, true);
    var align = d.getUint16(fmt + 12, true), bits = d.getUint16(fmt + 14, true);
    if (fmtTag === 0xFFFE) fmtTag = d.getUint16(fmt + 24, true);
    var w = align / ch, frames = Math.floor(data.len / align), out = [];
    for (var i = 0; i < Math.min(MAX_SRC, frames); i++) {
      var o = data.off + i * align, v;
      if (fmtTag === 3 && w === 4) v = d.getFloat32(o, true);
      else if (fmtTag === 3 && w === 8) v = d.getFloat64(o, true);
      else if (fmtTag === 1 && w === 1) v = (d.getUint8(o) - 128) / 128;
      else if (fmtTag === 1 && w === 2) v = d.getInt16(o, true) / 32767;
      else if (fmtTag === 1 && w === 3) { var x = d.getUint8(o) | (d.getUint8(o + 1) << 8) | (d.getUint8(o + 2) << 16); if (x & 0x800000) x -= 0x1000000; v = x / 8388608; }
      else if (fmtTag === 1 && w === 4) v = d.getInt32(o, true) / 2147483648;
      else throw new Error("Formato WAV não suportado (" + bits + " bits)");
      out.push(v);
    }
    return { samples: out, rate: rate, bits: bits, frames: frames, channels: ch };
  }

  /* Converte para 48 kHz (interpolação linear; IRs em 44,1 kHz ficam com o tempo certo). */
  function resample(x, rate) {
    if (rate === FS) return x.slice();
    var n = Math.floor(x.length * FS / rate), out = new Array(n);
    for (var i = 0; i < n; i++) {
      var t = i * rate / FS, k = Math.floor(t), f = t - k;
      out[i] = (x[k] || 0) * (1 - f) + (x[k + 1] || 0) * f;
    }
    return out;
  }

  /* Filtros biquad (fórmulas clássicas de Robert Bristow-Johnson). */
  function biquad(type, f0, q, gainDb) {
    var A = Math.pow(10, gainDb / 40), w = 2 * Math.PI * f0 / FS, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * q);
    var b0, b1, b2, a0, a1, a2;
    if (type === "hp") { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
    else if (type === "lp") { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
    else if (type === "peak") { b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; }
    else { // low shelf (inclinação S = 1)
      var sq = 2 * Math.sqrt(A) * (sn / 2) * Math.SQRT2;
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

  /* Aplica o EQ no IR de origem e devolve as 512 amostras finais. */
  function process(src, eq) {
    var x = src.slice(0, MAX_SRC), base = fit512(src);
    if (eq.hp) x = filter(x, biquad("hp", eq.hp, 0.707, 0));
    if (eq.low) x = filter(x, biquad("shelf", 120, 0.707, eq.low));
    if (eq.mid) x = filter(x, biquad("peak", 700, 0.9, eq.mid));
    if (eq.pres) x = filter(x, biquad("peak", 3200, 1.0, eq.pres));
    if (eq.lp) x = filter(x, biquad("lp", eq.lp, 0.707, 0));
    var y = fit512(x);
    var k = Math.sqrt(energy(base) / Math.max(1e-12, energy(y))) * Math.pow(10, eq.gain / 20);
    return y.map(function (v) { return Math.round(v * k * 1e6) / 1e6; });
  }

  /* Resposta em frequência (dB) em pontos espaçados em escala logarítmica, 40 Hz a 20 kHz. */
  var FREQS = (function () { var f = []; for (var i = 0; i < 90; i++) f.push(40 * Math.pow(500, i / 89)); return f; })();
  function response(x) {
    return FREQS.map(function (f) {
      var re = 0, im = 0, w = 2 * Math.PI * f / FS;
      for (var n = 0; n < x.length; n++) { re += x[n] * Math.cos(w * n); im -= x[n] * Math.sin(w * n); }
      return 20 * Math.log10(Math.sqrt(re * re + im * im) + 1e-9);
    });
  }

  /* ================================================================ desenho */
  function drawResp() {
    var c = $("#irResp");
    if (!c || !S.out) return;
    var g = c.getContext("2d"), W = c.width, H = c.height, top = 12, bot = H - 26;
    var now = response(S.out), ref = S.origResp;
    var mx = Math.max.apply(null, now.concat(ref || [])), lo = mx - 36;
    var X = function (i) { return 8 + i / (FREQS.length - 1) * (W - 16); };
    var Y = function (v) { return top + (mx - Math.max(lo, v)) / (mx - lo) * (bot - top); };
    g.clearRect(0, 0, W, H);
    g.font = "22px sans-serif"; g.fillStyle = "#8d99a6"; g.strokeStyle = "#232831"; g.lineWidth = 2;
    [100, 1000, 10000].forEach(function (f) {
      var x = 8 + Math.log(f / 40) / Math.log(500) * (W - 16);
      g.beginPath(); g.moveTo(x, top); g.lineTo(x, bot); g.stroke();
      g.fillText(f >= 1000 ? f / 1000 + " kHz" : f + " Hz", x + 6, H - 4);
    });
    function line(arr, color, width) {
      g.strokeStyle = color; g.lineWidth = width; g.beginPath();
      arr.forEach(function (v, i) { if (i) g.lineTo(X(i), Y(v)); else g.moveTo(X(i), Y(v)); });
      g.stroke();
    }
    if (ref) line(ref, "#4a5260", 3);
    line(now, "#38e27c", 4);
  }

  function html() {
    var slots = "";
    for (var i = 0; i < 8; i++) slots += '<button type="button" data-from="' + i + '">' + (i + 2) + "</button>";
    var to = "";
    for (var j = 0; j < 8; j++) to += '<button type="button" data-to="' + j + '">' + (j + 2) + "</button>";
    return '<article class="card" id="irLab"><header class="card-head">' + CR.icon("wave") + "<div><h2>Editor de IR</h2>" +
        "<p>Abra um IR ou pegue um gabinete da pedaleira, ajuste ouvindo e grave num slot.</p></div></header>" +
      '<label class="btn wide big file-btn">' + CR.icon("file") + '<span>Abrir arquivo .wav</span><input id="wavInput" type="file" accept=".wav,audio/*" hidden></label>' +
      '<div class="field"><div class="field-head"><span>Ou pegar o gabinete que está na pedaleira (IR CAB)</span></div><div class="slots">' + slots + "</div></div>" +
      '<div class="ir-work" hidden>' +
        '<div class="ir-src"><b class="ir-name"></b><small class="ir-meta"></small></div>' +
        '<canvas id="irResp" width="900" height="260" aria-label="Curva de resposta do IR"></canvas>' +
        '<p class="hint ir-legend"><i class="lg-now"></i>IR ajustado <i class="lg-ref"></i>original</p>' +
        '<div class="field"><div class="field-head"><span>Ponto de partida</span></div><div class="ir-starts">' +
          STARTS.map(function (s, i) { return '<button type="button" class="chip-btn" data-start="' + i + '">' + s[0] + "</button>"; }).join("") + "</div></div>" +
        SLIDERS.map(function (s) {
          return '<div class="field"><div class="field-head"><span>' + s.label + '</span><b data-val="' + s.k + '"></b></div>' +
            '<input class="range green" type="range" data-eq="' + s.k + '" min="' + s.min + '" max="' + s.max + '" step="' + s.step + '" aria-label="' + s.label + '">' +
            '<small class="ir-hint">' + s.hint + "</small></div>";
        }).join("") +
        '<div class="field"><div class="field-head"><span>Distância do microfone</span><b id="irDistVal"></b></div>' +
          '<input id="irDist" class="range green" type="range" min="1" max="100" aria-label="Distância do microfone"></div>' +
        '<div class="set-row"><div><b>Ouvir na pedaleira enquanto ajusta</b><span>Prévia, ainda não grava. O IR CAB do preset precisa estar ligado (posição 2 a 9) e o módulo 1 ligado.</span></div><span id="swPreview"></span></div>' +
        '<div class="field"><div class="field-head"><span>Gravar no slot do IR CAB</span></div><div class="slots">' + to + "</div></div>" +
        '<button class="btn primary wide big" type="button" id="irSave"></button>' +
        '<p class="hint">Antes de gravar, o app guarda uma cópia do que estava no slot. A posição 1 do IR CAB é "desligado", por isso os slots vão de 2 a 9.</p>' +
      "</div>" +
      '<div class="ir-backups"></div></article>';
  }

  function paint() {
    var root = $("#irLab");
    if (!root) return;
    var on = CR.S.status.state === "on", blocked = CR.S.status.irWritable === false;
    root.querySelectorAll("[data-from]").forEach(function (b) { b.disabled = !on || blocked; });
    $(".ir-work", root).hidden = !S.src;
    if (S.src) {
      $(".ir-name", root).textContent = S.src.name;
      $(".ir-meta", root).textContent = S.src.meta;
      SLIDERS.forEach(function (s) {
        var inp = $('[data-eq="' + s.k + '"]', root), v = S.eq[s.k];
        inp.value = v;
        inp.style.setProperty("--p", ((v - s.min) / (s.max - s.min) * 100) + "%");
        $('[data-val="' + s.k + '"]', root).textContent = s.fmt(v);
      });
      var d = $("#irDist", root);
      d.value = S.dist; d.style.setProperty("--p", S.dist + "%");
      $("#irDistVal", root).textContent = S.dist + "%";
      root.querySelectorAll("[data-to]").forEach(function (b) { b.setAttribute("aria-pressed", String(Number(b.dataset.to) === S.slot)); });
      var save = $("#irSave", root);
      save.disabled = !on || blocked;
      save.innerHTML = CR.icon(blocked ? "lock" : "save") + "<span>" + (blocked ? "Gravação de IR bloqueada neste modelo" : "Gravar no slot " + (S.slot + 2)) + "</span>";
    }
    paintBackups();
  }

  /* ================================================================ ações */
  function setSource(name, meta, samples48) {
    S.src = { name: name, meta: meta, samples: samples48 };
    S.eq = Object.assign({}, DEF);
    S.origResp = response(fit512(samples48));
    update(true);
  }

  var timer = null, sending = false, again = false;
  function update(now) {
    if (!S.src) return;
    S.out = process(S.src.samples, S.eq);
    paint();
    drawResp();
    clearTimeout(timer);
    timer = setTimeout(sendPreview, now ? 0 : 180);
  }
  /* Manda a prévia sem engasgar: no máximo um envio por vez, o último ajuste sempre chega. */
  async function sendPreview() {
    if (!S.preview || !S.out || CR.S.status.state !== "on") return;
    if (sending) { again = true; return; }
    sending = true;
    try { await CR.native("irPreview", { samples: S.out, distance: S.dist }); }
    catch (e) { CR.toast("Prévia: " + e.message, true); }
    sending = false;
    if (again) { again = false; sendPreview(); }
  }

  async function openFile(file) {
    if (!file) return;
    try {
      var w = readWav(await file.arrayBuffer());
      var s = resample(w.samples, w.rate);
      setSource(file.name, w.rate + " Hz · " + w.bits + " bits · " + (w.channels > 1 ? "canal esquerdo · " : "") + w.frames + " amostras" +
        (w.rate !== FS ? " (convertido para 48 kHz)" : ""), s);
      if (CR.S.status.state !== "on") CR.toast("IR aberto. Conecte a pedaleira para ouvir.");
    } catch (e) { CR.toast(e.message, true); }
  }

  async function fromSlot(i) {
    CR.busy(true, "Lendo o gabinete do slot " + (i + 2));
    try {
      var r = await CR.native("irRead", { slot: i });
      S.dist = Math.round(Math.max(0.01, Math.min(1, r.distance)) * 100);
      setSource("Gabinete do slot " + (i + 2), "Lido da pedaleira · 48 kHz · 512 amostras (de fábrica, o slot " + (i + 2) + " é " + CR.CABS[i + 1].name + ")", r.samples);
      S.slot = i;
      paint();
    } catch (e) { CR.toast(e.message, true); }
    finally { CR.busy(false); }
  }

  /* ---------------------------------------------------------------- cópias de segurança dos slots */
  function loadBackups() {
    if (S.backups) return Promise.resolve(S.backups);
    return CR.native("memLoad", { name: "irbak" }).then(function (t) {
      try { var o = t ? JSON.parse(t) : null; S.backups = o && Array.isArray(o.items) ? o.items : []; } catch (e) { S.backups = []; }
      return S.backups;
    }).catch(function () { S.backups = []; return S.backups; });
  }
  function saveBackups() {
    return CR.native("memSave", { name: "irbak", data: JSON.stringify({ kind: "irbak", version: 1, items: S.backups }) });
  }
  function paintBackups() {
    var box = $("#irLab .ir-backups");
    if (!box || !S.backups) return;
    if (!S.backups.length) { box.innerHTML = ""; return; }
    var on = CR.S.status.state === "on" && CR.S.status.irWritable !== false;
    box.innerHTML = '<h3 class="l-sub">Cópias dos slots</h3><p class="hint">O que estava em cada slot antes de você gravar. Toque em Voltar para regravar.</p>' +
      '<ul class="ir-bak-list">' + S.backups.map(function (b, i) {
        return '<li><div><b>Slot ' + (b.slot + 2) + "</b><span>" + CR.esc(b.name) + " · " + CR.esc(b.date) + "</span></div>" +
          '<button class="btn" type="button" data-restore="' + i + '"' + (on ? "" : " disabled") + ">" + CR.icon("undo") + "<span>Voltar</span></button></li>";
      }).join("") + "</ul>";
    box.querySelectorAll("[data-restore]").forEach(function (b) {
      b.onclick = async function () {
        var k = S.backups[Number(b.dataset.restore)];
        if (!(await CR.confirm("Voltar slot " + (k.slot + 2), "Regravar no slot " + (k.slot + 2) + ' a cópia de ' + CR.esc(k.date) + "? O IR que está lá agora será substituído (e também vai ganhar uma cópia).", "Voltar"))) return;
        await write(k.slot, k.samples, k.distance, "cópia de " + k.date);
      };
    });
  }

  async function write(slot, samples, distance, what) {
    CR.busy(true, "Guardando cópia do slot " + (slot + 2));
    try {
      await loadBackups();
      try {
        var cur = await CR.native("irRead", { slot: slot });
        var d = new Date();
        S.backups.unshift({ slot: slot, date: d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
          name: "antes de gravar " + what, distance: Math.round(cur.distance * 100), samples: cur.samples });
        var per = {};
        S.backups = S.backups.filter(function (b) { per[b.slot] = (per[b.slot] || 0) + 1; return per[b.slot] <= KEEP_BACKUPS; });
        await saveBackups();
      } catch (e) {
        CR.busy(false);
        if (!(await CR.confirm("Sem cópia", "Não consegui ler o slot " + (slot + 2) + " para guardar a cópia (" + CR.esc(e.message) + "). Gravar mesmo assim?", "Gravar"))) return;
      }
      CR.busy(true, "Gravando no slot " + (slot + 2));
      await CR.native("irSave", { slot: slot, samples: samples, distance: distance });
      CR.toast("IR gravado no slot " + (slot + 2));
    } catch (e) { CR.toast(e.message, true); }
    finally { CR.busy(false); paint(); }
  }

  /* ================================================================ ligação com a tela */
  function bind(root) {
    $("#wavInput", root).onchange = function (e) { openFile(e.target.files[0]); e.target.value = ""; };
    root.querySelectorAll("[data-from]").forEach(function (b) { b.onclick = function () { fromSlot(Number(b.dataset.from)); }; });
    root.querySelectorAll("[data-eq]").forEach(function (inp) {
      inp.oninput = function () { S.eq[inp.dataset.eq] = Number(inp.value); update(); };
    });
    root.querySelectorAll("[data-start]").forEach(function (b) {
      b.onclick = function () { Object.assign(S.eq, STARTS[Number(b.dataset.start)][1]); update(true); CR.haptic(); };
    });
    var dist = $("#irDist", root);
    dist.oninput = function () { S.dist = Number(dist.value); paint(); };
    dist.onchange = function () { update(true); };
    root.querySelectorAll("[data-to]").forEach(function (b) { b.onclick = function () { S.slot = Number(b.dataset.to); paint(); }; });
    var sw = CR.makeSwitch(S.preview, "Ouvir na pedaleira enquanto ajusta", function () {
      S.preview = !S.preview; sw.set(S.preview); if (S.preview) update(true);
    }, "green");
    $("#swPreview", root).appendChild(sw);
    $("#irSave", root).onclick = async function () {
      if (!S.out) return;
      if (!(await CR.confirm("Gravar IR", 'Gravar "' + CR.esc(S.src.name) + '" ajustado no slot ' + (S.slot + 2) + " do IR CAB? O app guarda antes uma cópia do que está lá.", "Gravar"))) return;
      await write(S.slot, S.out, S.dist, S.src.name.slice(0, 40));
    };
    loadBackups().then(paint);
    paint();
    drawResp();
  }

  return { html: html, bind: bind, refresh: paint,
           _process: process, _response: response, _freqs: FREQS };
})();
