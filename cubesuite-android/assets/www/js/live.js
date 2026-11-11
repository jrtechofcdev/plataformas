/* Cube Remote · Copyright (c) 2026 José Renato · Jr_Tech_OFC. Todos os direitos reservados.
   Ações ao vivo: Boost de solo, Mudo, Swell (entrada suave) e Fade out (saída suave).

   Por que agem nos 3 presets: o app não tem como saber qual footswitch (A, B ou C) a pedaleira
   está tocando. Mudando o VOLUME (byte 5) e o módulo 2 (byte 11) dos três, a ação funciona em
   qualquer um. Antes da primeira ação o app guarda os valores originais e devolve tudo depois. */
"use strict";
var CR = window.CR || (window.CR = {});

CR.Live = (function () {
  var VOL = 5, MOD2 = 11;
  var cfg = Object.assign({ boost: 25, boostDelay: false, fade: 3 }, CR.store.get("cr.live", {}));
  var saved = null;              // { vol: [a, b, c], mod2: [a, b, c] } valores antes das ações
  var muted = false, boost = false;
  var anim = null;               // { timer, kind }

  function saveCfg() { CR.store.set("cr.live", cfg); }
  function ready(force) {
    if (!CR.S.presets) { CR.toast("Conecte a pedaleira primeiro", true); return false; }
    if (CR.S.locked && !force) { CR.toast("Controles travados. Segure o cadeado para destravar."); return false; }
    return true;
  }
  function capture() {
    if (saved) return;
    saved = { vol: [0, 1, 2].map(function (p) { return CR.S.presets[p][VOL]; }),
              mod2: [0, 1, 2].map(function (p) { return CR.S.presets[p][MOD2]; }) };
  }
  /* Volume que cada preset deve ter agora (sem contar a animação). */
  function targetVol(p) {
    if (muted) return 0;
    var v = saved.vol[p];
    return boost ? Math.min(127, v + Math.round(127 * cfg.boost / 100)) : v;
  }
  function targetMod2(p) { return boost && cfg.boostDelay ? 1 : saved.mod2[p]; }

  function write(p, off, v, force) { CR.setAt(p, off, v, { force: force }); }

  function stopAnim() { if (anim) { clearInterval(anim.timer); anim = null; } }

  /* Aplica o estado (Mudo/Boost) nos 3 presets; se não sobrou nenhuma ação, esquece os valores guardados. */
  function apply(force) {
    stopAnim();
    for (var p = 0; p < 3; p++) { write(p, VOL, targetVol(p), force); write(p, MOD2, targetMod2(p), force); }
    if (!muted && !boost) saved = null;
    paint();
  }

  /* Rampa de volume nos 3 presets. from/to: arrays por preset. Curva suave (começa devagar). */
  function ramp(kind, from, to, done, force) {
    stopAnim();
    var t0 = Date.now(), dur = cfg.fade * 1000;
    anim = { kind: kind, timer: setInterval(function () {
      var f = Math.min(1, (Date.now() - t0) / dur);
      var e = kind === "swell" ? f * f : 1 - (1 - f) * (1 - f);
      for (var p = 0; p < 3; p++) write(p, VOL, Math.round(from[p] + (to[p] - from[p]) * e), force);
      if (f >= 1) { stopAnim(); if (done) done(); paint(); }
    }, 60) };
    paint();
  }

  /* ---------------------------------------------------------------- ações */
  function toggleMute(force) {
    if (!ready(force)) return;
    capture();
    muted = !muted;
    apply(force);
    CR.haptic();
  }

  function toggleBoost(force) {
    if (!ready(force)) return;
    capture();
    boost = !boost;
    apply(force);
    CR.haptic();
  }

  function swell(force) {
    if (!ready(force)) return;
    capture();
    muted = false;
    var to = [0, 1, 2].map(targetVol), from = [0, 0, 0];
    for (var p = 0; p < 3; p++) { write(p, VOL, 0, force); write(p, MOD2, targetMod2(p), force); }
    CR.haptic();
    ramp("swell", from, to, function () { if (!boost) saved = null; }, force);
  }

  function fadeOut(force) {
    if (!ready(force)) return;
    capture();
    var from = [0, 1, 2].map(function (p) { return CR.S.presets[p][VOL]; });
    CR.haptic();
    ramp("fade", from, [0, 0, 0], function () { muted = true; }, force);
  }

  /* Volta tudo ao normal (antes de carregar música ou memória). */
  function release() {
    stopAnim();
    if (!saved || !CR.S.presets) { saved = null; muted = boost = false; paint(); return; }
    muted = boost = false;
    apply(true);
  }

  /* Alguém mexeu no VOLUME ou no módulo 2 pela tela: a pessoa assumiu, então o app esquece o estado. */
  CR.on("changed", function (d) {
    if (d.live || !saved || (d.offset !== VOL && d.offset !== MOD2)) return;
    stopAnim();
    saved = null; muted = boost = false;
    paint();
    CR.toast("Ações ao vivo desligadas: você mexeu no volume.");
  });
  CR.on("status", function (st) { if (st.state !== "on") { stopAnim(); saved = null; muted = boost = false; paint(); } });

  /* ---------------------------------------------------------------- tela */
  var BTNS = [
    { id: "boost", icon: "boost", title: "Boost de solo", sub: function () { return "+" + cfg.boost + "% de volume" + (cfg.boostDelay ? " e delay" : ""); } },
    { id: "mute", icon: "mute", title: "Mudo", sub: function () { return "Corta o som na hora"; } },
    { id: "swell", icon: "swell", title: "Swell", sub: function () { return "Entrada suave em " + cfg.fade + " s"; } },
    { id: "fade", icon: "fade", title: "Fade out", sub: function () { return "Saída suave em " + cfg.fade + " s"; } },
  ];

  function padHtml() {
    return '<div class="live-pad" id="livePad">' + BTNS.map(function (b) {
      return '<button type="button" class="live-btn" data-live="' + b.id + '">' + CR.icon(b.icon) +
        '<b>' + b.title + '</b><small class="live-sub"></small></button>';
    }).join("") + "</div>";
  }

  function bind(root) {
    root.querySelectorAll("[data-live]").forEach(function (b) {
      b.onclick = function () { ({ boost: toggleBoost, mute: toggleMute, swell: swell, fade: fadeOut })[b.dataset.live](); };
    });
    paint();
  }

  function paint() {
    document.querySelectorAll("[data-live]").forEach(function (b) {
      var id = b.dataset.live, def = BTNS.filter(function (x) { return x.id === id; })[0];
      var on = (id === "boost" && boost) || (id === "mute" && muted) || (anim && anim.kind === id);
      b.classList.toggle("on", !!on);
      b.setAttribute("aria-pressed", String(!!on));
      var sub = def.sub();
      if (id === "boost" && boost) sub = "Ligado. Toque para voltar";
      if (id === "mute" && muted) sub = "Sem som. Toque para voltar";
      if (anim && anim.kind === id) sub = id === "swell" ? "Subindo o volume" : "Baixando o volume";
      b.querySelector(".live-sub").textContent = sub;
      b.disabled = !CR.S.presets;
    });
  }

  function settingsHtml() {
    return '<div class="set-row"><div><b>Boost de solo</b><span>Quanto o volume sobe.</span></div><div class="stepper">' +
        '<button class="step" type="button" data-cfg="boost" data-d="-5" aria-label="Menos boost">' + CR.icon("minus") + '</button><b id="cfgBoost">+' + cfg.boost + '%</b>' +
        '<button class="step" type="button" data-cfg="boost" data-d="5" aria-label="Mais boost">' + CR.icon("plus") + "</button></div></div>" +
      '<div class="set-row"><div><b>Ligar o delay no Boost</b><span>Liga o módulo 2 (DELAY + MOD) junto com o Boost.</span></div><span id="swBoostDelay"></span></div>' +
      '<div class="set-row"><div><b>Tempo do Swell e do Fade</b><span>Duração da subida ou da descida.</span></div><div class="stepper">' +
        '<button class="step" type="button" data-cfg="fade" data-d="-1" aria-label="Mais rápido">' + CR.icon("minus") + '</button><b id="cfgFade">' + cfg.fade + ' s</b>' +
        '<button class="step" type="button" data-cfg="fade" data-d="1" aria-label="Mais lento">' + CR.icon("plus") + "</button></div></div>";
  }

  function bindSettings(root) {
    root.querySelectorAll("[data-cfg]").forEach(function (b) {
      b.onclick = function () {
        var k = b.dataset.cfg, d = Number(b.dataset.d);
        if (k === "boost") cfg.boost = Math.max(5, Math.min(60, cfg.boost + d));
        if (k === "fade") cfg.fade = Math.max(1, Math.min(12, cfg.fade + d));
        saveCfg();
        root.querySelector("#cfgBoost").textContent = "+" + cfg.boost + "%";
        root.querySelector("#cfgFade").textContent = cfg.fade + " s";
        if (boost) apply();
        paint();
      };
    });
    var sw = CR.makeSwitch(cfg.boostDelay, "Ligar o delay no Boost", function () {
      cfg.boostDelay = !cfg.boostDelay; saveCfg(); sw.set(cfg.boostDelay);
      if (boost) apply();
      paint();
    }, "blue");
    root.querySelector("#swBoostDelay").appendChild(sw);
  }

  return { padHtml: padHtml, bind: bind, paint: paint, settingsHtml: settingsHtml, bindSettings: bindSettings,
           toggleMute: toggleMute, toggleBoost: toggleBoost, swell: swell, fadeOut: fadeOut, release: release,
           active: function () { return !!saved || !!anim; } };
})();
