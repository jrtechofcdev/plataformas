/* Cube Remote · Copyright (c) 2026 José Renato · Jr_Tech_OFC. Todos os direitos reservados.
   Componentes de controle: knob (réplica do knob da pedaleira) e slider.
   Os dois só mudam o valor depois de 6 px de arrasto; um toque simples não altera nada. */
"use strict";
var CR = window.CR || (window.CR = {});

(function () {
  var DRAG_PX = 6;          // arrasto mínimo antes de mudar o valor
  var KNOB_TRAVEL = 170;    // px de arrasto para o curso inteiro do knob

  function polar(r, deg) {
    var a = (deg - 90) * Math.PI / 180;
    return [50 + r * Math.cos(a), 50 + r * Math.sin(a)];
  }
  function arc(r, from, to) {
    if (Math.abs(to - from) < 0.01) to = from + 0.01;
    var a = polar(r, Math.min(from, to)), b = polar(r, Math.max(from, to));
    var large = Math.abs(to - from) > 180 ? 1 : 0;
    return "M" + a[0].toFixed(2) + " " + a[1].toFixed(2) + " A" + r + " " + r + " 0 " + large + " 1 " + b[0].toFixed(2) + " " + b[1].toFixed(2);
  }
  function angle(c, v) { return -135 + (v / c.max) * 270; }

  /* ---------------------------------------------------------------- KNOB */
  CR.makeKnob = function (c, opts) {
    opts = opts || {};
    var el = document.createElement("div");
    el.className = "knob";
    el.style.setProperty("--led", "var(--led-" + c.color + ")");
    el.tabIndex = 0;
    el.setAttribute("role", "slider");
    el.setAttribute("aria-label", c.label + ", " + c.name);
    el.setAttribute("aria-valuemin", "0");
    el.setAttribute("aria-valuemax", String(c.max));

    var ticks = "";
    if (c.list || c.bipolar) {
      var n = c.list ? c.max : 2;
      for (var i = 0; i <= n; i++) {
        var p = polar(49, -135 + i * 270 / n);
        ticks += '<circle cx="' + p[0].toFixed(2) + '" cy="' + p[1].toFixed(2) + '" r="1.7" class="k-tick"/>';
      }
    }
    var grooves = "";
    for (var g = 0; g < 24; g++) {
      var q = polar(37, g * 15), q2 = polar(32, g * 15);
      grooves += '<line x1="' + q[0].toFixed(2) + '" y1="' + q[1].toFixed(2) + '" x2="' + q2[0].toFixed(2) + '" y2="' + q2[1].toFixed(2) + '"/>';
    }
    el.innerHTML =
      '<svg viewBox="0 0 100 100" aria-hidden="true">' +
        '<path class="k-track" d="' + arc(45, -135, 135) + '"/>' +
        '<path class="k-arc" d=""/>' + ticks +
        '<circle class="k-skirt" cx="50" cy="50" r="37"/>' +
        '<g class="k-grooves">' + grooves + '</g>' +
        '<circle class="k-cap" cx="50" cy="50" r="23"/>' +
        '<circle class="k-glow" cx="50" cy="50" r="17"/>' +
        '<line class="k-pointer" x1="50" y1="50" x2="50" y2="20"/>' +
      "</svg>";
    var arcEl = el.querySelector(".k-arc"), ptr = el.querySelector(".k-pointer");

    function draw() {
      var v = CR.val(c), a = angle(c, v);
      var from = c.bipolar ? angle(c, c.zero) : -135;
      arcEl.setAttribute("d", arc(45, from, a));
      ptr.setAttribute("transform", "rotate(" + a.toFixed(1) + " 50 50)");
      el.classList.toggle("on", CR.isActive(c));
      el.setAttribute("aria-valuenow", String(v));
      el.setAttribute("aria-valuetext", CR.format(c, v).long);
    }
    function setV(v) {
      v = Math.max(0, Math.min(c.max, Math.round(v)));
      var changed = CR.set(c.off, v);
      if (changed && (c.list || c.bipolar || c.max <= 15)) CR.haptic();
    }

    var start = null;
    el.addEventListener("pointerdown", function (e) {
      if (CR.S.locked || el.classList.contains("disabled")) return;
      el.setPointerCapture(e.pointerId);
      start = { y: e.clientY, v: CR.val(c), t: Date.now(), drag: false };
    });
    el.addEventListener("pointermove", function (e) {
      if (!start) return;
      var dy = start.y - e.clientY;
      if (!start.drag && Math.abs(dy) < DRAG_PX) return;
      if (!start.drag) { start.drag = true; start.y = e.clientY; dy = 0; el.classList.add("dragging"); }
      setV(start.v + dy / KNOB_TRAVEL * c.max);
    });
    function end() {
      if (!start) return;
      var tapped = !start.drag && Date.now() - start.t < 600;
      start = null;
      el.classList.remove("dragging");
      if (tapped && opts.onTap) opts.onTap(c);
    }
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", function () { start = null; el.classList.remove("dragging"); });
    el.addEventListener("keydown", function (e) {
      var step = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 5, PageDown: -5 }[e.key];
      if (step) { e.preventDefault(); setV(CR.val(c) + step); }
      if (e.key === "Enter" && opts.onTap) opts.onTap(c);
    });
    el.update = draw;
    draw();
    return el;
  };

  /* ---------------------------------------------------------------- SLIDER */
  CR.makeSlider = function (c, opts) {
    opts = opts || {};
    var el = document.createElement("div");
    el.className = "slider" + (c.bipolar ? " bipolar" : "") + (opts.big ? " big" : "");
    el.style.setProperty("--led", "var(--led-" + c.color + ")");
    el.tabIndex = 0;
    el.setAttribute("role", "slider");
    el.setAttribute("aria-label", c.label + ", " + c.name);
    el.setAttribute("aria-valuemin", "0");
    el.setAttribute("aria-valuemax", String(c.max));
    var marks = "";
    if (c.list) for (var i = 0; i <= c.max; i++) marks += '<i style="left:' + (i / c.max * 100) + '%"></i>';
    el.innerHTML = '<div class="s-track"><div class="s-fill"></div>' +
      (c.bipolar ? '<div class="s-center"></div>' : "") + '<div class="s-marks">' + marks + '</div></div><div class="s-thumb"></div>';
    var fill = el.querySelector(".s-fill"), thumb = el.querySelector(".s-thumb");

    function draw() {
      var v = CR.val(c), f = v / c.max * 100;
      var z = c.bipolar ? c.zero / c.max * 100 : 0;
      fill.style.left = Math.min(z, f) + "%";
      fill.style.width = Math.abs(f - z) + "%";
      thumb.style.left = f + "%";
      el.classList.toggle("on", CR.isActive(c));
      el.setAttribute("aria-valuenow", String(v));
      el.setAttribute("aria-valuetext", CR.format(c, v).long);
    }
    function setV(v) {
      v = Math.max(0, Math.min(c.max, Math.round(v)));
      if (CR.set(c.off, v) && (c.list || c.bipolar || c.max <= 15)) CR.haptic();
    }
    var start = null;
    el.addEventListener("pointerdown", function (e) {
      if (CR.S.locked || el.classList.contains("disabled")) return;
      el.setPointerCapture(e.pointerId);
      start = { x: e.clientX, v: CR.val(c), w: el.querySelector(".s-track").getBoundingClientRect().width, drag: false };
    });
    el.addEventListener("pointermove", function (e) {
      if (!start) return;
      var dx = e.clientX - start.x;
      if (!start.drag && Math.abs(dx) < DRAG_PX) return;
      if (!start.drag) { start.drag = true; start.x = e.clientX; dx = 0; el.classList.add("dragging"); }
      setV(start.v + dx / start.w * c.max);
    });
    function end() { start = null; el.classList.remove("dragging"); }
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("keydown", function (e) {
      var step = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 5, PageDown: -5 }[e.key];
      if (step) { e.preventDefault(); setV(CR.val(c) + step); }
    });
    el.update = draw;
    draw();
    return el;
  };

  /* Chave liga/desliga (ativo ou zerado) */
  CR.makeSwitch = function (on, label, onChange, color) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "switch";
    if (color) b.style.setProperty("--led", "var(--led-" + color + ")");
    b.setAttribute("role", "switch");
    b.setAttribute("aria-label", label);
    b.innerHTML = "<span></span>";
    b.set = function (v) { b.setAttribute("aria-checked", v ? "true" : "false"); };
    b.set(on);
    b.addEventListener("click", function () { if (!CR.S.locked) onChange(); });
    return b;
  };
})();
