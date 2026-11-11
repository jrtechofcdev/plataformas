/* Cube Remote · Copyright (c) 2026 José Renato · Jr_Tech_OFC. Todos os direitos reservados.
   Componentes de controle: slider e chave liga/desliga.
   O slider só muda o valor depois de 6 px de arrasto; um toque simples não altera nada. */
"use strict";
var CR = window.CR || (window.CR = {});

(function () {
  var DRAG_PX = 6;          // arrasto mínimo antes de mudar o valor

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
