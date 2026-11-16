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
    if (nav) nav.querySelectorAll("button[data-go]").forEach(function (b) {
      navPos[b.dataset.go] = [b.offsetLeft, b.offsetTop, b.offsetWidth, b.offsetHeight];
    });
  }
  function moveIndicator(instant) {
    var nav = document.querySelector(".nav"), ind = nav && nav.querySelector(".nav-ind"), b = nav && nav.querySelector("button.active");
    if (!ind || !b) return;
    if (!navPos || !navPos[b.dataset.go] || !navPos[b.dataset.go][2]) measureNav();
    var q = navPos[b.dataset.go];
    if (instant) ind.style.transition = "none";
    nav.style.setProperty("--ix", q[0] + "px");
    nav.style.setProperty("--iy", q[1] + "px");
    nav.style.setProperty("--iw", q[2] + "px");
    nav.style.setProperty("--ih", q[3] + "px");
    if (instant) { void ind.offsetWidth; ind.style.transition = ""; }
    nav.classList.add("ready");
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
    var dir = ORDER.indexOf(to) >= ORDER.indexOf(from) ? 1 : -1;
    a.classList.add("leaving");
    var out = anim(a, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateX(" + (-dir * 26) + "px) scale(.99)" }],
      { duration: 170, easing: "ease-in", fill: "forwards" });
    function done() { a.classList.remove("leaving"); if (a._va === out) { if (out) out.cancel(); a._va = null; } }
    a._va = out;
    if (out) out.onfinish = done; else done();
    b._va = anim(b, [{ opacity: 0, transform: "translateX(" + (dir * 34) + "px)" }, { opacity: 1, transform: "none" }],
      { duration: 340, easing: EASE });
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
