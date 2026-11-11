/* Cube Remote · Copyright (c) 2026 José Renato · Jr_Tech_OFC. Todos os direitos reservados.
   Aba Afinador: nota gigante, ponteiro largo e cordas E A D G B E, legível de longe no palco.
   A detecção de nota é feita no Java (PitchDetector.java); aqui só suavizamos e desenhamos. */
"use strict";
var CR = window.CR || (window.CR = {});

CR.Tuner = (function () {
  var $ = function (s) { return document.querySelector(s); };
  var NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  /* Afinações: notas das cordas da 6ª para a 1ª (número MIDI) e o nome que aparece. "chrom" = qualquer nota. */
  var TUNINGS = [
    { id: "std",    name: "Padrão",          notes: [40, 45, 50, 55, 59, 64], labels: ["E", "A", "D", "G", "B", "E"] },
    { id: "half",   name: "Meio tom abaixo", notes: [39, 44, 49, 54, 58, 63], labels: ["Eb", "Ab", "Db", "Gb", "Bb", "Eb"] },
    { id: "whole",  name: "Um tom abaixo",   notes: [38, 43, 48, 53, 57, 62], labels: ["D", "G", "C", "F", "A", "D"] },
    { id: "dropd",  name: "Drop D",          notes: [38, 45, 50, 55, 59, 64], labels: ["D", "A", "D", "G", "B", "E"] },
    { id: "dropc",  name: "Drop C",          notes: [36, 43, 48, 53, 57, 62], labels: ["C", "G", "C", "F", "A", "D"] },
    { id: "openg",  name: "Open G",          notes: [38, 43, 50, 55, 59, 62], labels: ["D", "G", "D", "G", "B", "D"] },
    { id: "dadgad", name: "DADGAD",          notes: [38, 45, 50, 55, 57, 62], labels: ["D", "A", "D", "G", "A", "D"] },
    { id: "chrom",  name: "Cromático (qualquer nota)", notes: [], labels: [] },
  ];
  function tuning() { return TUNINGS.filter(function (t) { return t.id === (CR.prefs.tuning || "std"); })[0] || TUNINGS[0]; }
  var strobeOff = 0, lastFrame = 0, rafOn = false;
  var IN_TUNE = 3;                                   // ± cents considerado afinado
  var active = false, built = false, buf = [], cents = 0, lastNote = null, silent = 0;

  function build() {
    var v = $("#view-tuner");
    var ticks = "";
    for (var i = -50; i <= 50; i += 10) ticks += '<i class="' + (i === 0 ? "zero" : "") + '" style="--p:' + (i + 50) + '%"><span>' + (i > 0 ? "+" + i : i) + "</span></i>";
    var tu = tuning();
    var strings = tu.labels.map(function (s, i) {
      return '<span class="tr-str" data-i="' + i + '">' + s + "<small>" + (6 - i) + "ª</small></span>";
    }).join("");
    v.innerHTML =
      '<div class="tuner">' +
        '<div class="tr-display">' +
          '<div class="tr-note"><b class="tr-letter">-</b><span class="tr-side"><span class="tr-acc"></span><span class="tr-oct"></span></span></div>' +
          '<div class="tr-cents">Toque uma corda</div>' +
          '<div class="meter"><div class="m-zone"></div><div class="m-ticks">' + ticks + '</div><div class="m-needle"></div></div>' +
          '<div class="strobe" aria-hidden="true"><div class="strobe-band"></div><div class="strobe-band b2"></div></div>' +
          '<div class="tr-arrows"><span class="tr-low">Baixo, aperte</span><span class="tr-hz">-- Hz</span><span class="tr-high">Alto, afrouxe</span></div>' +
          '<div class="tr-strings">' + strings + "</div>" +
          '<p class="tr-msg" hidden></p>' +
          '<p class="tr-note-usb" hidden></p>' +
        "</div>" +
        '<div class="tr-opts">' +
          '<button type="button" class="btn tr-tuning" data-tuning>' + CR.icon("tuner") + '<span class="tr-tu-name"></span></button>' +
          '<div class="seg" role="group" aria-label="Visual do afinador"><button type="button" data-view="needle">Ponteiro</button><button type="button" data-view="strobe">Estrobo</button></div>' +
          '<div class="seg" role="group" aria-label="Fonte do som">' +
            '<button type="button" data-src="mic">Mic<span class="lg">rofone</span></button><button type="button" data-src="usb"><span class="lg">Entrada </span>USB</button></div>' +
          '<div class="stepper"><button class="step" type="button" data-a4="-1" aria-label="Diminuir A4">' + CR.icon("minus") + '</button>' +
            '<b class="tr-a4"></b><button class="step" type="button" data-a4="1" aria-label="Aumentar A4">' + CR.icon("plus") + "</button></div>" +
        "</div>" +
      "</div>";
    v.querySelectorAll("[data-src]").forEach(function (b) {
      b.onclick = function () {
        CR.prefs.tunerSource = b.dataset.src;
        CR.savePrefs();
        paintOpts();
        if (active) { active = false; start(); }   // o Java troca a fonte sem desligar antes
      };
    });
    v.querySelectorAll("[data-view]").forEach(function (b) {
      b.onclick = function () { CR.prefs.tunerView = b.dataset.view; CR.savePrefs(); paintOpts(); };
    });
    v.querySelector("[data-tuning]").onclick = chooseTuning;
    v.querySelectorAll("[data-a4]").forEach(function (b) {
      b.onclick = function () { CR.prefs.a4 = Math.max(430, Math.min(450, CR.prefs.a4 + Number(b.dataset.a4))); CR.savePrefs(); paintOpts(); };
    });
    built = true;
  }

  function chooseTuning() {
    var cur = tuning().id;
    CR.dialog("white", "Afinação", "Escolha a afinação da música",
      '<div class="tu-list">' + TUNINGS.map(function (t) {
        return '<button type="button" class="tu-item' + (t.id === cur ? " active" : "") + '" data-tu="' + t.id + '"><b>' + t.name + "</b><span>" +
          (t.labels.length ? t.labels.join(" ") : "Mostra a nota mais perto, sem cordas") + "</span></button>";
      }).join("") + "</div>");
    var d = document.getElementById("dialog");
    d.querySelectorAll("[data-tu]").forEach(function (b) {
      b.onclick = function () {
        CR.prefs.tuning = b.dataset.tu; CR.savePrefs(); d.hidden = true;
        built = false; var was = active; active = false; build();
        if (was) { active = true; rafOn = false; $(".tuner").classList.add("idle"); }
        paintOpts();
      };
    });
  }

  function paintOpts() {
    var view = CR.prefs.tunerView === "strobe" ? "strobe" : "needle";
    document.querySelectorAll("#view-tuner [data-view]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.view === view)); });
    var t = $(".tuner");
    if (t) t.classList.toggle("strobe-mode", view === "strobe");
    var tn = $(".tr-tu-name");
    if (tn) tn.textContent = tuning().name;
    if (view === "strobe" && active && !rafOn) { rafOn = true; lastFrame = 0; requestAnimationFrame(strobeLoop); }
    document.querySelectorAll("#view-tuner [data-src]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.src === CR.prefs.tunerSource)); });
    var a = $(".tr-a4");
    if (a) a.innerHTML = '<span class="lg">A4 </span>' + CR.prefs.a4 + " Hz";
  }

  function start() {
    if (!built) build();
    if (active) return;
    active = true;
    buf = []; lastNote = null; silent = 0;
    paintOpts();
    showMsg("");
    $(".tuner").classList.add("idle");
    rafOn = false; paintOpts();
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
    var tu = tuning(), n, name, best = -1;
    if (tu.notes.length) {
      // modo guitarra: o alvo é a corda mais perto da afinação escolhida (mostra a nota da corda)
      var dist = 99;
      tu.notes.forEach(function (sn, i) { var d = Math.abs(midi - sn); if (d < dist) { dist = d; best = i; } });
      n = tu.notes[best];
      name = tu.labels[best];
    } else {
      n = Math.round(midi);
      name = NAMES[((n % 12) + 12) % 12];
    }
    var raw = (midi - n) * 100;
    cents = n === lastNote ? cents + (raw - cents) * 0.35 : raw;
    lastNote = n;

    $(".tr-letter").textContent = name[0];
    $(".tr-acc").textContent = name.length > 1 ? name[1] : "";
    $(".tr-oct").textContent = String(Math.floor(n / 12) - 1);
    var c = Math.max(-50, Math.min(50, cents));
    var ok = Math.abs(cents) <= IN_TUNE;
    $(".tr-cents").textContent = ok ? "Afinado" : Math.abs(cents) > 50 ? (cents < 0 ? "Bem baixo, aperte mais" : "Bem alto, afrouxe mais") :
      (c > 0 ? "+" : "") + c.toFixed(0) + " cents";
    strobeCents = cents;
    $(".tr-hz").textContent = f.toFixed(1) + " Hz";
    r.style.setProperty("--pos", (c + 50) + "%");
    r.classList.toggle("in-tune", ok);
    r.classList.toggle("low", !ok && c < 0);
    r.classList.toggle("high", !ok && c > 0);

    r.querySelectorAll(".tr-str").forEach(function (el, i) { el.classList.toggle("on", i === best); });
  }

  /* Estroboscópio: as faixas andam para a esquerda quando está baixo e para a direita quando está alto;
     param quando a corda está afinada. Mostra diferenças menores que 1 cent. */
  var strobeCents = 0;
  function strobeLoop(ts) {
    var t = $(".tuner");
    if (!active || !t || !t.classList.contains("strobe-mode")) { rafOn = false; return; }
    var dt = lastFrame ? Math.min(64, ts - lastFrame) : 16;
    lastFrame = ts;
    var idle = t.classList.contains("idle");
    var speed = idle ? 0 : Math.max(-60, Math.min(60, strobeCents)) * 0.9;   // px por segundo por cent
    strobeOff = (strobeOff + speed * dt / 1000 * 4 + 4000) % 4000;
    t.style.setProperty("--strobe", strobeOff.toFixed(1) + "px");
    t.style.setProperty("--strobe2", (-strobeOff * 0.5).toFixed(1) + "px");
    requestAnimationFrame(strobeLoop);
  }

  CR.on("pitch", onPitch);
  CR.on("tunerError", function (m) { showMsg(m); });
  function showNote(m) {
    var p = $("#view-tuner .tr-note-usb");
    if (!p) return;
    p.hidden = !m;
    p.textContent = m || "";
  }

  CR.on("tunerState", function (src) {
    if (src === "usb-wait") {
      showMsg("");
      showNote("Preparando a entrada USB da pedaleira. Os controles ficam pausados enquanto o afinador USB estiver aberto e voltam sozinhos quando você sair desta aba.");
    } else if (src === "usb") {
      showNote("Entrada USB da pedaleira. Controles pausados até sair do afinador. Para afinar melhor, use um preset limpo, sem delay e sem distorção.");
    } else if (src === "mic") {
      showNote("");
    } else if (src === "none" || src === "") {
      showNote("");
      if (src === "none") showMsg("Nenhuma entrada de áudio disponível.");
    }
  });

  return { start: start, stop: stop, isActive: function () { return active; } };
})();
