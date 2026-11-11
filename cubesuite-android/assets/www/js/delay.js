/* Cube Remote · Copyright (c) 2026 José Renato · Jr_Tech_OFC. Todos os direitos reservados.
   Delay no tempo da música.

   O fabricante não informa quantos milissegundos é cada posição do TIME (0 a 31). Então o app mede:
   liga um delay de teste, você toca uma nota abafada, o microfone grava o som da pedaleira e o app
   mede a distância entre os ecos. Com algumas posições medidas, completa a tabela das 32 posições.
   Depois disso: Tap no TIME, figuras (semínima, colcheia pontuada, colcheia) e delay automático
   em cada música da setlist. A medição fica salva no celular (cr.delaycal). */
"use strict";
var CR = window.CR || (window.CR = {});

CR.Delay = (function () {
  var TIME = 6, FB = 4, MIX = 7, REVERB = 3, MOD = 8, MOD2 = 11;
  var POINTS = [4, 8, 12, 16, 20, 24, 28, 31];           // posições medidas
  var FIGS = [["q", "Semínima", 1], ["dq", "Colcheia pontuada", 0.75], ["e", "Colcheia", 0.5]];
  var cal = CR.store.get("cr.delaycal", null);           // { ms: [32], date, points: {time: ms} }
  var $ = function (s, r) { return (r || document).querySelector(s); };

  function calibrated() { return !!(cal && Array.isArray(cal.ms) && cal.ms.length === 32); }
  function msOf(t) { return calibrated() ? cal.ms[t] : null; }
  function figName(k) { var f = FIGS.filter(function (x) { return x[0] === k; })[0]; return f ? f[1] : ""; }

  /* Posição do TIME mais perto de um tempo em ms (null sem medição). */
  function timeFor(ms) {
    if (!calibrated()) return null;
    var best = 0;
    for (var t = 1; t < 32; t++) if (Math.abs(cal.ms[t] - ms) < Math.abs(cal.ms[best] - ms)) best = t;
    return best;
  }
  function msFor(bpm, fig) {
    var f = FIGS.filter(function (x) { return x[0] === fig; })[0];
    return f && bpm ? 60000 / bpm * f[2] : null;
  }

  /* ================================================================ análise do eco
     env: nível do som a cada 1 ms. Acha o ataque da nota e os ecos (picos que se repetem)
     e devolve o intervalo entre eles em ms, ou null se não deu para medir. */
  function analyze(env) {
    var n = env.length, sm = new Array(n);
    for (var i = 0; i < n; i++) { var a = 0, c = 0; for (var j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++) { a += env[j]; c++; } sm[i] = a / c; }
    var sorted = sm.slice().sort(function (a, b) { return a - b; });
    var noise = sorted[Math.floor(n * 0.2)], peak = sorted[n - 1];
    if (peak < noise * 8 || peak < 0.003) return null;                         // nenhuma nota forte
    var onset = -1;
    for (i = 0; i < n; i++) if (sm[i] > Math.max(noise * 6, peak * 0.25)) { onset = i; break; }
    if (onset < 0) return null;
    // picos locais depois do ataque, com pelo menos 18 ms entre eles e acima do ruído
    var peaks = [], thr = Math.max(noise * 3, peak * 0.04), last = -999;
    for (i = onset; i < n - 3; i++) {
      if (sm[i] > thr && sm[i] >= sm[i - 1] && sm[i] >= sm[i + 1] && sm[i] >= sm[i - 3] && sm[i] >= sm[i + 3]) {
        if (i - last < 18) { if (sm[i] > sm[last]) { peaks[peaks.length - 1] = i; last = i; } continue; }
        peaks.push(i); last = i;
      }
    }
    if (peaks.length < 2) return null;
    // o primeiro pico é a nota; procura o espaçamento que se repete entre os seguintes
    var gaps = [];
    for (i = 1; i < Math.min(peaks.length, 6); i++) gaps.push(peaks[i] - peaks[i - 1]);
    var d = gaps[0];
    if (gaps.length >= 2) {
      var good = gaps.filter(function (g) { return Math.abs(g - d) <= Math.max(4, d * 0.12); });
      if (good.length < 2 && gaps.length >= 3) {               // primeiro intervalo atrapalhado: usa a mediana
        var s2 = gaps.slice().sort(function (a, b) { return a - b; });
        d = s2[Math.floor(s2.length / 2)];
      } else d = good.reduce(function (a, b) { return a + b; }, 0) / good.length;
    }
    return Math.round(d);
  }

  /* Completa as 32 posições a partir das medidas (reta entre pontos; nas pontas, continua a reta). */
  function buildTable(points) {
    var ts = Object.keys(points).map(Number).sort(function (a, b) { return a - b; });
    if (ts.length < 2) return null;
    var ms = [];
    for (var t = 0; t < 32; t++) {
      var k = 0;
      while (k < ts.length - 2 && t > ts[k + 1]) k++;
      var t0 = ts[k], t1 = ts[k + 1], m0 = points[t0], m1 = points[t1];
      ms.push(Math.max(5, Math.round(m0 + (m1 - m0) * (t - t0) / (t1 - t0))));
    }
    for (t = 1; t < 32; t++) if (ms[t] < ms[t - 1]) ms[t] = ms[t - 1];          // nunca diminui
    return ms;
  }

  /* ================================================================ medição guiada */
  var run = null;

  async function measure() {
    if (!CR.S.presets) { CR.toast("Conecte a pedaleira primeiro", true); return; }
    if (CR.S.locked) { CR.toast("Controles travados. Segure o cadeado para destravar."); return; }
    if (!(await CR.confirm("Medir o delay",
      "Vai levar uns 2 minutos. Deixe o som da pedaleira saindo perto do celular (amplificador, caixa ou o fone encostado no microfone). " +
      "O app liga um delay de teste nos 3 presets e, a cada passo, você toca UMA nota abafada, curta, quando aparecer Já. No fim, tudo volta como estava.", "Começar"))) return;
    CR.Live.release();
    var saved = [0, 1, 2].map(function (p) { return CR.S.presets[p].slice(); });
    run = { points: {}, stop: false };
    for (var p = 0; p < 3; p++) {
      CR.setAt(p, MOD2, 1); CR.setAt(p, MIX, 100); CR.setAt(p, FB, 45); CR.setAt(p, REVERB, 0); CR.setAt(p, MOD, 7);
    }
    try {
      for (var i = 0; i < POINTS.length && !run.stop; i++) {
        var t = POINTS[i], tries = 0, got = null;
        for (p = 0; p < 3; p++) CR.setAt(p, TIME, t);
        while (!got && !run.stop && tries < 3) {
          tries++;
          got = await step(i, t, tries);
          if (got === "skip") { got = null; break; }
        }
        if (got) run.points[t] = got;
      }
    } finally {
      for (p = 0; p < 3; p++) [TIME, FB, MIX, REVERB, MOD, MOD2].forEach(function (off) { CR.setAt(p, off, saved[p][off]); });
      document.getElementById("dialog").hidden = true;
    }
    var n = Object.keys(run.points).length;
    if (run.stop && n < 2) { CR.toast("Medição cancelada"); run = null; return; }
    var table = buildTable(run.points);
    if (!table) { CR.toast("Não consegui medir posições suficientes. Tente com o som mais alto e uma nota bem curta.", true); run = null; return; }
    cal = { ms: table, points: run.points, date: new Date().toLocaleDateString("pt-BR") };
    CR.store.set("cr.delaycal", cal);
    run = null;
    CR.toast("Delay medido: TIME 0 = " + table[0] + " ms, TIME 31 = " + table[31] + " ms");
    CR.emit("delaycal");
  }

  /* Um passo: mostra contagem, grava 3 s e analisa. */
  function step(i, t, attempt) {
    return new Promise(function (resolve) {
      var total = POINTS.length;
      CR.dialog("blue", "Medindo o delay", "Passo " + (i + 1) + " de " + total + " · TIME " + t,
        '<div class="dl-step"><b class="dl-count">3</b><p class="dl-msg">Prepare uma nota abafada</p>' +
        '<div class="dl-progress"><i style="width:' + Math.round(i / total * 100) + '%"></i></div>' +
        (attempt > 1 ? '<p class="hint">Tentativa ' + attempt + " de 3. Toque mais forte e mais curto.</p>" : "") + "</div>" +
        '<div class="dialog-actions"><button class="btn big" type="button" data-skip>Pular este</button><button class="btn big danger" type="button" data-cancel>Cancelar</button></div>');
      var d = document.getElementById("dialog"), cnt = $(".dl-count", d), msg = $(".dl-msg", d), done = false;
      function finish(v) { if (!done) { done = true; resolve(v); } }
      $("[data-skip]", d).onclick = function () { finish(-1); };
      $("[data-cancel]", d).onclick = function () { run.stop = true; finish(null); };
      d.querySelectorAll("[data-close]").forEach(function (b) { b.onclick = function () { run.stop = true; finish(null); }; });
      var c = 3;
      var tick = setInterval(function () {
        if (done) { clearInterval(tick); return; }
        c--;
        if (c > 0) { cnt.textContent = c; return; }
        clearInterval(tick);
        cnt.textContent = "Já!"; cnt.classList.add("go"); msg.textContent = "Toque a nota abafada agora";
        CR.haptic();
        CR.native("recordEnvelope", { ms: 3200 }).then(function (env) {
          if (done) return;
          var ms = analyze(env);
          if (!ms) { msg.textContent = "Não ouvi os ecos. Vamos de novo."; setTimeout(function () { finish(null); }, 900); return; }
          cnt.textContent = ms + " ms"; cnt.classList.remove("go"); msg.textContent = "Medido";
          setTimeout(function () { finish(ms); }, 700);
        }).catch(function (e) { CR.toast(e.message, true); run.stop = true; finish(null); });
      }, 800);
    }).then(function (v) { return v === -1 ? "skip" : v; });
  }

  /* ================================================================ aplicar no tempo */
  /* Põe o TIME dos 3 presets no tempo da figura escolhida. Devolve a posição usada ou null. */
  function applyBpm(bpm, fig, opts) {
    if (!calibrated()) { CR.toast("Meça o delay primeiro em Ferramentas > Delay no tempo", true); return null; }
    var ms = msFor(bpm, fig), t = timeFor(ms);
    if (t === null) return null;
    for (var p = 0; p < 3; p++) CR.setAt(p, TIME, t, opts);
    var off = Math.abs(cal.ms[t] - ms) > ms * 0.08;
    if (!(opts && opts.quiet) || off)
      CR.toast(figName(fig) + " a " + bpm + " BPM = " + Math.round(ms) + " ms: TIME " + t + " (" + cal.ms[t] + " ms)" +
        (off ? ". Fora do alcance da pedaleira, ficou no mais perto." : ""), off);
    return t;
  }

  /* ================================================================ telas */
  function cardHtml() {
    var tbl = "";
    if (calibrated()) {
      tbl = '<details class="dl-table"><summary>Ver as 32 posições</summary><div class="dl-grid">' +
        cal.ms.map(function (m, t) { return "<span><b>" + t + "</b>" + m + " ms</span>"; }).join("") + "</div></details>";
    }
    return '<article class="card" id="delayCard"><header class="card-head">' + CR.icon("tap") + "<div><h2>Delay no tempo</h2>" +
      "<p>" + (calibrated() ? "Medido em " + CR.esc(cal.date) + ": TIME 0 = " + cal.ms[0] + " ms até TIME 31 = " + cal.ms[31] + " ms."
        : "Meça uma vez para o app saber quantos milissegundos é cada posição do TIME.") + "</p></div></header>" +
      '<button class="btn wide big' + (calibrated() ? "" : " primary") + '" type="button" id="dlMeasure">' + CR.icon("wave") + "<span>" + (calibrated() ? "Medir de novo" : "Medir o delay") + "</span></button>" +
      tbl +
      (calibrated() ? '<div class="field"><div class="field-head"><span>Testar no tempo</span><b id="dlBpmVal"></b></div>' +
        '<div class="stepper dl-bpm"><button class="step" type="button" data-dlbpm="-1" aria-label="Menos 1 BPM">' + CR.icon("minus") + '</button><b id="dlBpm">' + bpmNow + " BPM</b>" +
        '<button class="step" type="button" data-dlbpm="1" aria-label="Mais 1 BPM">' + CR.icon("plus") + "</button></div>" +
        '<div class="seg" role="group" id="dlFig">' + FIGS.map(function (f) { return '<button type="button" data-fig="' + f[0] + '" aria-pressed="' + (f[0] === figNow) + '">' + f[1] + "</button>"; }).join("") + "</div>" +
        '<button class="btn wide" type="button" id="dlApply">' + CR.icon("check") + "<span>Aplicar nos 3 presets</span></button></div>" : "") +
      '<p class="hint">Na aba Culto, cada música pode trazer o delay no tempo dela. Na tela de ajuste do TIME há um botão Tap.</p></article>';
  }
  var bpmNow = CR.store.get("cr.dl.bpm", 72), figNow = CR.store.get("cr.dl.fig", "dq");

  function bindCard(root) {
    $("#dlMeasure", root).onclick = measure;
    var lbl = $("#dlBpmVal", root);
    function paintBpm() {
      if (!lbl) return;
      var ms = msFor(bpmNow, figNow), t = timeFor(ms);
      $("#dlBpm", root).textContent = bpmNow + " BPM";
      lbl.textContent = Math.round(ms) + " ms = TIME " + t;
    }
    root.querySelectorAll("[data-dlbpm]").forEach(function (b) {
      b.onclick = function () { bpmNow = Math.max(30, Math.min(250, bpmNow + Number(b.dataset.dlbpm))); CR.store.set("cr.dl.bpm", bpmNow); paintBpm(); };
    });
    root.querySelectorAll("[data-fig]").forEach(function (b) {
      b.onclick = function () { figNow = b.dataset.fig; CR.store.set("cr.dl.fig", figNow);
        root.querySelectorAll("[data-fig]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); paintBpm(); };
    });
    var ap = $("#dlApply", root);
    if (ap) ap.onclick = function () {
      if (!CR.S.presets) { CR.toast("Conecte a pedaleira primeiro", true); return; }
      applyBpm(bpmNow, figNow);
    };
    paintBpm();
  }

  /* Tap para a tela de ajuste do TIME: devolve o BPM e já ajusta o TIME (semínima ou a figura escolhida). */
  var taps = [];
  function tap() {
    var now = Date.now();
    if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
    taps.push(now);
    if (taps.length > 6) taps.shift();
    if (taps.length < 2) return null;
    var avg = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
    return { ms: avg, bpm: Math.round(60000 / avg) };
  }

  return { calibrated: calibrated, msOf: msOf, timeFor: timeFor, msFor: msFor, applyBpm: applyBpm, figName: figName, FIGS: FIGS,
           cardHtml: cardHtml, bindCard: bindCard, measure: measure, tap: tap, _analyze: analyze, _buildTable: buildTable };
})();
