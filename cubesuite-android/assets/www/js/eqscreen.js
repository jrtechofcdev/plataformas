/* Cube Remote · Copyright (c) 2026 José Renato · Jr_Tech_OFC. Todos os direitos reservados.
   Tela do Equalizador (abre pelo botão EQ do Palco). Visual e toque inspirados em equalizadores de
   player: sliders verticais macios com brilho, curva, knobs grandes e vibração a cada passo.
   A lógica (modos, prévia, gravação na pedaleira) fica em js/eq.js. */
"use strict";
var CR = window.CR || (window.CR = {});

CR.EQScreen = (function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var target = null, sliders = [], pre = null, knobs = {}, raf = 0;
  var LETTERS = ["A", "B", "C"];

  function el() { return document.getElementById("eqScreen"); }
  function mode() { return CR.EQ.mode(); }
  function curve() { return target === null ? null : CR.EQ.curve(target); }

  function targetName(t) {
    if (mode() === "preset") return "Preset " + LETTERS[t];
    return "Gabinete " + (t + 2) + " · " + CR.CABS[t + 1].name;
  }
  function baseFor() {
    if (mode() === "preset") {
      var b = CR.EQ.data().base[target];
      var v = b === null || b === undefined ? CR.EQ.cabFor(target, CR.S.presets[target][9]) : b;
      return { val: v, samples: CR.EQ.baseSamples(v) || CR.DSP.impulse() };
    }
    return { val: target + 1, samples: CR.EQ.baseSamples(target + 1) || CR.DSP.impulse() };
  }

  /* ================================================================ abrir e desenhar */
  function open(t) {
    target = t === undefined ? CR.EQ.defaultTarget() : t;
    if (mode() === "preset" && target !== null && target !== CR.S.preset) { CR.S.preset = target; CR.emit("preset", target); }
    render();
    el().hidden = false;
    CR.haptic("tap");
  }
  function close() {
    el().hidden = true;
    if (CR.EQ.status() === "pending") CR.EQ.sync();      // gravou a prévia? grava já ao sair
  }

  function render() {
    var e = el(), c = curve(), m = mode();
    var tbar = m === "preset"
      ? '<div class="seg eq-tgt" role="group" aria-label="Preset do EQ">' + LETTERS.map(function (L, p) {
          return '<button type="button" data-tgt="' + p + '" aria-pressed="' + (p === target) + '" style="--led:var(--led-' + CR.MODULES[p].color + ')"><i class="led"></i>' + L +
            (CR.EQ.curve(p).on ? " <small>EQ</small>" : "") + "</button>"; }).join("") + "</div>"
      : '<button type="button" class="btn big eq-cabpick" data-cabpick>' + CR.icon("wave") + "<span>" + (target === null ? "Escolher gabinete" : CR.esc(targetName(target))) + "</span>" + CR.icon("down") + "</button>";
    var head = '<header class="eq-head"><button type="button" class="adj-close" data-x aria-label="Fechar">' + CR.icon("close") + "</button>" +
      '<div class="eq-title"><h2 id="eqTitle">Equalizador</h2><p class="eq-status"></p></div>' +
      '<span class="eq-power"></span></header>';
    if (target === null) {
      e.innerHTML = head + '<div class="eq-main"><div class="eq-tbar">' + tbar + '</div><div class="state-card eq-empty">' + CR.icon("wave", "state-ico") +
        "<h2>Este preset está sem gabinete</h2><p>No modo Por gabinete o EQ fica guardado em cada gabinete (IR CAB 2 a 9). Escolha um gabinete para equalizar, ou troque o modo em Ajustes.</p></div></div>";
      bindHead(e);
      return;
    }
    var bands = CR.EQ.BANDS.map(function (f, i) { return '<div class="eq-col" data-band="' + i + '"></div>'; }).join("");
    var b = baseFor();
    e.innerHTML = head +
      '<div class="eq-main">' +
        '<div class="eq-left">' +
          '<div class="eq-bands"><div class="eq-guides"><i></i><i></i><i></i></div>' +
            '<div class="eq-pre"><div class="eq-col" data-pre></div></div>' +
            '<div class="eq-scroll">' + bands + "</div></div>" +
        "</div>" +
        '<div class="eq-side">' +
          '<div class="eq-tbar">' + tbar + "</div>" +
          (m === "preset" ? '<p class="eq-base">Gabinete: <b>' + (b.val ? (b.val + 1) + " · " + CR.esc(CR.CABS[b.val].name) : "sem gabinete (só o EQ)") + "</b>. Troque no IR CAB do Palco." +
            (c.on ? " As posições 7, 8 e 9 do IR CAB ficam reservadas para o EQ de A, B e C." : "") + "</p>" : "") +
          '<div class="eq-right">' +
            '<div class="eq-curvebox"><canvas id="eqCurve" width="900" height="240" aria-label="Curva do equalizador"></canvas><p class="eq-peak" hidden></p></div>' +
            '<div class="eq-actions"><button type="button" class="btn big eq-preset" data-presets>' + CR.icon("list") + "<span>Predefinição</span></button>" +
              '<button type="button" class="icon-btn eq-more" data-more aria-label="Mais opções">' + CR.icon("more") + "</button></div>" +
            '<div class="eq-knobs"><div data-k="bass"></div><div data-k="treble"></div><div data-k="vol"></div></div>' +
          "</div>" +
        "</div>" +
      "</div>";
    bindHead(e);
    // sliders
    sliders = [];
    CR.EQ.BANDS.forEach(function (f, i) {
      var s = CR.makeVSlider({ label: CR.EQ.BAND_LABEL[i], aria: "Banda " + CR.EQ.BAND_LABEL[i] + " Hz", min: -12, max: 12, step: 0.1, tick: 0.5, value: c.bands[i], def: 0,
        onInput: function (v) { input(function (cc) { cc.bands[i] = v; }); }, onCommit: commit });
      $('[data-band="' + i + '"]', e).appendChild(s);
      sliders.push(s);
    });
    pre = CR.makeVSlider({ label: "Pré-amp", aria: "Pré-amplificação", min: -12, max: 12, step: 0.1, tick: 0.5, value: c.pre, def: 0,
      onInput: function (v) { input(function (cc) { cc.pre = v; }); }, onCommit: commit });
    $("[data-pre]", e).appendChild(pre);
    // knobs
    var pct = function (v) { return (v > 0 ? "+" : "") + v + "%"; };
    knobs.bass = CR.makeBigKnob({ label: "Grave", min: -100, max: 100, step: 1, tick: 5, value: c.bass, def: 0, fmt: pct,
      onInput: function (v) { input(function (cc) { cc.bass = v; }); }, onCommit: commit });
    knobs.treble = CR.makeBigKnob({ label: "Agudo", min: -100, max: 100, step: 1, tick: 5, value: c.treble, def: 0, fmt: pct,
      onInput: function (v) { input(function (cc) { cc.treble = v; }); }, onCommit: commit });
    var volC = CR.byKey.volume;
    knobs.vol = CR.makeBigKnob({ label: "Volume", min: 0, max: 127, step: 1, tick: 2, arc: true, value: CR.S.presets[CR.S.preset][5], def: CR.S.presets[CR.S.preset][5],
      fmt: function (v) { return CR.format(volC, v).short + (CR.prefs.display === "percent" ? "" : " de 127"); },
      onInput: function (v) { CR.set(5, v); } });
    knobs.vol.classList.add("bk-vol");
    $('[data-k="bass"]', e).appendChild(knobs.bass);
    $('[data-k="treble"]', e).appendChild(knobs.treble);
    $('[data-k="vol"]', e).appendChild(knobs.vol);
    $("[data-presets]", e).onclick = presets;
    $("[data-more]", e).onclick = more;
    paintStatus();
    drawCurve();
  }

  function bindHead(e) {
    $("[data-x]", e).onclick = close;
    var sw = CR.makeSwitch(!!(curve() && curve().on), "Ligar o equalizador", async function () {
      if (target === null) return;
      var ok = await CR.EQ.setOn(target, !curve().on);
      if (ok) { CR.toast(curve().on ? "EQ ligado em " + targetName(target) : "EQ desligado em " + targetName(target)); render(); }
    });
    sw.classList.add("switch-big");
    var wrap = $(".eq-power", e);
    wrap.innerHTML = '<span class="eq-power-l">' + (curve() && curve().on ? "Ligado" : "Desligado") + "</span>";
    wrap.appendChild(sw);
    if (target === null) sw.disabled = true;
    e.querySelectorAll("[data-tgt]").forEach(function (b) {
      b.onclick = function () { open(Number(b.dataset.tgt)); };
    });
    var cp = $("[data-cabpick]", e);
    if (cp) cp.onclick = pickCab;
  }

  /* Um slider ou knob mexeu: aplica na curva, liga o EQ se estava desligado, redesenha e manda a prévia. */
  var firstOn = false;
  function input(fn) {
    var c = curve();
    fn(c);
    if (!c.on && !firstOn) {
      firstOn = true;
      CR.EQ.setOn(target, true).then(function (ok) { firstOn = false; if (ok) { var l = $(".eq-power-l", el()); if (l) l.textContent = "Ligado"; var s = $(".eq-power .switch", el()); if (s) s.set(true); } });
    }
    if (!raf) raf = requestAnimationFrame(function () { raf = 0; drawCurve(); });
    CR.EQ.preview(target);
  }
  function commit() { CR.EQ.changed(target); drawCurve(); }

  /* ================================================================ curva */
  function drawCurve() {
    var cv = document.getElementById("eqCurve");
    if (!cv || target === null) return;
    var g = cv.getContext("2d"), W = cv.width, H = cv.height, c = curve();
    var want = CR.EQ.target(c), got = CR.EQ.actual(baseFor().samples, c);
    var mid = H / 2, sc = (H / 2 - 14) / 15;          // ±15 dB na altura
    var X = function (i) { return i / (want.length - 1) * W; };
    var Y = function (db) { return mid - Math.max(-15, Math.min(15, db)) * sc; };
    g.clearRect(0, 0, W, H);
    g.strokeStyle = "rgba(255,255,255,.12)"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, mid); g.lineTo(W, mid); g.stroke();
    g.font = "20px sans-serif"; g.fillStyle = "rgba(255,255,255,.35)";
    [100, 1000, 10000].forEach(function (f) {
      var x = Math.log(f / 40) / Math.log(500) * W;
      g.strokeStyle = "rgba(255,255,255,.06)"; g.beginPath(); g.moveTo(x, 8); g.lineTo(x, H - 8); g.stroke();
      g.fillText(f >= 1000 ? f / 1000 + "K" : String(f), x + 6, H - 10);
    });
    // curva pedida (clara, por trás)
    g.strokeStyle = "rgba(255,255,255,.22)"; g.lineWidth = 3; g.setLineDash([8, 8]);
    g.beginPath(); want.forEach(function (v, i) { if (i) g.lineTo(X(i), Y(v)); else g.moveTo(X(i), Y(v)); }); g.stroke();
    g.setLineDash([]);
    // curva que sai (verde acima de 0, verde-água abaixo), com brilho
    var grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#9dff5a"); grad.addColorStop(0.5, "#3be36a"); grad.addColorStop(1, "#2fe0c8");
    g.strokeStyle = grad; g.lineWidth = 6; g.shadowColor = "rgba(59,227,106,.7)"; g.shadowBlur = 14;
    g.beginPath(); got.forEach(function (v, i) { if (i) g.lineTo(X(i), Y(v)); else g.moveTo(X(i), Y(v)); }); g.stroke();
    g.shadowBlur = 0;
    var peak = Math.max.apply(null, got), pk = $(".eq-peak", el());
    if (pk) {
      pk.hidden = peak <= 6;
      pk.textContent = "Pico de +" + peak.toFixed(1).replace(".", ",") + " dB: se o som distorcer, baixe o Pré-amp.";
    }
  }

  /* ================================================================ status da gravação */
  function paintStatus() {
    var p = $(".eq-status", el());
    if (!p) return;
    var s = CR.EQ.status(), on = curve() && curve().on;
    p.textContent = !on && s === "idle" ? targetName(target === null ? 0 : target).replace(/^Gabinete \d+ · /, "Gabinete ") + " · EQ desligado"
      : { idle: "EQ desligado", pending: "Ouvindo a prévia · grava em instantes", saving: "Gravando na pedaleira…", saved: "Gravado na pedaleira",
          offline: "Sem a pedaleira: grava quando conectar", error: "Erro ao gravar (veja Ajustes > Abrir log)" }[s] || "";
    p.className = "eq-status " + s;
  }
  CR.on("eqstatus", paintStatus);
  CR.on("changed", function (d) { if (d.offset === 5 && knobs.vol && !el().hidden) knobs.vol.set(CR.S.presets[CR.S.preset][5]); });

  /* ================================================================ predefinições e opções */
  function apply(src) {
    var c = curve();
    c.bands = src.bands.slice(); c.pre = src.pre || 0; c.bass = src.bass || 0; c.treble = src.treble || 0;
    sliders.forEach(function (s, i) { s.set(c.bands[i]); });
    pre.set(c.pre); knobs.bass.set(c.bass); knobs.treble.set(c.treble);
    if (!c.on) CR.EQ.setOn(target, true).then(function () { render(); });
    commit();
    CR.haptic("detent");
  }

  function presets() {
    var d0 = CR.EQ.data(), list = CR.EQ.PRESETS.map(function (p) { return { name: p[0], bands: p[1], builtin: true }; }).concat(d0.user);
    CR.dialog("green", "Predefinição", "Toque para aplicar. As prontas são pontos de partida.",
      '<div class="tu-list">' + list.map(function (p, i) {
        return '<div class="eq-pitem"><button type="button" class="tu-item" data-p="' + i + '"><b>' + CR.esc(p.name) + "</b><span>" + (p.builtin ? "Pronta" : "Sua") + "</span></button>" +
          (p.builtin ? "" : '<button type="button" class="icon-btn" data-del="' + i + '" aria-label="Apagar ' + CR.esc(p.name) + '">' + CR.icon("trash") + "</button>") + "</div>";
      }).join("") + "</div>" +
      '<button type="button" class="btn big wide primary" data-save>' + CR.icon("save") + "<span>Salvar a curva atual</span></button>");
    var d = document.getElementById("dialog");
    d.querySelectorAll("[data-p]").forEach(function (b) { b.onclick = function () { d.hidden = true; apply(list[Number(b.dataset.p)]); CR.toast(list[Number(b.dataset.p)].name + " aplicada"); }; });
    d.querySelectorAll("[data-del]").forEach(function (b) {
      b.onclick = function () { var u = list[Number(b.dataset.del)]; d0.user.splice(d0.user.indexOf(u), 1); CR.EQ.changed(target); presets(); };
    });
    $("[data-save]", d).onclick = function () {
      CR.dialog("green", "Salvar predefinição", "", '<input class="text-input" id="eqName" maxlength="30" placeholder="Ex.: Igreja domingo">' +
        '<div class="dialog-actions"><button class="btn big" type="button" data-no>Cancelar</button><button class="btn primary big" type="button" data-yes>Salvar</button></div>');
      var d2 = document.getElementById("dialog"), inp = $("#eqName", d2);
      setTimeout(function () { inp.focus(); }, 60);
      function ok() {
        var c = curve(), n = inp.value.trim() || "Minha curva " + (d0.user.length + 1);
        d0.user.push({ name: n.slice(0, 30), bands: c.bands.slice(), pre: c.pre, bass: c.bass, treble: c.treble });
        d2.hidden = true; CR.EQ.changed(target); CR.toast('"' + n + '" salva');
      }
      $("[data-yes]", d2).onclick = ok; $("[data-no]", d2).onclick = function () { d2.hidden = true; };
      inp.onkeydown = function (ev) { if (ev.key === "Enter") ok(); };
    };
  }

  function more() {
    var targets = mode() === "preset" ? [0, 1, 2] : [0, 1, 2, 3, 4, 5, 6, 7];
    CR.dialog("white", "Opções do EQ", targetName(target),
      '<button type="button" class="btn big wide" data-zero>' + CR.icon("undo") + "<span>Zerar a curva (plana)</span></button>" +
      "<h3>Copiar esta curva para</h3><div class=\"eq-copy\">" + targets.filter(function (t) { return t !== target; }).map(function (t) {
        return '<button type="button" class="btn" data-copy="' + t + '">' + CR.esc(mode() === "preset" ? "Preset " + LETTERS[t] : "Gabinete " + (t + 2)) + "</button>";
      }).join("") + "</div>" +
      '<button type="button" class="btn big wide danger" data-restore>' + CR.icon("trash") + "<span>Desligar tudo e restaurar os gabinetes originais</span></button>");
    var d = document.getElementById("dialog");
    $("[data-zero]", d).onclick = function () { d.hidden = true; apply({ bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }); };
    d.querySelectorAll("[data-copy]").forEach(function (b) {
      b.onclick = async function () {
        var t = Number(b.dataset.copy), c = curve(), dst = CR.EQ.curve(t);
        dst.bands = c.bands.slice(); dst.pre = c.pre; dst.bass = c.bass; dst.treble = c.treble;
        d.hidden = true;
        if (!dst.on) await CR.EQ.setOn(t, true); else CR.EQ.changed(t);
        CR.toast("Curva copiada para " + targetName(t));
      };
    });
    $("[data-restore]", d).onclick = async function () {
      d.hidden = true;
      if (!(await CR.confirm("Restaurar originais", "Desligar o EQ de todos os presets e gabinetes e regravar os gabinetes originais na pedaleira?", "Restaurar"))) return;
      CR.EQ.restoreAll(); render(); CR.toast("EQ desligado. Os originais são regravados em instantes.");
    };
  }

  function pickCab() {
    CR.dialog("white", "Gabinete para equalizar", "Cada gabinete guarda a sua curva",
      '<div class="tu-list">' + [0, 1, 2, 3, 4, 5, 6, 7].map(function (s) {
        var c = CR.EQ.curve(s);
        return '<button type="button" class="tu-item' + (s === target ? " active" : "") + '" data-s="' + s + '"><b>' + (s + 2) + " · " + CR.esc(CR.CABS[s + 1].name) + "</b><span>" +
          (c.on && !CR.EQ.isFlat(c) ? "EQ ligado" : "Sem EQ") + "</span></button>";
      }).join("") + "</div>");
    var d = document.getElementById("dialog");
    d.querySelectorAll("[data-s]").forEach(function (b) { b.onclick = function () { d.hidden = true; open(Number(b.dataset.s)); }; });
  }

  return { open: open, close: close, isOpen: function () { return !el().hidden; }, redraw: function () { if (!el().hidden) render(); } };
})();
