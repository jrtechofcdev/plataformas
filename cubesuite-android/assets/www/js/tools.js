/* Cube Remote · Copyright (c) 2026 José Renato · Jr_Tech_OFC. Todos os direitos reservados.
   Aba Ferramentas: metrônomo com tap tempo, importação de IR, presets e USB Loopback. */
"use strict";
var CR = window.CR || (window.CR = {});

/* Confirmação usando a mesma camada de diálogo do app (sem o confirm() do navegador). */
CR.confirm = function (title, text, okLabel) {
  return new Promise(function (resolve) {
    CR.dialog("white", title, "", "<p>" + text + "</p>" +
      '<div class="dialog-actions"><button class="btn" type="button" data-no>Cancelar</button>' +
      '<button class="btn primary" type="button" data-yes>' + (okLabel || "Confirmar") + "</button></div>");
    var d = document.getElementById("dialog");
    function done(v) { d.hidden = true; resolve(v); }
    d.querySelector("[data-yes]").onclick = function () { done(true); };
    d.querySelector("[data-no]").onclick = function () { done(false); };
    d.querySelectorAll("[data-close]").forEach(function (b) { b.onclick = function () { done(false); }; });
  });
};

CR.Tools = (function () {
  var $ = function (s, root) { return (root || document).querySelector(s); };

  /* ================================================================ METRÔNOMO */
  var M = { bpm: CR.store.get("cr.metro.bpm", 90), beats: CR.store.get("cr.metro.beats", 4), accent: true,
            running: false, ctx: null, next: 0, beat: 0, timer: null, queue: [], taps: [] };

  function click(time, strong) {
    var o = M.ctx.createOscillator(), g = M.ctx.createGain();
    o.type = "square";
    o.frequency.value = strong ? 1760 : 1100;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(strong ? 0.5 : 0.3, time + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    o.connect(g).connect(M.ctx.destination);
    o.start(time);
    o.stop(time + 0.06);
  }
  function schedule() {
    while (M.next < M.ctx.currentTime + 0.12) {
      click(M.next, M.accent && M.beat === 0);
      M.queue.push({ t: M.next, beat: M.beat });
      M.next += 60 / M.bpm;
      M.beat = (M.beat + 1) % M.beats;
    }
  }
  function drawBeats() {
    if (!M.running) return;
    var now = M.ctx.currentTime, cur = null;
    while (M.queue.length && M.queue[0].t <= now) cur = M.queue.shift();
    if (cur) {
      document.querySelectorAll(".beat").forEach(function (b, i) { b.classList.toggle("on", i === cur.beat); });
    }
    requestAnimationFrame(drawBeats);
  }
  function metroStart() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { CR.toast("Áudio indisponível neste aparelho", true); return; }
    M.ctx = M.ctx || new AC();
    M.ctx.resume();
    M.running = true; M.beat = 0; M.queue = [];
    M.next = M.ctx.currentTime + 0.06;
    M.timer = setInterval(schedule, 25);
    schedule();
    requestAnimationFrame(drawBeats);
    metroUi();
  }
  function metroStop() {
    M.running = false;
    clearInterval(M.timer);
    document.querySelectorAll(".beat").forEach(function (b) { b.classList.remove("on"); });
    metroUi();
  }
  function setBpm(v) {
    M.bpm = Math.max(30, Math.min(250, Math.round(v)));
    CR.store.set("cr.metro.bpm", M.bpm);
    metroUi();
  }
  function tap() {
    var now = performance.now();
    if (M.taps.length && now - M.taps[M.taps.length - 1] > 2000) M.taps = [];
    M.taps.push(now);
    if (M.taps.length > 5) M.taps.shift();
    if (M.taps.length >= 2) {
      var d = (M.taps[M.taps.length - 1] - M.taps[0]) / (M.taps.length - 1);
      setBpm(60000 / d);
    }
    CR.haptic();
  }
  function metroUi() {
    var root = $("#metro");
    if (!root) return;
    $(".bpm-num", root).textContent = M.bpm;
    $("#bpmRange").value = M.bpm;
    $("#bpmRange").style.setProperty("--p", ((M.bpm - 30) / 220 * 100) + "%");
    var b = $("#metroPlay");
    b.innerHTML = CR.icon(M.running ? "stop" : "play") + "<span>" + (M.running ? "Parar" : "Iniciar") + "</span>";
    b.classList.toggle("primary", !M.running);
    root.querySelectorAll("[data-beats]").forEach(function (x) { x.setAttribute("aria-pressed", String(Number(x.dataset.beats) === M.beats)); });
    $(".beats", root).innerHTML = Array.from({ length: M.beats }, function (_, i) { return '<span class="beat' + (i === 0 ? " first" : "") + '"></span>'; }).join("");
  }

  function metroHtml() {
    return '<article class="card" id="metro"><header class="card-head">' + CR.icon("tools") + "<div><h2>Metrônomo</h2><p>Toque no tempo da música ou use o Tap.</p></div></header>" +
      '<div class="bpm"><button class="step" type="button" data-bpm="-1" aria-label="Menos 1 BPM">' + CR.icon("minus") + "</button>" +
      '<div class="bpm-display"><b class="bpm-num">90</b><span>BPM</span></div>' +
      '<button class="step" type="button" data-bpm="1" aria-label="Mais 1 BPM">' + CR.icon("plus") + "</button></div>" +
      '<input id="bpmRange" class="range" type="range" min="30" max="250" step="1" aria-label="Andamento em BPM">' +
      '<div class="beats" aria-hidden="true"></div>' +
      '<div class="seg" role="group" aria-label="Tempos por compasso">' +
      [2, 3, 4, 6].map(function (n) { return '<button type="button" data-beats="' + n + '">' + n + (n === 6 ? "/8" : "/4") + "</button>"; }).join("") + "</div>" +
      '<div class="row2"><button class="btn" type="button" id="metroTap">' + CR.icon("tap") + '<span>Tap</span></button>' +
      '<button class="btn primary" type="button" id="metroPlay"></button></div>' +
      '<p class="hint">Com a pedaleira conectada, o Android costuma tocar o clique pelo áudio USB, direto no fone da pedaleira.</p></article>';
  }

  /* ================================================================ MODO ENSAIO
     O app solta o cabo para o Android tocar o som do celular (YouTube, Spotify, metrônomo) na pedaleira.
     Enquanto isso os controles ficam pausados; ao sair, tudo volta (inclusive o USB Loopback). */
  var ensaio = false;
  function ensaioHtml() {
    return '<article class="card" id="ensaioCard"><header class="card-head">' + CR.icon("headphones") + "<div><h2>Modo ensaio</h2>" +
      "<p>Toque junto com músicas do celular (YouTube, Spotify) ouvindo tudo no fone ou na saída da pedaleira.</p></div></header>" +
      '<button class="btn wide big" type="button" id="ensaioBtn"></button>' +
      '<p class="hint">Enquanto o ensaio estiver ligado, os controles do app ficam pausados (o Android não deixa usar o áudio e o controle pelo mesmo cabo ao mesmo tempo). Ao sair, o app reconecta e devolve o USB Loopback como estava, para nenhum som do celular ir para o som da igreja sem querer.</p></article>';
  }
  function paintEnsaio() {
    var b = $("#ensaioBtn");
    if (!b) return;
    var can = ensaio || CR.S.status.state === "on";
    b.disabled = !can;
    b.classList.toggle("primary", !ensaio);
    b.classList.toggle("danger", ensaio);
    b.innerHTML = CR.icon(ensaio ? "stop" : "play") + "<span>" + (ensaio ? "Sair do ensaio e voltar a controlar" : "Começar o ensaio") + "</span>";
  }
  function bindEnsaio() {
    $("#ensaioBtn").onclick = function () {
      if (ensaio) { CR.native("ensaioStop"); return; }
      CR.busy(true, "Liberando o áudio USB");
      CR.native("ensaioStart").catch(function (e) { CR.busy(false); CR.toast(e.message, true); });
    };
    paintEnsaio();
  }
  CR.on("ensaio", function (d) {
    ensaio = !!d.on;
    CR.busy(false);
    if (d.on) CR.toast(d.output ? "Pronto: o som do celular já sai na pedaleira. Abra o YouTube ou o Spotify." : "O Android não mostrou a saída de áudio da pedaleira. Tente desconectar e conectar o cabo.", !d.output);
    paintEnsaio();
  });

  /* ================================================================ PRESETS e LOOPBACK */
  function presetsHtml() {
    return '<article class="card"><header class="card-head">' + CR.icon("pedal") + "<div><h2>Presets da pedaleira</h2><p>Os 3 presets A, B e C.</p></div></header>" +
      '<button class="btn wide" type="button" id="pSend">' + CR.icon("send") + "<span>Reenviar o preset em edição</span></button>" +
      '<button class="btn wide" type="button" id="pReload">' + CR.icon("list") + "<span>Ler presets da pedaleira</span></button>" +
      '<button class="btn danger wide" type="button" id="pFactory">' + CR.icon("undo") + "<span>Restaurar presets de fábrica</span></button></article>" +
      '<article class="card"><header class="card-head">' + CR.icon("usb") + "<div><h2>USB Loopback</h2><p>Toca na saída da pedaleira o áudio que vem do celular pelo USB.</p></div>" +
      '<span id="loopSw"></span></header></article>';
  }

  function render() {
    var v = document.getElementById("view-tools");
    v.innerHTML = '<div class="page"><h1 class="page-title">Ferramentas</h1>' + metroHtml() + ensaioHtml() + CR.Delay.cardHtml() + CR.IrLab.html() + presetsHtml() + "</div>";
    // metrônomo
    v.querySelectorAll("[data-bpm]").forEach(function (b) { b.onclick = function () { setBpm(M.bpm + Number(b.dataset.bpm)); }; });
    $("#bpmRange").oninput = function (e) { setBpm(Number(e.target.value)); };
    v.querySelectorAll("[data-beats]").forEach(function (b) {
      b.onclick = function () { M.beats = Number(b.dataset.beats); CR.store.set("cr.metro.beats", M.beats); M.beat = 0; metroUi(); };
    });
    $("#metroTap").onclick = tap;
    $("#metroPlay").onclick = function () { M.running ? metroStop() : metroStart(); };
    metroUi();
    // editor de IR, delay no tempo e modo ensaio
    CR.IrLab.bind($("#irLab"));
    CR.Delay.bindCard($("#delayCard"));
    bindEnsaio();
    // presets
    $("#pSend").onclick = async function () {
      if (!CR.S.presets || CR.S.locked) return;
      var name = CR.MODULES[CR.S.preset].fs;
      CR.busy(true, "Enviando preset " + name);
      try {
        CR.S.presets = await CR.native("sendPreset", { preset: CR.S.preset, values: CR.S.presets[CR.S.preset] });
        CR.emit("preset", CR.S.preset);
        CR.toast("Preset " + name + " enviado e conferido");
      } catch (e) { CR.toast(e.message, true); }
      finally { CR.busy(false); }
    };
    $("#pReload").onclick = async function () {
      try { CR.S.presets = await CR.native("presets"); CR.emit("preset", CR.S.preset); CR.toast("Presets lidos da pedaleira"); }
      catch (e) { CR.toast(e.message, true); }
    };
    $("#pFactory").onclick = async function () {
      if (!(await CR.confirm("Restaurar presets de fábrica", "Os presets A, B e C voltam aos valores de fábrica. Os ajustes atuais serão perdidos.", "Restaurar"))) return;
      try { CR.S.presets = await CR.native("factoryPresets"); CR.S.undo = []; CR.emit("preset", CR.S.preset); CR.toast("Presets de fábrica restaurados"); }
      catch (e) { CR.toast(e.message, true); }
    };
    var lsw = CR.makeSwitch(!!CR.S.status.loopback, "USB Loopback", async function () {
      try { CR.S.status.loopback = await CR.native("loopback", { on: !CR.S.status.loopback }); lsw.set(CR.S.status.loopback); }
      catch (e) { CR.toast(e.message, true); }
    });
    $("#loopSw").appendChild(lsw);
    refresh();
  }

  function refresh() {
    paintEnsaio();
    CR.IrLab.refresh();
    var on = CR.S.status.state === "on" && !!CR.S.presets;
    ["#pSend", "#pReload", "#pFactory"].forEach(function (s) { var b = $(s); if (b) b.disabled = !on; });
    var sw = document.querySelector("#loopSw .switch");
    if (sw) { sw.disabled = !on; sw.set(!!CR.S.status.loopback); }
  }

  return { render: render, refresh: refresh, ensaioOn: function () { return ensaio; } };
})();
