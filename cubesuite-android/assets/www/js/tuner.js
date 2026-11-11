/* Cube Remote · Copyright (c) 2026 José Renato · Jr_Tech_OFC. Todos os direitos reservados.
   Aba Afinador: nota gigante, ponteiro largo e cordas E A D G B E, legível de longe no palco.
   A detecção de nota é feita no Java (PitchDetector.java); aqui só suavizamos e desenhamos. */
"use strict";
var CR = window.CR || (window.CR = {});

CR.Tuner = (function () {
  var $ = function (s) { return document.querySelector(s); };
  var NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  var STRINGS = [40, 45, 50, 55, 59, 64];          // E2 A2 D3 G3 B3 E4 (MIDI)
  var IN_TUNE = 3;                                   // ± cents considerado afinado
  var active = false, built = false, buf = [], cents = 0, lastNote = null, silent = 0;

  function build() {
    var v = $("#view-tuner");
    var ticks = "";
    for (var i = -50; i <= 50; i += 10) ticks += '<i class="' + (i === 0 ? "zero" : "") + '" style="--p:' + (i + 50) + '%"><span>' + (i > 0 ? "+" + i : i) + "</span></i>";
    var strings = ["E", "A", "D", "G", "B", "E"].map(function (s, i) {
      return '<span class="tr-str" data-i="' + i + '">' + s + "<small>" + (6 - i) + "ª</small></span>";
    }).join("");
    v.innerHTML =
      '<div class="tuner">' +
        '<div class="tr-display">' +
          '<div class="tr-note"><b class="tr-letter">-</b><span class="tr-side"><span class="tr-acc"></span><span class="tr-oct"></span></span></div>' +
          '<div class="tr-cents">Toque uma corda</div>' +
          '<div class="meter"><div class="m-zone"></div><div class="m-ticks">' + ticks + '</div><div class="m-needle"></div></div>' +
          '<div class="tr-arrows"><span class="tr-low">Baixo, aperte</span><span class="tr-hz">-- Hz</span><span class="tr-high">Alto, afrouxe</span></div>' +
          '<div class="tr-strings">' + strings + "</div>" +
          '<p class="tr-msg" hidden></p>' +
        "</div>" +
        '<div class="tr-opts">' +
          '<div class="seg" role="group" aria-label="Fonte do som">' +
            '<button type="button" data-src="mic">Microfone</button><button type="button" data-src="usb">Entrada USB</button></div>' +
          '<div class="stepper"><button class="step" type="button" data-a4="-1" aria-label="Diminuir A4">' + CR.icon("minus") + '</button>' +
            '<b class="tr-a4"></b><button class="step" type="button" data-a4="1" aria-label="Aumentar A4">' + CR.icon("plus") + "</button></div>" +
        "</div>" +
      "</div>";
    v.querySelectorAll("[data-src]").forEach(function (b) {
      b.onclick = function () {
        CR.prefs.tunerSource = b.dataset.src;
        CR.savePrefs();
        paintOpts();
        if (active) { stop(); start(); }
      };
    });
    v.querySelectorAll("[data-a4]").forEach(function (b) {
      b.onclick = function () { CR.prefs.a4 = Math.max(430, Math.min(450, CR.prefs.a4 + Number(b.dataset.a4))); CR.savePrefs(); paintOpts(); };
    });
    built = true;
  }

  function paintOpts() {
    document.querySelectorAll("#view-tuner [data-src]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.src === CR.prefs.tunerSource)); });
    var a = $(".tr-a4");
    if (a) a.textContent = "A4 " + CR.prefs.a4 + " Hz";
  }

  function start() {
    if (!built) build();
    if (active) return;
    active = true;
    buf = []; lastNote = null; silent = 0;
    paintOpts();
    showMsg("");
    $(".tuner").classList.add("idle");
    CR.native("tunerStart", { source: CR.prefs.tunerSource }).catch(function (e) { showMsg(e.message); });
  }

  function stop() {
    if (!active) return;
    active = false;
    CR.native("tunerStop").catch(function () {});
  }

  function showMsg(m) {
    var p = $("#view-tuner .tr-msg");
    if (!p) return;
    p.hidden = !m;
    p.textContent = m || "";
  }

  function onPitch(p) {
    if (!active) return;
    var r = $(".tuner");
    if (!(p.hz > 0) || p.clarity < 0.8) {
      if (++silent > 12) {
        r.classList.add("idle");
        r.classList.remove("in-tune", "low", "high");
        $(".tr-cents").textContent = "Toque uma corda";
        r.querySelectorAll(".tr-str").forEach(function (el) { el.classList.remove("on"); });
      }
      return;
    }
    silent = 0;
    r.classList.remove("idle");
    buf.push(p.hz);
    if (buf.length > 5) buf.shift();
    var f = buf.slice().sort(function (a, b) { return a - b; })[Math.floor(buf.length / 2)];
    var midi = 69 + 12 * Math.log2(f / CR.prefs.a4);
    var n = Math.round(midi);
    var raw = (midi - n) * 100;
    cents = n === lastNote ? cents + (raw - cents) * 0.35 : raw;
    lastNote = n;

    var name = NAMES[((n % 12) + 12) % 12];
    $(".tr-letter").textContent = name[0];
    $(".tr-acc").textContent = name.length > 1 ? "#" : "";
    $(".tr-oct").textContent = String(Math.floor(n / 12) - 1);
    var c = Math.max(-50, Math.min(50, cents));
    var ok = Math.abs(c) <= IN_TUNE;
    $(".tr-cents").textContent = ok ? "Afinado" : (c > 0 ? "+" : "") + c.toFixed(0) + " cents";
    $(".tr-hz").textContent = f.toFixed(1) + " Hz";
    r.style.setProperty("--pos", (c + 50) + "%");
    r.classList.toggle("in-tune", ok);
    r.classList.toggle("low", !ok && c < 0);
    r.classList.toggle("high", !ok && c > 0);

    var best = -1, dist = 99;
    STRINGS.forEach(function (s, i) { var d = Math.abs(midi - s); if (d < dist) { dist = d; best = i; } });
    if (dist > 3) best = -1;
    r.querySelectorAll(".tr-str").forEach(function (el, i) { el.classList.toggle("on", i === best); });
  }

  CR.on("pitch", onPitch);
  CR.on("tunerError", function (m) { showMsg(m); });
  CR.on("tunerState", function (src) {
    if (src === "none") showMsg("Nenhuma entrada de áudio disponível.");
  });

  return { start: start, stop: stop, isActive: function () { return active; } };
})();
