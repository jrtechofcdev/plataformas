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

  /* ---------------------------------------------------------------- SLIDER VERTICAL (equalizador, estilo Poweramp)
     o: { label, min, max, step, value, def, tick, fmt(v), onInput(v), onCommit(v) }
     Arrastar na vertical mexe (macio, relativo ao toque); arrastar na horizontal deixa a lista rolar.
     Toque duplo volta ao padrão. Vibra a cada "tick" e marca o padrão (0 dB) com uma vibração mais firme. */
  CR.makeVSlider = function (o) {
    var el = document.createElement("div");
    el.className = "vs";
    el.tabIndex = 0;
    el.setAttribute("role", "slider");
    el.setAttribute("aria-label", o.aria || o.label);
    el.setAttribute("aria-orientation", "vertical");
    el.innerHTML = '<div class="vs-area"><div class="vs-rail"></div><div class="vs-fill"></div><div class="vs-thumb"><i></i></div></div>' +
      '<b class="vs-label"></b><span class="vs-val"></span>';
    el.querySelector(".vs-label").textContent = o.label;
    var area = el.querySelector(".vs-area"), val = el.querySelector(".vs-val");
    var v = o.value, def = o.def === undefined ? 0 : o.def, step = o.step || 0.1, tick = o.tick || 0.5;
    function q(x) { return Math.round(Math.max(o.min, Math.min(o.max, x)) / step) * step; }
    function draw() {
      var t = (v - o.min) / (o.max - o.min);
      el.style.setProperty("--t", t.toFixed(4));
      el.style.setProperty("--c", "hsl(" + Math.round(172 - 78 * t) + " 88% 52%)");
      val.textContent = o.fmt ? o.fmt(v) : v.toFixed(1).replace(".", ",");
      el.setAttribute("aria-valuenow", v.toFixed(1));
      el.setAttribute("aria-valuetext", val.textContent);
      el.classList.toggle("at-def", Math.abs(v - def) < step / 2);
    }
    function setV(nv, fromUser) {
      nv = q(nv);
      if (Math.abs(nv - v) < 1e-9) return;
      var crossedDef = (v - def) * (nv - def) <= 0 && nv !== v;
      var tickChanged = Math.floor((v + 1e-9) / tick) !== Math.floor((nv + 1e-9) / tick);
      v = nv; draw();
      if (fromUser) {
        if (crossedDef && Math.abs(nv - def) < step / 2) CR.haptic("detent");
        else if (tickChanged) CR.haptic("tick");
        if (o.onInput) o.onInput(v);
      }
    }
    var st = null, lastUp = 0;
    el.addEventListener("pointerdown", function (e) {
      if (CR.S.locked) return;
      st = { x: e.clientX, y: e.clientY, v: v, h: area.getBoundingClientRect().height - 64, drag: false, id: e.pointerId, moved: false };
    });
    el.addEventListener("pointermove", function (e) {
      if (!st) return;
      var dx = e.clientX - st.x, dy = e.clientY - st.y;
      if (!st.drag) {
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) { st = null; return; }     // é rolagem lateral
        if (Math.abs(dy) < 4) return;
        st.drag = true; st.y = e.clientY; dy = 0;
        try { el.setPointerCapture(st.id); } catch (_) {}
        el.classList.add("dragging");
      }
      e.preventDefault();
      st.moved = true;
      var nv = st.v - dy / Math.max(80, st.h) * (o.max - o.min);
      if (Math.abs(nv - def) < 0.25) nv = def;                      // "imã" suave no padrão
      setV(nv, true);
    });
    function end() {
      if (!st) return;
      var wasDrag = st.drag;
      st = null;
      el.classList.remove("dragging");
      if (wasDrag) { if (o.onCommit) o.onCommit(v); return; }
      var now = Date.now();
      if (now - lastUp < 320) { setV(def, true); CR.haptic("detent"); if (o.onCommit) o.onCommit(v); lastUp = 0; }
      else lastUp = now;
    }
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", function () { st = null; el.classList.remove("dragging"); });
    el.addEventListener("keydown", function (e) {
      var d = { ArrowUp: step, ArrowDown: -step, PageUp: 1, PageDown: -1 }[e.key];
      if (d) { e.preventDefault(); setV(v + d, true); if (o.onCommit) o.onCommit(v); }
    });
    el.set = function (nv) { v = q(nv); draw(); };
    el.get = function () { return v; };
    draw();
    return el;
  };

  /* ---------------------------------------------------------------- KNOB GRANDE (estilo Poweramp)
     o: { label, min, max, step, value, def, tick, arc (arco verde do mínimo até o valor), fmt(v), onInput, onCommit }
     Arrastar para cima ou para a direita aumenta; toque duplo volta ao padrão. */
  CR.makeBigKnob = function (o) {
    var el = document.createElement("div");
    el.className = "bk" + (o.arc ? " with-arc" : "");
    el.tabIndex = 0;
    el.setAttribute("role", "slider");
    el.setAttribute("aria-label", o.label);
    function polar(r, deg) { var a = (deg - 90) * Math.PI / 180; return [50 + r * Math.cos(a), 50 + r * Math.sin(a)]; }
    function arcPath(r, a0, a1) {
      if (a1 - a0 < 0.5) a1 = a0 + 0.5;
      var p0 = polar(r, a0), p1 = polar(r, a1);
      return "M" + p0[0].toFixed(2) + " " + p0[1].toFixed(2) + " A" + r + " " + r + " 0 " + (a1 - a0 > 180 ? 1 : 0) + " 1 " + p1[0].toFixed(2) + " " + p1[1].toFixed(2);
    }
    el.innerHTML = '<div class="bk-dial">' +
      (o.arc ? '<svg class="bk-arc" viewBox="0 0 100 100" aria-hidden="true"><path class="bk-arc-val"/></svg>' : "") +
      '<div class="bk-face"><i class="bk-dot"></i></div></div>' +
      '<div class="bk-text"><b></b><span></span></div>';
    el.querySelector(".bk-text b").textContent = o.label;
    var face = el.querySelector(".bk-face"), txt = el.querySelector(".bk-text span"), arc = el.querySelector(".bk-arc-val");
    var v = o.value, def = o.def === undefined ? o.min : o.def, step = o.step || 1, tick = o.tick || step;
    function q(x) { return Math.round(Math.max(o.min, Math.min(o.max, x)) / step) * step; }
    function draw() {
      var t = (v - o.min) / (o.max - o.min), ang = -135 + 270 * t;
      face.style.transform = "rotate(" + ang.toFixed(1) + "deg)";
      if (arc) arc.setAttribute("d", arcPath(47, -135, ang));
      txt.textContent = o.fmt ? o.fmt(v) : String(v);
      el.setAttribute("aria-valuenow", String(v));
      el.setAttribute("aria-valuetext", txt.textContent);
    }
    function setV(nv, fromUser) {
      nv = q(nv);
      if (nv === v) return;
      var crossed = (v - def) * (nv - def) <= 0;
      var tk = Math.floor(v / tick) !== Math.floor(nv / tick);
      v = nv; draw();
      if (fromUser) {
        if (crossed && nv === def) CR.haptic("detent"); else if (tk) CR.haptic("tick");
        if (o.onInput) o.onInput(v);
      }
    }
    var st = null, lastUp = 0;
    el.addEventListener("pointerdown", function (e) {
      if (CR.S.locked) return;
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      st = { x: e.clientX, y: e.clientY, v: v, drag: false };
    });
    el.addEventListener("pointermove", function (e) {
      if (!st) return;
      var d = (e.clientX - st.x) - (e.clientY - st.y);
      if (!st.drag && Math.abs(d) < 5) return;
      if (!st.drag) { st.drag = true; st.x = e.clientX; st.y = e.clientY; d = 0; el.classList.add("dragging"); }
      setV(st.v + d / 240 * (o.max - o.min), true);
    });
    function end() {
      if (!st) return;
      var wasDrag = st.drag;
      st = null; el.classList.remove("dragging");
      if (wasDrag) { if (o.onCommit) o.onCommit(v); return; }
      var now = Date.now();
      if (now - lastUp < 320) { setV(def, true); CR.haptic("detent"); if (o.onCommit) o.onCommit(v); lastUp = 0; }
      else lastUp = now;
    }
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", function () { st = null; el.classList.remove("dragging"); });
    el.addEventListener("keydown", function (e) {
      var d = { ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step }[e.key];
      if (d) { e.preventDefault(); setV(v + d, true); if (o.onCommit) o.onCommit(v); }
    });
    el.set = function (nv) { v = q(nv); draw(); };
    draw();
    return el;
  };
})();
