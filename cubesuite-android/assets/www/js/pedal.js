/* Cube Remote · Copyright (c) 2026 José Renato · Jr_Tech_OFC. Todos os direitos reservados.
   Tela Pedal: réplica do painel (footswitches A/B/C com LED e módulos, 10 controles em knob ou slider),
   ajuste fino ao tocar num controle e explicação no botão "!". */
"use strict";
var CR = window.CR || (window.CR = {});

CR.Pedal = (function () {
  var $ = function (s) { return document.querySelector(s); };
  var controls = {};   // off -> elemento do controle (knob ou slider)
  var rows = {};       // off -> linha
  var fsEls = [];

  function infoBtn(label, onClick) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "info-btn";
    b.setAttribute("aria-label", "O que é " + label);
    b.textContent = "!";
    b.addEventListener("click", function (e) { e.stopPropagation(); onClick(); });
    return b;
  }

  /* ---------------------------------------------------------------- footswitches */
  function buildFootswitches() {
    var col = $("#fsCol");
    col.innerHTML = "";
    fsEls = [];
    CR.MODULES.forEach(function (m, i) {
      var u = document.createElement("div");
      u.className = "fs";
      u.style.setProperty("--led", "var(--led-" + m.color + ")");
      u.innerHTML =
        '<div class="fs-top"><span class="fs-led"></span><span class="fs-label">' + m.label + "</span></div>" +
        '<div class="fs-body"><span class="fs-letter">' + m.fs + '</span>' +
        '<button class="fs-btn" type="button" aria-label="Selecionar preset ' + m.fs + '"><span class="fs-ring"></span><span class="fs-cap"></span></button></div>' +
        '<div class="fs-module"><span class="fs-mod-text">Módulo ' + m.n + "</span></div>";
      u.querySelector(".fs-btn").addEventListener("click", function () {
        if (CR.S.locked) return;
        CR.S.preset = i;
        CR.haptic();
        CR.emit("preset", i);
      });
      var sw = CR.makeSwitch(CR.moduleOn(m), "Módulo " + m.n + ": " + m.name, function () {
        CR.set(m.off, CR.moduleOn(m) ? 0 : 1);
        CR.haptic();
      }, m.color);
      u.querySelector(".fs-module").prepend(sw);
      u.querySelector(".fs-module").appendChild(infoBtn("o footswitch " + m.fs, function () { CR.Pedal.footswitchInfo(m); }));
      u.sw = sw;
      col.appendChild(u);
      fsEls.push(u);
      if (i < 2) {
        var hint = document.createElement("div");
        hint.className = "fs-hint";
        hint.innerHTML = i === 0 ? "<b>EDIT/PRESET</b><span>HOLD BT</span>" : "<b>LIVE/PRESET</b><span>HOLD TUNER</span>";
        col.appendChild(hint);
      }
    });
  }

  /* ---------------------------------------------------------------- controles */
  function buildControls() {
    var col = $("#ctlCol");
    col.innerHTML = "";
    controls = {};
    rows = {};
    var style = CR.prefs.style;
    CR.CONTROLS.forEach(function (c) {
      var r = document.createElement("div");
      r.className = "ctl ctl-" + style + " mod-" + c.module;
      r.dataset.key = c.key;
      r.style.setProperty("--led", "var(--led-" + c.color + ")");
      var text = '<div class="ctl-text"><b class="ctl-label">' + c.label + '</b><span class="ctl-name">' + c.name + "</span>" +
                 '<span class="ctl-sub"></span></div>';
      var tag = '<span class="tuner-tag" aria-hidden="true">' + tunerTag(c) + "</span>";
      if (style === "knobs") {
        r.innerHTML = '<div class="ctl-knob"></div>' + text + '<div class="ctl-value"></div>' + tag;
        var k = CR.makeKnob(c, { onTap: openSheet });
        r.querySelector(".ctl-knob").appendChild(k);
        controls[c.off] = k;
      } else {
        r.innerHTML = text + '<div class="ctl-slider"></div><div class="ctl-value"></div>' + tag;
        var s = CR.makeSlider(c);
        r.querySelector(".ctl-slider").appendChild(s);
        controls[c.off] = s;
        var sw = CR.makeSwitch(CR.isActive(c), c.label + ": ativo ou zerado", function () { CR.toggleZero(c); }, c.color);
        sw.classList.add("ctl-switch");
        r.appendChild(sw);
        r.sw = sw;
      }
      r.appendChild(infoBtn(c.label, function () { CR.Pedal.info(c); }));
      col.appendChild(r);
      rows[c.off] = r;
    });
  }

  function tunerTag(c) {
    if (c.string) return c.string;
    var shapes = { low: '<svg viewBox="0 0 10 10"><path d="M2 1.5 8.5 5 2 8.5z"/></svg>',
                   ok: '<svg viewBox="0 0 10 10"><rect x="1.5" y="1.5" width="7" height="7"/></svg>',
                   high: '<svg viewBox="0 0 10 10"><path d="M8 1.5 1.5 5 8 8.5z"/></svg>' };
    return shapes[c.tuner] || "";
  }

  /* ---------------------------------------------------------------- atualização */
  function refreshControl(c) {
    var r = rows[c.off];
    if (!r) return;
    controls[c.off].update();
    var f = CR.format(c);
    r.querySelector(".ctl-value").textContent = f.short;
    var v = CR.val(c);
    r.querySelector(".ctl-sub").textContent = c.list ? f.long : (c.bipolar ? (v === c.zero ? "Desligado" : v < c.zero ? "Chorus" : "Phaser") : "");
    r.classList.toggle("has-model", !!c.list);
    r.classList.toggle("is-on", CR.isActive(c));
    var m = CR.MODULES[c.module - 1];
    r.classList.toggle("module-off", !!m && !CR.moduleOn(m));
    if (r.sw) r.sw.set(CR.isActive(c));
  }

  function refreshAll() {
    if (!CR.S.presets) return;
    CR.CONTROLS.forEach(refreshControl);
    fsEls.forEach(function (u, i) {
      u.classList.toggle("selected", i === CR.S.preset);
      u.sw.set(CR.moduleOn(CR.MODULES[i]));
      u.classList.toggle("module-off", !CR.moduleOn(CR.MODULES[i]));
    });
    var m = CR.MODULES[CR.S.preset];
    $("#editingText").textContent = "Editando o preset " + m.fs;
    $("#editingLed").style.setProperty("--led", "var(--led-" + m.color + ")");
    if (sheetControl) refreshSheet();
  }

  /* Mede a área dos controles para o CSS dimensionar knobs e textos sem rolar a tela. */
  var ro = null;
  function watchSize() {
    var panel = $("#panel"), col = $("#ctlCol");
    function measure() {
      var r = col.getBoundingClientRect();
      panel.style.setProperty("--ctlh", r.height.toFixed(1) + "px");
      panel.style.setProperty("--ctlw", r.width.toFixed(1) + "px");
    }
    if (window.ResizeObserver) { if (!ro) { ro = new ResizeObserver(measure); ro.observe(col); } }
    else window.addEventListener("resize", measure);
    measure();
  }

  function render() {
    $("#panel").dataset.style = CR.prefs.style;
    buildFootswitches();
    buildControls();
    refreshAll();
    watchSize();
  }

  /* ---------------------------------------------------------------- estados (conexão) */
  function showState(st) {
    var box = $("#pedalState"), panel = $("#panel");
    var on = st.state === "on" && CR.S.presets;
    panel.classList.toggle("offline", !on);
    $("#btnSend").disabled = !on;
    if (on) { box.hidden = true; return; }
    box.hidden = false;
    if (st.state === "search") {
      box.innerHTML = '<div class="state-card"><div class="spinner"></div><h2>Procurando a pedaleira</h2><p>' +
        CR.esc(st.message || "Verificando a conexão USB.") + "</p></div>";
      return;
    }
    if (st.state === "on" && st.generation !== 2) {
      box.innerHTML = '<div class="state-card"><h2>Modelo sem presets editáveis</h2><p>Esta Cube Baby é da geração antiga. ' +
        "Use Ferramentas para trocar os IRs.</p></div>";
      return;
    }
    box.innerHTML = '<div class="state-card">' + CR.icon("plug", "state-ico") +
      "<h2>Conecte a Cube Baby</h2><p>" + CR.esc(st.message && st.message !== "Desconectada" ? st.message :
        "Ligue a pedaleira no celular com cabo USB e adaptador OTG. O app encontra a pedaleira sozinho.") + "</p>" +
      '<div class="state-actions"><button class="btn primary" type="button" data-act="connect">' + CR.icon("plug") + "<span>Conectar</span></button>" +
      '<button class="btn" type="button" data-act="log">' + CR.icon("list") + "<span>Ver log</span></button></div></div>";
    box.querySelector('[data-act="connect"]').onclick = function () { CR.native("connect"); };
    box.querySelector('[data-act="log"]').onclick = function () { CR.Settings.openLog(); };
  }

  /* ---------------------------------------------------------------- folha de ajuste fino */
  var sheetControl = null, sheetSlider = null;
  function openSheet(c) {
    if (CR.S.locked || !CR.S.presets) return;
    sheetControl = c;
    var card = $("#sheet .sheet-card");
    card.style.setProperty("--led", "var(--led-" + c.color + ")");
    card.innerHTML =
      '<div class="sheet-head"><span class="led-dot on"></span><div><h2 id="sheetTitle">' + c.label + "</h2><p>" + c.name + "</p></div>" +
      '<button class="icon-btn" type="button" data-close aria-label="Fechar">' + CR.icon("close") + "</button></div>" +
      '<div class="sheet-value"><b class="sv-short"></b><span class="sv-long"></span></div>' +
      '<div class="sheet-slider"></div>' +
      '<div class="sheet-row"><button class="step" type="button" data-step="-1" aria-label="Diminuir">' + CR.icon("minus") + "</button>" +
      '<div class="sheet-zero"><span>Ativo</span></div>' +
      '<button class="step" type="button" data-step="1" aria-label="Aumentar">' + CR.icon("plus") + "</button></div>" +
      '<p class="sheet-hint">' + CR.esc(CR.LEARN.controls[c.key].use) + "</p>" +
      '<button class="btn ghost wide" type="button" data-more>' + CR.icon("info") + "<span>Explicação completa</span></button>";
    sheetSlider = CR.makeSlider(c, { big: true });
    card.querySelector(".sheet-slider").appendChild(sheetSlider);
    var sw = CR.makeSwitch(CR.isActive(c), c.label + ": ativo ou zerado", function () { CR.toggleZero(c); }, c.color);
    card.querySelector(".sheet-zero").prepend(sw);
    card.sw = sw;
    card.querySelectorAll("[data-step]").forEach(function (b) {
      b.onclick = function () { CR.set(c.off, Math.max(0, Math.min(c.max, CR.val(c) + Number(b.dataset.step)))); CR.haptic(); };
    });
    card.querySelector("[data-more]").onclick = function () { closeSheet(); CR.Pedal.info(c); };
    openLayer("#sheet");
    refreshSheet();
  }
  function refreshSheet() {
    var c = sheetControl, card = $("#sheet .sheet-card");
    if (!c || !sheetSlider) return;
    sheetSlider.update();
    var f = CR.format(c);
    card.querySelector(".sv-short").textContent = f.short;
    card.querySelector(".sv-long").textContent = c.list ? CR[c.list][CR.val(c)].kind + " · " + f.long : f.long;
    card.sw.set(CR.isActive(c));
  }
  function closeSheet() { sheetControl = null; sheetSlider = null; closeLayer("#sheet"); }

  /* ---------------------------------------------------------------- camadas (folha e diálogo) */
  var lastFocus = null;
  function openLayer(sel) {
    lastFocus = document.activeElement;
    var l = $(sel);
    l.hidden = false;
    l.querySelectorAll("[data-close]").forEach(function (b) { b.onclick = sel === "#sheet" ? closeSheet : function () { closeLayer(sel); }; });
    var f = l.querySelector(".sheet-card button");
    if (f) f.focus();
  }
  function closeLayer(sel) {
    $(sel).hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (!$("#dialog").hidden) closeLayer("#dialog");
    else if (!$("#sheet").hidden) closeSheet();
  });

  /* ---------------------------------------------------------------- explicação (!) */
  function dialog(color, title, subtitle, bodyHtml) {
    var card = $("#dialog .sheet-card");
    card.style.setProperty("--led", "var(--led-" + color + ")");
    card.innerHTML = '<div class="sheet-head"><span class="led-dot on"></span><div><h2 id="dialogTitle">' + title + "</h2><p>" + subtitle + "</p></div>" +
      '<button class="icon-btn" type="button" data-close aria-label="Fechar">' + CR.icon("close") + "</button></div>" +
      '<div class="dialog-body">' + bodyHtml + "</div>";
    openLayer("#dialog");
  }
  CR.dialog = dialog;

  function info(c) {
    var t = CR.LEARN.controls[c.key];
    var extra = "";
    if (c.list) {
      var item = CR[c.list][CR.val(c)];
      extra = '<div class="dl-now"><span>Agora</span><b>' + item.slot + " · " + CR.esc(item.name) + "</b><em>" + item.kind + "</em></div>";
    }
    dialog(c.color, c.label, c.name, extra +
      "<h3>O que é</h3><p>" + t.what + "</p><h3>Como usar</h3><p>" + t.use + "</p>" +
      "<h3>Combina com</h3><p>" + t.combo + "</p><h3>Chave ativo / zerado</h3><p>" + t.zero + "</p>" +
      '<button class="btn ghost wide" type="button" data-learn="' + c.key + '">' + CR.icon("learn") + "<span>Abrir na aba Aprender</span></button>");
    $("#dialog [data-learn]").onclick = function () { closeLayer("#dialog"); CR.App.go("learn", "c-" + c.key); };
  }

  function footswitchInfo(m) {
    var mod = CR.LEARN.modules[m.n - 1];
    dialog(m.color, "Footswitch " + m.fs + " · " + m.label, mod.title,
      "<h3>No app</h3><p>Toque no footswitch " + m.fs + " para escolher o preset " + m.fs + " para editar. O LED acende na cor dele, como na pedaleira. " +
      "A chave Módulo " + m.n + " liga ou desliga " + mod.parts + " dentro deste preset.</p>" +
      "<h3>Na pedaleira</h3><p>No modo PRESET, o footswitch " + m.fs + " chama o preset " + m.fs + ". No modo LIVE, liga e desliga o módulo " + m.n + " (" + mod.parts + ").</p>" +
      "<h3>O módulo " + m.n + "</h3><p>" + mod.text + "</p>");
  }

  /* ---------------------------------------------------------------- barra */
  function initBar() {
    $("#btnSend").innerHTML = CR.icon("send") + "<span>Enviar</span>";
    $("#btnTuner").innerHTML = CR.icon("tuner") + "<span>Afinador</span>";
    $("#btnSend").onclick = async function () {
      if (!CR.S.presets || CR.S.locked) return;
      var name = CR.MODULES[CR.S.preset].fs;
      CR.busy(true, "Enviando preset " + name);
      try {
        CR.S.presets = await CR.native("sendPreset", { preset: CR.S.preset, values: CR.S.presets[CR.S.preset] });
        refreshAll();
        CR.toast("Preset " + name + " enviado e conferido");
      } catch (e) { CR.toast(e.message, true); }
      finally { CR.busy(false); }
    };
    $("#btnTuner").onclick = function () { CR.Tuner.toggle(); };
  }

  CR.on("changed", function (d) {
    var c = CR.CONTROLS.find(function (x) { return x.off === d.offset; });
    if (c) refreshControl(c);
    else refreshAll();     // módulo ligado/desligado
    if (sheetControl) refreshSheet();
  });
  CR.on("preset", refreshAll);

  return { render: render, refreshAll: refreshAll, showState: showState, initBar: initBar,
           info: info, footswitchInfo: footswitchInfo, openSheet: openSheet, rows: function () { return rows; } };
})();
