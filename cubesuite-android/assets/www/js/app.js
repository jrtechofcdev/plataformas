/* Cube Remote · Copyright (c) 2026 José Renato · Jr_Tech_OFC. Todos os direitos reservados.
   Inicialização: navegação, conexão, trava de palco e desfazer. */
"use strict";
var CR = window.CR || (window.CR = {});

CR.App = (function () {
  var $ = function (s) { return document.querySelector(s); };
  var rendered = {};

  function go(view, anchor) {
    if (view !== "tuner" && CR.Tuner.isActive()) CR.Tuner.stop();
    if (view !== "stage") CR.Stage.closeAdjust();
    document.getElementById("app").dataset.view = view;
    document.querySelectorAll(".view").forEach(function (v) { v.classList.toggle("active", v.id === "view-" + view); });
    document.querySelectorAll(".nav button").forEach(function (b) {
      var on = b.dataset.go === view;
      b.classList.toggle("active", on);
      if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    if (view === "learn" && !rendered.learn) { CR.Learn.render(); rendered.learn = true; }
    if (view === "tools") { if (!rendered.tools) { CR.Tools.render(); rendered.tools = true; } else CR.Tools.refresh(); }
    if (view === "settings") CR.Settings.render();
    if (view === "tuner") CR.Tuner.start();
    if (view === "memory") CR.Memory.render();
    if (anchor && view === "learn") setTimeout(function () { CR.Learn.scrollTo(anchor); }, 30);
  }

  /* ---------------------------------------------------------------- conexão */
  function applyStatus(st) {
    CR.S.status = st;
    if (st.state === "on" && st.presets) CR.S.presets = st.presets;
    if (st.factory) CR.S.factory = st.factory;
    if (st.state !== "on") CR.S.presets = null;
    var chip = $("#btnStatus");
    chip.className = "chip " + (st.state === "on" ? (st.mock ? "sim" : "on") : st.state === "search" || st.state === "tuner" ? "search" : "off");
    chip.querySelector("span").textContent = st.state === "on" ? (st.mock ? "Simulação" : "Conectada") : st.state === "search" ? "Procurando" :
      st.state === "tuner" ? "Afinador USB" : "Desconectada";
    if (st.warning) CR.toast(st.warning, true);
    CR.Stage.showState(st);
    if (CR.S.presets) CR.Stage.refresh();
    else CR.Stage.closeAdjust();
    if (rendered.tools) CR.Tools.refresh();
    CR.Memory.refresh();
    if (document.getElementById("app").dataset.view === "settings") CR.Settings.render();
  }

  /* ---------------------------------------------------------------- trava de palco */
  function initLock() {
    var btn = $("#btnLock"), holdTimer = null;
    function paint() {
      btn.innerHTML = CR.icon(CR.S.locked ? "lock" : "unlock");
      btn.classList.toggle("active", CR.S.locked);
      btn.setAttribute("aria-label", CR.S.locked ? "Controles travados: segure para destravar" : "Travar controles");
      $("#lockShield").hidden = !CR.S.locked;
      document.getElementById("app").classList.toggle("locked", CR.S.locked);
    }
    btn.addEventListener("pointerdown", function () {
      if (!CR.S.locked) return;
      btn.classList.add("holding");
      holdTimer = setTimeout(function () {
        CR.S.locked = false; btn.dataset.justUnlocked = "1";
        btn.classList.remove("holding"); paint(); CR.haptic(); CR.toast("Controles destravados");
      }, 1000);
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach(function (ev) {
      btn.addEventListener(ev, function () { clearTimeout(holdTimer); btn.classList.remove("holding"); });
    });
    btn.addEventListener("click", function () {
      if (btn.dataset.justUnlocked) { delete btn.dataset.justUnlocked; return; }
      if (CR.S.locked) { if (!btn.classList.contains("holding")) CR.toast("Segure o cadeado por 1 segundo para destravar"); return; }
      CR.S.locked = true; paint(); CR.haptic(); CR.toast("Controles travados");
    });
    paint();
  }

  function init() {
    document.querySelectorAll("[data-icon]").forEach(function (e) { e.innerHTML = CR.icon(e.dataset.icon); });
    $("#btnUndo").innerHTML = CR.icon("undo");
    $("#btnUndo").onclick = function () { if (!CR.S.locked) CR.undo(); };
    $("#btnStatus").onclick = function () {
      if (CR.S.status.state === "on") go("settings"); else CR.native("connect");
    };
    document.querySelectorAll(".nav button").forEach(function (b) { b.onclick = function () { go(b.dataset.go); }; });
    initLock();
    CR.Stage.render();
    CR.Memory.init();
    CR.Stage.showState(CR.S.status);
    CR.on("status", applyStatus);
    CR.native("setOrientation", { mode: CR.prefs.orientation }).catch(function () {});
    CR.native("state").then(function (st) {
      applyStatus(st);
      if (st.state !== "on") CR.native("connect");
    }).catch(function (e) { CR.toast("Não consegui falar com o app: " + e.message, true); });
  }

  document.addEventListener("DOMContentLoaded", init);
  return { go: go };
})();
