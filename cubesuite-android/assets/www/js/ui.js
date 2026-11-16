/* Cube Remote · Copyright (c) 2026 José Renato · Jr_Tech_OFC. Todos os direitos reservados.
   Acabamento e movimento da interface: troca de abas deslizando, destaque da barra em pílula, onda de luz no toque,
   números que rolam, entrada em cascata das listas, janela que cresce a partir do controle e arrastar para fechar.
   Tudo aqui é só visual: se algo falhar, o app continua funcionando igual (sem animação).
   Ajustes > Tela > Animações: "Leves" desliga os efeitos (bom para celulares mais simples). */
"use strict";
var CR = window.CR || (window.CR = {});

CR.UI = (function () {
  var root = document.documentElement;
  var EASE = "cubic-bezier(.22, 1, .36, 1)";
  var reduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

  /* ---------------------------------------------------------------- preferência de animação */
  function lite() { return CR.prefs.motion === "lite" || !!(reduce && reduce.matches); }
  function applyMotion() { root.dataset.motion = lite() ? "lite" : "full"; }
  applyMotion();
  if (reduce && reduce.addEventListener) reduce.addEventListener("change", applyMotion);

  /* Roda uma animação (Web Animations) só no modo completo; devolve a animação ou null. */
  function anim(el, frames, opts) {
    if (!el || lite() || !el.animate) return null;
    try { return el.animate(frames, opts); } catch (_) { return null; }
  }

  /* ---------------------------------------------------------------- onda de luz no toque
     Uma camada fixa por cima do botão (não mexe no conteúdo do botão, então funciona mesmo
     quando o botão é redesenhado no mesmo toque). */
  var RIPPLE = ".btn, .chip, .icon-btn, .preset-btn, .module-btn, .tile, .eq-strip, .quick-btn, .slot-btn, .step-big, .zero-btn, " +
    ".nav-arrow, .adj-close, .load-btn, .live-btn, .nav-big, .chip-btn, .tu-item, .tap-btn, .step, .seg button, .mem-tabs button, " +
    ".nav button, .pulse, .fs-cand, .exp-row, .eq-more, .eq-preset";
  document.addEventListener("pointerdown", function (e) {
    if (lite() || e.button > 0 || CR.S.locked) return;
    var el = e.target.closest ? e.target.closest(RIPPLE) : null;
    if (!el || el.disabled) return;
    var r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    var cs = getComputedStyle(el), x = e.clientX - r.left, y = e.clientY - r.top;
    var d = 2 * Math.hypot(Math.max(x, r.width - x), Math.max(y, r.height - y));
    var host = document.createElement("span");
    host.className = "rip-host";
    host.style.cssText = "left:" + r.left + "px;top:" + r.top + "px;width:" + r.width + "px;height:" + r.height + "px;border-radius:" + cs.borderRadius;
    var tint = cs.getPropertyValue("--rip").trim();
    if (tint) host.style.setProperty("--rip", tint);
    var s = document.createElement("span");
    s.className = "rip";
    s.style.cssText = "left:" + (x - d / 2) + "px;top:" + (y - d / 2) + "px;width:" + d + "px;height:" + d + "px";
    host.appendChild(s);
    document.body.appendChild(host);
    setTimeout(function () { host.remove(); }, 620);
  }, { passive: true, capture: true });

  /* ---------------------------------------------------------------- barra em pílula: destaque que desliza */
  /* As posições dos botões ficam guardadas (medidas só ao abrir e ao girar a tela): trocar de aba não força o
     navegador a recalcular o layout no meio da troca. */
  var navPos = null;
  function measureNav() {
    var nav = document.querySelector(".nav");
    navPos = {};
    // a moldura fica 3 px mais larga de cada lado que o botão: o nome inteiro cabe dentro dela, longe dos cantos
    var X = 3;
    if (nav) nav.querySelectorAll("button[data-go]").forEach(function (b) {
      var l = Math.max(2, b.offsetLeft - X), r = Math.min(nav.clientWidth - 2, b.offsetLeft + b.offsetWidth + X);
      navPos[b.dataset.go] = [l, b.offsetTop, r - l, b.offsetHeight];
    });
  }
  var indAt = null, indAnim = null;
  function moveIndicator(instant) {
    var nav = document.querySelector(".nav"), ind = nav && nav.querySelector(".nav-ind"), b = nav && nav.querySelector("button.active");
    if (!ind || !b) return;
    if (!navPos || !navPos[b.dataset.go] || !navPos[b.dataset.go][2]) measureNav();
    var q = navPos[b.dataset.go], from = indAt;
    nav.style.setProperty("--ix", q[0] + "px");
    nav.style.setProperty("--iy", q[1] + "px");
    nav.style.setProperty("--iw", q[2] + "px");
    nav.style.setProperty("--ih", q[3] + "px");
    nav.classList.add("ready");
    indAt = q.slice();
    if (indAnim) { from = currentRect(ind) || from; indAnim.cancel(); indAnim = null; }
    if (instant || !from || lite() || !ind.animate || (from[0] === q[0] && from[1] === q[1])) return;
    indAnim = ind.animate(liquid(from, q), { duration: 520, easing: "linear" });
    indAnim.onfinish = function () { indAnim = null; };
  }
  /* Onde a moldura está agora (se o dedo trocar de aba no meio do movimento, ela parte dali). */
  function currentRect(ind) {
    var m = getComputedStyle(ind).transform, w = ind.offsetWidth, h = ind.offsetHeight;
    var t = m && m !== "none" ? m.match(/matrix\(([^)]+)\)/) : null;
    if (!t) return null;
    var v = t[1].split(",").map(Number);
    return [v[4], v[5], w, h];
  }
  /* Quadros do movimento "líquido": a borda da frente corre na frente (chega rápido) e a de trás
     vem atrás (sai devagar), então a moldura estica no caminho e encolhe ao chegar. */
  function liquid(a, b) {
    var vertical = a[0] === b[0], i0 = vertical ? 1 : 0, i1 = vertical ? 3 : 2, fwd = b[i0] > a[i0];
    var lead = function (t) { return 1 - Math.pow(1 - t, 3.2); };              // sai na frente
    var lag = function (t) { return t < .18 ? 0 : 1 - Math.pow(1 - (t - .18) / .82, 2.4); }; // espera um pouco e alcança
    var frames = [];
    for (var k = 0; k <= 12; k++) {
      var t = k / 12, s0 = a[i0], e0 = a[i0] + a[i1], s1 = b[i0], e1 = b[i0] + b[i1];
      var start = s0 + (s1 - s0) * (fwd ? lag(t) : lead(t)), end = e0 + (e1 - e0) * (fwd ? lead(t) : lag(t));
      var x = vertical ? a[0] : start, y = vertical ? start : a[1];
      var w = vertical ? a[2] : end - start, h = vertical ? end - start : a[3];
      frames.push({ transform: "translate(" + x.toFixed(1) + "px, " + y.toFixed(1) + "px)", width: w.toFixed(1) + "px", height: h.toFixed(1) + "px", offset: t });
    }
    return frames;
  }

  /* ---------------------------------------------------------------- troca de aba
     A tela nova entra deslizando do lado da aba escolhida enquanto a antiga some. */
  var ORDER = ["stage", "culto", "memory", "tuner", "tools", "settings", "learn"];
  function switchView(from, to) {
    var a = from && document.getElementById("view-" + from), b = document.getElementById("view-" + to);
    document.querySelectorAll(".view").forEach(function (v) { if (v !== b && v !== a) v.classList.remove("active", "leaving"); });
    if (b._va) { b._va.cancel(); b._va = null; }
    b.classList.remove("leaving");
    b.classList.add("active");
    if (!a || a === b) return;
    if (a._va) { a._va.cancel(); a._va = null; }
    a.classList.remove("active");
    if (lite()) { a.classList.remove("leaving"); return; }
    // Deslizamento no eixo da barra: para os lados em pé; para cima/baixo com o trilho deitado.
    var dir = ORDER.indexOf(to) >= ORDER.indexOf(from) ? 1 : -1;
    var rail = window.matchMedia && window.matchMedia("(orientation: landscape) and (max-height: 560px)").matches;
    var dist = Math.round(Math.max(56, Math.min(110, (rail ? window.innerHeight : window.innerWidth) * .2)));
    var mv = function (d) { return (rail ? "translateY(" : "translateX(") + d + "px)"; };
    a.classList.add("leaving");
    // a antiga some rápido (160 ms) e a nova só começa a aparecer depois de 110 ms: as duas quase não se sobrepõem
    var out = anim(a, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: mv(-dir * dist * .5) + " scale(.94)", offset: .8 },
                       { opacity: 0, transform: mv(-dir * dist * .6) + " scale(.93)" }],
      { duration: 170, easing: "cubic-bezier(.3, 0, .7, 1)", fill: "forwards" });
    function done() { a.classList.remove("leaving"); if (a._va === out) { if (out) out.cancel(); a._va = null; } }
    a._va = out;
    if (out) out.onfinish = done; else done();
    b._va = anim(b, [{ opacity: 0, transform: mv(dir * dist) + " scale(.97)" }, { opacity: 1, transform: "none" }],
      { duration: 460, delay: 110, easing: EASE, fill: "backwards" });
  }

  /* ---------------------------------------------------------------- entrada em cascata
     Os cartões visíveis entram um depois do outro (até 14, 34 ms de diferença). */
  var CASCADE = ".page > *, .mem-list > *, .lib-list > *, .culto-top > *, .song-list > li, .tu-list > *";
  function cascade(scope, opts) {
    if (!scope || lite()) return;
    opts = opts || {};
    var all = Array.prototype.slice.call(scope.querySelectorAll(opts.sel || CASCADE));
    var leaves = all.filter(function (el) { return !all.some(function (o) { return o !== el && el.contains(o); }); });
    var H = window.innerHeight, n = 0;
    leaves.forEach(function (el) {
      if (n >= (opts.max || 14)) return;
      var r = el.getBoundingClientRect();
      if (!r.height || r.bottom < 0 || r.top > H) return;
      anim(el, [{ opacity: 0, transform: "translateY(" + (opts.dy || 16) + "px)" }, { opacity: 1, transform: "none" }],
        { duration: opts.dur || 380, delay: (opts.delay || 50) + n * (opts.step || 34), easing: EASE, fill: "backwards" });
      n++;
    });
  }

  /* ---------------------------------------------------------------- número que rola
     Troca o texto; se o valor subiu, o número novo entra de baixo; se desceu, entra de cima. */
  function roll(el, text, dir) {
    if (!el || el.textContent === text) return;
    el.textContent = text;
    if (!dir || lite()) return;
    var now = performance.now();
    if (el._roll) el._roll.cancel();
    el._roll = anim(el, [{ transform: "translateY(" + (dir > 0 ? 34 : -34) + "%)", opacity: .1 }, { transform: "none", opacity: 1 }],
      { duration: now - (el._rollT || 0) < 90 ? 120 : 230, easing: EASE });
    el._rollT = now;
  }

  /* Um "pulo" curto (aviso que muda enquanto já está na tela, valor confirmado). */
  function bump(el) { anim(el, [{ transform: "scale(1)" }, { transform: "scale(1.04)" }, { transform: "scale(1)" }], { duration: 260, easing: EASE }); }

  /* ---------------------------------------------------------------- janela que cresce a partir de um botão
     Calcula a posição e o tamanho de partida (--fx, --fy, --fs) para uma tela cheia "nascer" do botão tocado
     e voltar para ele ao fechar. Sem botão, a tela só sobe um pouco. */
  function zoomFrom(el, from) {
    if (!el) return;
    var r = from && from.getBoundingClientRect && from.getBoundingClientRect();
    if (!r || !r.width || lite()) { el.style.removeProperty("--fx"); el.style.removeProperty("--fy"); el.style.removeProperty("--fs"); return; }
    var W = window.innerWidth, H = window.innerHeight, s = Math.max(.32, Math.min(1, r.width / W));
    el.style.setProperty("--fs", s.toFixed(3));
    el.style.setProperty("--fx", Math.round(r.left + r.width / 2 - s * W / 2) + "px");
    el.style.setProperty("--fy", Math.round(r.top + r.height / 2 - s * H / 2) + "px");
  }

  /* ---------------------------------------------------------------- arrastar a folha para baixo fecha */
  function dragToClose(sheet) {
    var card = sheet.querySelector(".sheet-card"), st = null;
    if (!card) return;
    card.addEventListener("pointerdown", function (e) {
      if (e.button > 0 || card.scrollTop > 2) return;
      var r = card.getBoundingClientRect();
      if (e.clientY - r.top > 70 || e.target.closest("button, input, select, textarea, a, label")) return;
      st = { y: e.clientY, t: performance.now(), id: e.pointerId, dy: 0, drag: false };
    });
    card.addEventListener("pointermove", function (e) {
      if (!st || e.pointerId !== st.id) return;
      var dy = e.clientY - st.y;
      if (!st.drag) {
        if (dy < -6) { st = null; return; }
        if (dy < 8) return;
        st.drag = true;
        try { card.setPointerCapture(e.pointerId); } catch (_) {}
        card.classList.add("dragging");
      }
      st.dy = Math.max(0, dy);
      card.style.transform = "translateY(" + st.dy + "px)";
    });
    function end() {
      if (!st) return;
      var s = st; st = null;
      if (!s.drag) return;
      var speed = s.dy / Math.max(1, performance.now() - s.t);
      card.classList.remove("dragging");
      card.style.transform = "";
      if (s.dy > 110 || (s.dy > 40 && speed > .55)) {
        card.style.setProperty("--dy", s.dy + "px");
        setTimeout(function () { card.style.removeProperty("--dy"); }, 450);
        CR.haptic();
        var bd = sheet.querySelector(".sheet-backdrop");
        if (bd) bd.click(); else sheet.hidden = true;
      }
    }
    card.addEventListener("pointerup", end);
    card.addEventListener("pointercancel", end);
  }

  /* ---------------------------------------------------------------- esqueleto enquanto carrega */
  function skeleton(n, title, before) {
    var h = '<div class="page skel-page" aria-busy="true">' + (before || "") + (title ? '<p class="skel-title">' + title + "</p>" : "");
    for (var i = 0; i < (n || 3); i++) h += '<div class="skel"><i></i><i></i><i></i></div>';
    return h + "</div>";
  }

  function init() {
    var nav = document.querySelector(".nav");
    if (nav && !nav.querySelector(".nav-ind")) {
      var ind = document.createElement("i");
      ind.className = "nav-ind";
      ind.setAttribute("aria-hidden", "true");
      nav.insertBefore(ind, nav.firstChild);
    }
    measureNav();
    moveIndicator(true);
    if (window.ResizeObserver && nav) new ResizeObserver(function () { measureNav(); moveIndicator(true); }).observe(nav);
    var d = document.getElementById("dialog");
    if (d) dragToClose(d);
  }

  return { init: init, lite: lite, applyMotion: applyMotion, moveIndicator: moveIndicator, switchView: switchView, cascade: cascade,
           roll: roll, bump: bump, zoomFrom: zoomFrom, skeleton: skeleton, anim: anim };
})();
