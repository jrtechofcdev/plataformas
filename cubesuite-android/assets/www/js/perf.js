/* Cube Remote · Copyright (c) 2026 José Renato · Jr_Tech_OFC. Todos os direitos reservados.
   Desempenho (Ajustes > Avançado > Desempenho):
   - Medidor: plaquinha no canto com quadros por segundo e "travadas" (tarefas acima de 50 ms).
   - Testar desempenho: ~15 s percorrendo o app sozinho, mede e mostra o resultado; tudo vai para o Log,
     para compartilhar. O teste NÃO manda nada para a pedaleira: mexe só na cópia dos presets do app
     e devolve os valores no fim. */
"use strict";
var CR = window.CR || (window.CR = {});

CR.Perf = (function () {
  /* ---------------------------------------------------------------- travadas (tarefas longas) */
  var longs = [];
  try {
    new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { longs.push(e.duration); if (longs.length > 500) longs.shift(); }); })
      .observe({ type: "longtask", buffered: true });
  } catch (_) {}

  /* ---------------------------------------------------------------- medidor na tela */
  var meter = null, mRaf = 0;
  function meterOn(on) {
    if (!on) { cancelAnimationFrame(mRaf); if (meter) meter.remove(); meter = null; return; }
    if (meter) return;
    meter = document.createElement("div");
    meter.className = "perf-meter";
    meter.setAttribute("aria-hidden", "true");
    document.body.appendChild(meter);
    var n = 0, worst = 0, last = performance.now(), t0 = last, l0 = longs.length;
    (function loop(t) {
      n++; worst = Math.max(worst, t - last); last = t;
      if (t - t0 >= 1000) {
        var fps = Math.round(n * 1000 / (t - t0)), lg = longs.length - l0;
        meter.textContent = fps + " fps · pior " + Math.round(worst) + " ms" + (lg ? " · " + lg + " travada" + (lg > 1 ? "s" : "") : "");
        meter.className = "perf-meter " + (fps >= 50 && worst < 40 ? "ok" : fps >= 35 ? "mid" : "bad");
        n = 0; worst = 0; t0 = t; l0 = longs.length;
      }
      mRaf = requestAnimationFrame(loop);
    })(last);
  }

  /* ---------------------------------------------------------------- teste */
  function frames(count, step) {
    return new Promise(function (res) {
      var f = [], last = null, i = 0;
      (function loop(t) {
        if (last !== null) f.push(t - last);
        last = t;
        if (step) step(i);
        if (++i <= count) requestAnimationFrame(loop); else res(f);
      })(performance.now());
    });
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function stats(f) {
    var s = f.slice().sort(function (a, b) { return a - b; }), sum = f.reduce(function (a, x) { return a + x; }, 0);
    return { fps: Math.round(f.length * 1000 / Math.max(1, sum)), p95: Math.round(s[Math.floor(s.length * .95)] || 0),
             max: Math.round(s[s.length - 1] || 0), lentos: f.filter(function (x) { return x > 20; }).length, total: f.length };
  }

  async function run() {
    if (!CR.S.presets) { CR.toast("Abra o app com os presets carregados (conecte uma vez ou use os de fábrica)", true); return; }
    var info = {};
    try { info = (await CR.native("appInfo")) || {}; } catch (_) {}
    var banner = document.createElement("div");
    banner.className = "perf-banner";
    banner.textContent = "Testando o desempenho. Não toque na tela (cerca de 15 s).";
    document.body.appendChild(banner);
    var view0 = document.getElementById("app").dataset.view, l0 = longs.length, out = {};
    var MIX = CR.CONTROLS.filter(function (c) { return c.key === "mix"; })[0];
    var p = CR.S.presets[CR.S.preset], orig = p[MIX.off];
    // valor muda só na cópia do app (sem enviar para a pedaleira) e a tela reage como num arrasto real
    function fake(i) { p[MIX.off] = (orig + i) % (MIX.max + 1); CR.emit("changed", { offset: MIX.off, value: p[MIX.off], live: true }); }
    try {
      CR.App.go("stage"); await wait(700);
      out.palco = stats(await frames(120, fake));
      CR.Stage.openAdjust(CR.CONTROLS.indexOf(MIX)); await wait(500);
      out.ajuste = stats(await frames(120, fake));
      CR.Stage.closeAdjust(); await wait(500);
      var tab = [];
      for (var v of ["culto", "memory", "tools", "settings", "stage"]) {
        var t0 = performance.now();
        CR.App.go(v);
        tab = tab.concat(await frames(36));
        void t0;
      }
      out.abas = stats(tab);
      for (var s of ["memory", "learn"]) {
        CR.App.go(s); await wait(600);
        var el = document.getElementById("view-" + s);
        el.scrollTop = 0;
        out["rolar_" + s] = stats(await frames(90, function () { el.scrollTop += 36; }));
        el.scrollTop = 0;
      }
    } finally {
      p[MIX.off] = orig;
      CR.emit("changed", { offset: MIX.off, value: orig, live: true });
      CR.App.go(view0 === "learn" ? "settings" : view0);
      banner.remove();
    }
    var lg = longs.slice(l0);
    var all = [out.palco, out.ajuste, out.abas, out.rolar_memory, out.rolar_learn];
    var p95 = Math.max.apply(null, all.map(function (x) { return x.p95; }));
    var lentos = all.reduce(function (a, x) { return a + x.lentos; }, 0), tot = all.reduce(function (a, x) { return a + x.total; }, 0);
    var nota = p95 <= 20 && lg.length <= 2 ? "Ótimo" : p95 <= 34 && lentos / tot < .12 ? "Bom" : "Pesado";
    var res = { nota: nota, aparelho: info, motion: CR.prefs.motion || "full", travadas: lg.length, piorTravada: Math.round(Math.max.apply(null, lg.concat([0]))), fases: out };
    CR.native("jsLog", { text: "[desempenho] " + JSON.stringify(res) }).catch(function () {});
    var row = function (t, x) { return "<div><dt>" + t + "</dt><dd>" + x.fps + " fps · 95% até " + x.p95 + " ms · " + x.lentos + " lentos</dd></div>"; };
    CR.dialog(nota === "Pesado" ? "red" : nota === "Bom" ? "blue" : "green", "Desempenho: " + nota,
      CR.esc((info.device || "") + (info.webview ? " · " + info.webview : "")),
      '<dl class="info-list">' + row("Palco (arrasto)", out.palco) + row("Tela de ajuste", out.ajuste) + row("Trocar de aba", out.abas) +
        row("Rolar Memórias", out.rolar_memory) + row("Rolar Aprender", out.rolar_learn) +
        "<div><dt>Travadas</dt><dd>" + lg.length + (lg.length ? " (pior " + res.piorTravada + " ms)" : "") + "</dd></div></dl>" +
      (nota === "Pesado" ? "<p>Para este celular, vale ligar <b>Ajustes > Tela > Animações: Leves</b>.</p>" : "") +
      '<p class="hint">O resultado foi para o Log (Ajustes > Abrir log > Compartilhar). Mande para o suporte se quiser ajuste fino.</p>');
    return res;
  }

  return { meter: meterOn, run: run };
})();
