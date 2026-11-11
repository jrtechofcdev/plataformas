/* Cube Remote · Copyright (c) 2026 José Renato · Jr_Tech_OFC. Todos os direitos reservados.
   Afinador na tela Pedal. Como no afinador da pedaleira: os knobs IR CAB, REVERB, MIX, FB, TIME e MOD
   acendem para a corda E A D G B E, e TONE / GAIN / TYPE indicam baixo / afinado / alto.
   Além disso mostra nota, cents e Hz com precisão (detecção no Java, PitchDetector.java). */
"use strict";
var CR = window.CR || (window.CR = {});

CR.Tuner = (function () {
  var $ = function (s) { return document.querySelector(s); };
  var NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  var STRINGS = [40, 45, 50, 55, 59, 64];          // E2 A2 D3 G3 B3 E4 (MIDI)
  var STRING_KEYS = ["irCab", "reverb", "mix", "fb", "time", "mod"];
  var IN_TUNE = 3;                                   // ± cents considerado afinado
  var active = false, buf = [], cents = 0, lastNote = null, silent = 0, ro = null;

  function build() {
    var r = $("#tunerReadout");
    var ticks = "";
    for (var i = -50; i <= 50; i += 10) ticks += '<i class="' + (i === 0 ? "zero" : "") + '" style="--p:' + (i + 50) + '%"><span>' + (i > 0 ? "+" + i : i) + "</span></i>";
    var strings = ["E", "A", "D", "G", "B", "E"].map(function (s, i) {
      return '<span class="tr-str" data-i="' + i + '">' + s + "<small>" + (i === 0 ? "6" : i === 5 ? "1" : String(6 - i)) + "</small></span>";
    }).join("");
    r.innerHTML =
      '<div class="tr-head"><span class="tr-src">Microfone</span><span class="tr-a4"></span></div>' +
      '<div class="tr-note"><b class="tr-letter">-</b><span class="tr-acc"></span><span class="tr-oct"></span></div>' +
      '<div class="tr-cents">Toque uma corda</div>' +
      '<div class="meter"><div class="m-zone"></div><div class="m-ticks">' + ticks + '</div><div class="m-needle"></div></div>' +
      '<div class="tr-hz">-- Hz</div>' +
      '<div class="tr-strings">' + strings + "</div>" +
      '<p class="tr-msg" hidden></p>' +
      '<button class="btn" type="button" data-exit>' + CR.icon("close") + "<span>Sair do afinador</span></button>";
    r.querySelector("[data-exit]").onclick = stop;
    if (window.ResizeObserver && !ro) {
      ro = new ResizeObserver(function () { r.classList.toggle("vertical", r.clientHeight > r.clientWidth * 1.25); });
      ro.observe(r);
    }
  }

  function start() {
    if (active) return;
    active = true;
    buf = []; lastNote = null; silent = 0;
    build();
    $("#tunerReadout").hidden = false;
    $("#panel").dataset.mode = "tuner";
    $("#btnTuner").classList.add("active");
    $(".tr-a4").textContent = "A4 = " + CR.prefs.a4 + " Hz";
    CR.native("tunerStart", { source: CR.prefs.tunerSource }).catch(function (e) { showMsg(e.message); });
  }

  function stop() {
    if (!active) return;
    active = false;
    CR.native("tunerStop").catch(function () {});
    $("#tunerReadout").hidden = true;
    $("#panel").dataset.mode = "edit";
    $("#btnTuner").classList.remove("active");
    lightKnobs(-1, 0, false);
  }

  function showMsg(m) {
    var p = $("#tunerReadout .tr-msg");
    if (!p) return;
    p.hidden = !m;
    p.textContent = m || "";
  }

  function lightKnobs(stringIdx, c, hasNote) {
    var rows = CR.Pedal.rows();
    CR.CONTROLS.forEach(function (ctl) {
      var r = rows[ctl.off];
      if (!r) return;
      var lit = false;
      if (hasNote && ctl.string) lit = STRING_KEYS[stringIdx] === ctl.key;
      if (hasNote && ctl.tuner === "low") lit = c < -IN_TUNE;
      if (hasNote && ctl.tuner === "ok") lit = Math.abs(c) <= IN_TUNE;
      if (hasNote && ctl.tuner === "high") lit = c > IN_TUNE;
      r.classList.toggle("tuner-lit", lit);
    });
  }

  function onPitch(p) {
    if (!active) return;
    var r = $("#tunerReadout");
    if (!(p.hz > 0) || p.clarity < 0.8) {
      if (++silent > 12) { r.classList.add("idle"); lightKnobs(-1, 0, false); $(".tr-cents").textContent = "Toque uma corda"; }
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
    $(".tr-cents").textContent = ok ? "Afinado" : (c < 0 ? "Baixo, " : "Alto, ") + (c > 0 ? "+" : "") + c.toFixed(0) + " cents";
    $(".tr-hz").textContent = f.toFixed(2) + " Hz";
    r.style.setProperty("--pos", (c + 50) + "%");
    r.classList.toggle("in-tune", ok);

    var best = -1, dist = 99;
    STRINGS.forEach(function (s, i) { var d = Math.abs(midi - s); if (d < dist) { dist = d; best = i; } });
    if (dist > 3) best = -1;
    r.querySelectorAll(".tr-str").forEach(function (el, i) { el.classList.toggle("on", i === best); });
    lightKnobs(best, c, true);
  }

  CR.on("pitch", onPitch);
  CR.on("tunerError", function (m) { showMsg(m); });
  CR.on("tunerState", function (src) {
    var s = document.querySelector(".tr-src");
    if (s) s.textContent = src === "usb" ? "Entrada USB" : src === "mic" ? "Microfone" : "Sem entrada";
  });

  return { start: start, stop: stop, toggle: function () { active ? stop() : start(); }, isActive: function () { return active; } };
})();
