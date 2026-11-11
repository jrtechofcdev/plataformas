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

  /* ================================================================ IR */
  var IR = { data: null, slot: 0 };

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
    for (var i = 0; i < Math.min(512, frames); i++) {
      var o = data.off + i * align, v;
      if (fmtTag === 3 && w === 4) v = d.getFloat32(o, true);
      else if (fmtTag === 3 && w === 8) v = d.getFloat64(o, true);
      else if (fmtTag === 1 && w === 1) v = (d.getUint8(o) - 128) / 128;
      else if (fmtTag === 1 && w === 2) v = d.getInt16(o, true) / 32767;
      else if (fmtTag === 1 && w === 3) { var x = d.getUint8(o) | (d.getUint8(o + 1) << 8) | (d.getUint8(o + 2) << 16); if (x & 0x800000) x -= 0x1000000; v = x / 8388608; }
      else if (fmtTag === 1 && w === 4) v = d.getInt32(o, true) / 2147483648;
      else throw new Error("Formato WAV não suportado (" + bits + " bits)");
      out.push(Math.round(v * 1e6) / 1e6);
    }
    while (out.length < 512) out.push(0);
    return { samples: out, rate: rate, bits: bits, frames: frames };
  }

  function drawWave(s) {
    var c = $("#irWave"), g = c.getContext("2d"), w = c.width, h = c.height, mid = h / 2;
    g.clearRect(0, 0, w, h);
    g.strokeStyle = "#2b313b"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, mid); g.lineTo(w, mid); g.stroke();
    var peak = Math.max.apply(null, s.map(Math.abs).concat([1e-9]));
    g.strokeStyle = "#38e27c"; g.lineWidth = 2.5; g.beginPath();
    s.forEach(function (v, i) { var x = i / (s.length - 1) * w, y = mid - v / peak * (mid - 8); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.stroke();
  }

  async function loadWav(file) {
    if (!file) return;
    try {
      var ir = readWav(await file.arrayBuffer());
      ir.name = file.name;
      IR.data = ir;
      irUi();
      drawWave(ir.samples);
      if (!CR.S.presets && CR.S.status.state !== "on") { CR.toast("IR carregado. Conecte a pedaleira para ouvir."); return; }
      CR.busy(true, "Enviando prévia do IR");
      await CR.native("irPreview", { samples: ir.samples, distance: Number($("#irDist").value) });
      CR.toast("IR tocando na pedaleira (prévia, ainda não salvo)");
      if ([44100, 48000].indexOf(ir.rate) < 0) CR.toast("O arquivo está em " + ir.rate + " Hz. Prefira IRs em 44,1 ou 48 kHz.", true);
    } catch (e) { CR.toast(e.message, true); }
    finally { CR.busy(false); }
  }

  function irUi() {
    var root = $("#irCard");
    if (!root) return;
    var has = !!IR.data, on = CR.S.status.state === "on";
    var blocked = CR.S.status.irWritable === false;
    $(".ir-empty", root).hidden = has;
    $(".ir-loaded", root).hidden = !has;
    if (has) {
      $(".ir-name", root).textContent = IR.data.name;
      $(".ir-meta", root).textContent = IR.data.rate + " Hz · " + IR.data.bits + " bits · " + IR.data.frames + " amostras";
    }
    root.querySelectorAll("[data-slot]").forEach(function (b) { b.setAttribute("aria-pressed", String(Number(b.dataset.slot) === IR.slot)); });
    var save = $("#irSave", root);
    save.disabled = !has || !on || blocked;
    save.innerHTML = CR.icon(blocked ? "lock" : "send") + "<span>" + (blocked ? "Gravação de IR bloqueada neste modelo" : "Salvar no slot " + (IR.slot + 2) + " do IR CAB") + "</span>";
    $("#irDistVal").textContent = $("#irDist").value + "%";
  }

  function irHtml() {
    var slots = "";
    for (var i = 0; i < 8; i++) slots += '<button type="button" data-slot="' + i + '">' + (i + 2) + "</button>";
    return '<article class="card" id="irCard"><header class="card-head">' + CR.icon("wave") + "<div><h2>Importar IR</h2><p>Troque um gabinete do IR CAB por um arquivo .wav seu.</p></div></header>" +
      '<label class="drop"><input id="wavInput" type="file" accept=".wav,audio/*" hidden>' +
      '<span class="ir-empty">' + CR.icon("file") + "<b>Escolher arquivo .wav</b><small>São usadas as 512 primeiras amostras (canal esquerdo), como no programa original.</small></span>" +
      '<span class="ir-loaded" hidden><b class="ir-name"></b><small class="ir-meta"></small><canvas id="irWave" width="800" height="180"></canvas><small>Toque para trocar o arquivo</small></span></label>' +
      '<div class="field"><div class="field-head"><span>Distância do microfone</span><b id="irDistVal">50%</b></div>' +
      '<input id="irDist" class="range green" type="range" min="1" max="100" value="50" aria-label="Distância do microfone"></div>' +
      '<div class="field"><div class="field-head"><span>Slot do IR CAB que será substituído</span></div><div class="slots">' + slots + "</div></div>" +
      '<button class="btn primary wide" type="button" id="irSave"></button>' +
      '<p class="hint">A posição 1 do IR CAB é "desligado", por isso os slots graváveis vão de 2 a 9.</p></article>';
  }

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
    v.innerHTML = '<div class="page"><h1 class="page-title">Ferramentas</h1>' + metroHtml() + irHtml() + presetsHtml() + "</div>";
    // metrônomo
    v.querySelectorAll("[data-bpm]").forEach(function (b) { b.onclick = function () { setBpm(M.bpm + Number(b.dataset.bpm)); }; });
    $("#bpmRange").oninput = function (e) { setBpm(Number(e.target.value)); };
    v.querySelectorAll("[data-beats]").forEach(function (b) {
      b.onclick = function () { M.beats = Number(b.dataset.beats); CR.store.set("cr.metro.beats", M.beats); M.beat = 0; metroUi(); };
    });
    $("#metroTap").onclick = tap;
    $("#metroPlay").onclick = function () { M.running ? metroStop() : metroStart(); };
    metroUi();
    // IR
    $("#wavInput").onchange = function (e) { loadWav(e.target.files[0]); e.target.value = ""; };
    var dist = $("#irDist");
    dist.oninput = function () { $("#irDistVal").textContent = dist.value + "%"; dist.style.setProperty("--p", dist.value + "%"); };
    dist.oninput();
    dist.onchange = function () {
      if (CR.S.status.state !== "on") return;
      CR.native("irDistance", { distance: Number(dist.value) }).catch(function (e) { CR.toast(e.message, true); });
    };
    v.querySelectorAll("[data-slot]").forEach(function (b) { b.onclick = function () { IR.slot = Number(b.dataset.slot); irUi(); }; });
    $("#irSave").onclick = async function () {
      var slotN = IR.slot + 2;
      if (!(await CR.confirm("Salvar IR", 'Gravar "' + CR.esc(IR.data.name) + '" no slot ' + slotN + " do IR CAB? O gabinete que estava nesse slot será substituído.", "Gravar"))) return;
      CR.busy(true, "Gravando no slot " + slotN);
      try { await CR.native("irSave", { slot: IR.slot, samples: IR.data.samples, distance: Number(dist.value) }); CR.toast("IR salvo no slot " + slotN); }
      catch (e) { CR.toast(e.message, true); }
      finally { CR.busy(false); }
    };
    irUi();
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
    var on = CR.S.status.state === "on" && !!CR.S.presets;
    ["#pSend", "#pReload", "#pFactory"].forEach(function (s) { var b = $(s); if (b) b.disabled = !on; });
    var sw = document.querySelector("#loopSw .switch");
    if (sw) { sw.disabled = !on; sw.set(!!CR.S.status.loopback); }
    irUi();
  }

  return { render: render, refresh: refresh };
})();
