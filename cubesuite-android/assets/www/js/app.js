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
      var on = b.dataset.go === (view === "learn" ? "settings" : view);
      b.classList.toggle("active", on);
      if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    if (view === "learn" && !rendered.learn) { CR.Learn.render(); rendered.learn = true; }
    if (view === "tools") { if (!rendered.tools) { CR.Tools.render(); rendered.tools = true; } else CR.Tools.refresh(); }
    if (view === "settings") CR.Settings.render();
    if (view === "tuner") CR.Tuner.start();
    if (view === "memory") CR.Memory.render();
    if (view === "culto") CR.Culto.render();
    if (anchor && view === "learn") setTimeout(function () { CR.Learn.scrollTo(anchor); }, 30);
  }

  /* ---------------------------------------------------------------- conexão */
  function applyStatus(st) {
    var was = CR.S.connected;
    CR.S.status = st;
    CR.S.connected = st.state === "on" && !!st.presets;
    if (st.factory) CR.S.factory = st.factory;
    if (CR.S.connected) { if (!was) CR.syncOnConnect(st.presets); else { CR.S.presets = st.presets; CR.saveCache(); } }
    paintChip(st);
    if (st.warning) CR.toast(st.warning, true);
    if (st.state === "off" && st.message && st.message !== "Desconectada" && st.message !== "Simulador desligado")
      CR.toast(st.message.replace(/\n/g, " ") + (/Log/.test(st.message) ? "" : " Toque em Conectar no topo para tentar de novo."), true);
    if (st.state === "on" && !st.presets && st.generation !== 2) CR.toast("Esta Cube Baby é da geração antiga: os presets não são editáveis. Use Ferramentas para os IRs.", true);
    CR.Stage.showState(st);
    CR.Stage.refresh();
    if (rendered.tools) CR.Tools.refresh();
    CR.Memory.refresh();
    if (document.getElementById("app").dataset.view === "settings") CR.Settings.render();
  }

  /* Botão de conexão no topo: "Conectar" quando a pedaleira não está ligada. */
  function paintChip(st) {
    var chip = $("#btnStatus"), s = st.state;
    chip.className = "chip " + (s === "on" ? (st.mock ? "sim" : "on") : s === "search" || s === "tuner" || s === "ensaio" ? "search" : "connect");
    chip.innerHTML = (s === "off" ? CR.icon("plug") : '<i class="dot"></i>') + "<span>" + (s === "on" ? (st.mock ? "Simulação" : "Conectada") : s === "search" ? "Procurando" :
      s === "tuner" ? "Afinador USB" : s === "ensaio" ? "Modo ensaio" : "Conectar") + "</span>";
    chip.setAttribute("aria-label", s === "on" ? "Pedaleira conectada: abrir conexão em Ajustes" : s === "off" ? "Conectar a pedaleira" : "Estado da conexão");
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
      var s = CR.S.status.state;
      if (s === "on") go("settings");
      else if (s === "search") CR.toast("Procurando a pedaleira. Se demorar, veja Ajustes > Abrir log.");
      else if (s === "ensaio") CR.native("ensaioStop");
      else if (s === "tuner") go("tuner");
      else { CR.haptic(); CR.native("connect"); }
    };
    paintChip(CR.S.status);
    document.querySelectorAll(".nav button").forEach(function (b) { b.onclick = function () { go(b.dataset.go); }; });
    initLock();
    CR.Stage.render();
    CR.Memory.init();
    CR.Library.init();
    CR.on("library", function () { CR.Stage.refresh(); CR.Memory.refresh(); });
    CR.Culto.init();
    CR.Stage.showState(CR.S.status);
    CR.on("status", applyStatus);
    CR.on("followcfg", function () { if (document.getElementById("app").dataset.view === "settings") CR.Settings.render(); });
    CR.on("delaycal", function () { if (rendered.tools) CR.Tools.render(); CR.Stage.refresh(); });
    CR.native("setOrientation", { mode: CR.prefs.orientation }).catch(function () {});
    CR.native("state").then(function (st) {
      applyStatus(st);
      if (st.state !== "on") CR.native("connect");
    }).catch(function (e) { CR.toast("Não consegui falar com o app: " + e.message, true); });
  }

  document.addEventListener("DOMContentLoaded", init);
  return { go: go };
})();
