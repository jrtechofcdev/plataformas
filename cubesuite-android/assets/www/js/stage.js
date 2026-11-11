/* Cube Remote · Copyright (c) 2026 José Renato · Jr_Tech_OFC. Todos os direitos reservados.
   Tela Palco: feita para usar durante o culto. Botões grandes; tocar num controle abre a tela de ajuste. */
"use strict";
var CR = window.CR || (window.CR = {});

CR.Stage = (function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var tiles = {};

  /* ================================================================ montagem */
  function render() {
    var pb = $("#presetBar");
    pb.innerHTML = CR.MODULES.map(function (m, i) {
      return '<button type="button" class="preset-btn" data-p="' + i + '" style="--led:var(--led-' + m.color + ')">' +
        '<i class="led"></i><b>' + m.fs + '</b><span>Preset</span></button>';
    }).join("");
    pb.querySelectorAll(".preset-btn").forEach(function (b) {
      b.onclick = function () { if (CR.S.locked) return; CR.S.preset = Number(b.dataset.p); CR.haptic(); CR.emit("preset", CR.S.preset); };
    });

    var mb = $("#moduleBar");
    mb.innerHTML = CR.MODULES.map(function (m, i) {
      var parts = ["IR CAB + REVERB", "DELAY + MOD", "AMP"][i];
      return '<button type="button" class="module-btn" data-m="' + i + '" role="switch" style="--led:var(--led-' + m.color + ')">' +
        '<span class="m-n">' + m.n + '</span><span class="m-text"><b>' + parts + '</b><small></small></span></button>';
    }).join("");
    mb.querySelectorAll(".module-btn").forEach(function (b) {
      b.onclick = function () {
        if (CR.S.locked || !CR.S.presets) return;
        var m = CR.MODULES[Number(b.dataset.m)];
        CR.set(m.off, CR.moduleOn(m) ? 0 : 1);
        CR.haptic();
      };
    });

    var t = $("#tiles");
    t.innerHTML = "";
    tiles = {};
    CR.CONTROLS.forEach(function (c, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "tile";
      b.style.setProperty("--led", "var(--led-" + c.color + ")");
      b.innerHTML = '<span class="t-head"><i class="led"></i><b>' + c.label + '</b></span>' +
        '<span class="t-name">' + c.name + '</span><span class="t-val"></span><span class="t-sub"></span>' +
        '<span class="t-bar' + (c.bipolar ? " bipolar" : "") + '"><i></i></span>';
      b.onclick = function () { if (!CR.S.locked && CR.S.presets) openAdjust(i); };
      t.appendChild(b);
      tiles[c.off] = b;
    });
    refresh();
  }

  function barStyle(c, v) {
    var f = v / c.max * 100, z = c.bipolar ? c.zero / c.max * 100 : 0;
    return "left:" + Math.min(z, f) + "%;width:" + Math.max(2, Math.abs(f - z)) + "%";
  }

  function refreshTile(c) {
    var b = tiles[c.off];
    if (!b) return;
    var v = CR.val(c), f = CR.format(c, v);
    b.querySelector(".t-val").textContent = f.short;
    b.querySelector(".t-sub").textContent = c.list ? CR[c.list][v].name :
      (c.bipolar ? (v === c.zero ? "Desligado" : v < c.zero ? "Chorus" : "Phaser") : "");
    b.querySelector(".t-bar i").setAttribute("style", barStyle(c, v));
    b.classList.toggle("on", CR.isActive(c));
    var m = CR.MODULES[c.module - 1];
    b.classList.toggle("module-off", !!m && !CR.moduleOn(m));
    b.setAttribute("aria-label", c.label + ", " + c.name + ": " + f.long + ". Toque para ajustar");
  }

  function refresh() {
    document.querySelectorAll(".preset-btn").forEach(function (b, i) {
      b.classList.toggle("active", i === CR.S.preset);
      b.setAttribute("aria-pressed", String(i === CR.S.preset));
      // nome da memória carregada neste preset (aba Memórias), se houver
      var name = CR.S.presets && CR.Memory ? CR.Memory.nameFor(i) : "";
      var sp = b.querySelector("span");
      sp.textContent = name || "Preset";
      b.classList.toggle("named", !!name);
      b.setAttribute("aria-label", "Preset " + CR.MODULES[i].fs + (name ? ": " + name : ""));
    });
    document.querySelectorAll(".module-btn").forEach(function (b, i) {
      var on = CR.moduleOn(CR.MODULES[i]);
      b.classList.toggle("on", on);
      b.setAttribute("aria-checked", String(on));
      b.querySelector("small").textContent = on ? "Ligado" : "Desligado";
    });
    CR.CONTROLS.forEach(refreshTile);
    if (adj.c) refreshAdjust();
  }

  /* ================================================================ estados de conexão */
  function showState(st) {
    var box = $("#stageState"), on = st.state === "on" && !!CR.S.presets;
    $("#view-stage").classList.toggle("offline", !on);
    if (on) { box.hidden = true; return; }
    box.hidden = false;
    if (st.state === "search") {
      box.innerHTML = '<div class="state-card"><div class="spinner"></div><h2>Procurando a pedaleira</h2><p>' + CR.esc(st.message || "Verificando a conexão USB.") + "</p></div>";
      return;
    }
    if (st.state === "tuner") {
      box.innerHTML = '<div class="state-card">' + CR.icon("tuner", "state-ico") + "<h2>Afinador USB em uso</h2><p>" + CR.esc(st.message) + "</p>" +
        '<div class="state-actions"><button class="btn primary big" type="button" data-act="tuner">' + CR.icon("tuner") + "<span>Abrir afinador</span></button>" +
        '<button class="btn big" type="button" data-act="connect">' + CR.icon("plug") + "<span>Reconectar</span></button></div></div>";
      box.querySelector('[data-act="tuner"]').onclick = function () { CR.App.go("tuner"); };
      box.querySelector('[data-act="connect"]').onclick = function () { CR.native("connect"); };
      return;
    }
    if (st.state === "on") {
      box.innerHTML = '<div class="state-card"><h2>Modelo sem presets editáveis</h2><p>Esta Cube Baby é da geração antiga. Use Ferramentas para trocar os IRs.</p></div>';
      return;
    }
    box.innerHTML = '<div class="state-card">' + CR.icon("plug", "state-ico") + "<h2>Conecte a Cube Baby</h2><p>" +
      CR.esc(st.message && st.message !== "Desconectada" ? st.message : "Ligue a pedaleira no celular com cabo USB e adaptador OTG.") + "</p>" +
      '<div class="state-actions"><button class="btn primary big" type="button" data-act="connect">' + CR.icon("plug") + "<span>Conectar</span></button>" +
      '<button class="btn big" type="button" data-act="log">' + CR.icon("list") + "<span>Ver log</span></button></div></div>";
    box.querySelector('[data-act="connect"]').onclick = function () { CR.native("connect"); };
    box.querySelector('[data-act="log"]').onclick = function () { CR.Settings.openLog(); };
  }

  /* ================================================================ tela de ajuste */
  var adj = { c: null, idx: 0, start: 0, slider: null };

  function quickValues(c) {
    if (c.bipolar) return [[0, "CH 7"], [3, "CH 4"], [5, "CH 2"], [7, "OFF"], [9, "PH 2"], [11, "PH 4"], [15, "PH 8"]];
    return [0, 25, 50, 75, 100].map(function (p) { return [Math.round(p / 100 * c.max), p + "%"]; });
  }

  function openAdjust(i) {
    adj.idx = i;
    adj.c = CR.CONTROLS[i];
    adj.start = CR.val(adj.c);
    var c = adj.c, el = $("#adjust");
    el.style.setProperty("--led", "var(--led-" + c.color + ")");
    var body;
    if (c.list) {
      body = '<div class="slot-grid">' + CR[c.list].map(function (s, v) {
        return '<button type="button" class="slot-btn" data-v="' + v + '"><b>' + s.slot + '</b><span>' + s.name + "</span><small>" + s.kind + "</small></button>";
      }).join("") + "</div>";
    } else {
      body = '<div class="adj-slider"></div><div class="quick">' + quickValues(c).map(function (q) {
        return '<button type="button" class="quick-btn" data-v="' + q[0] + '">' + q[1] + "</button>";
      }).join("") + "</div>";
    }
    el.innerHTML =
      '<header class="adj-head">' +
        '<button type="button" class="nav-arrow" data-nav="-1" aria-label="Controle anterior">' + CR.icon("chevron", "flip") + "</button>" +
        '<div class="adj-title"><i class="led"></i><div><h2 id="adjTitle">' + c.label + "</h2><p>" + c.name + "</p></div></div>" +
        '<button type="button" class="nav-arrow" data-nav="1" aria-label="Próximo controle">' + CR.icon("chevron") + "</button>" +
        '<button type="button" class="adj-close" data-close aria-label="Fechar">' + CR.icon("close") + "</button>" +
      "</header>" +
      '<div class="adj-main">' +
        '<div class="adj-left">' +
          '<div class="adj-value"><b class="av-big"></b><span class="av-long"></span></div>' +
          '<div class="stepper-big">' +
            '<button type="button" class="step-big" data-step="-1" aria-label="Diminuir">' + CR.icon("minus") + "</button>" +
            '<button type="button" class="zero-btn" role="switch"></button>' +
            '<button type="button" class="step-big" data-step="1" aria-label="Aumentar">' + CR.icon("plus") + "</button>" +
          "</div>" +
          '<div class="adj-actions"><button type="button" class="btn" data-restore>' + CR.icon("undo") + '<span>Valor anterior</span></button>' +
          '<button type="button" class="btn" data-about aria-expanded="false">' + CR.icon("info") + "<span>O que é</span></button></div>" +
          '<div class="adj-about" hidden><p>' + CR.LEARN.controls[c.key].what + "</p><p>" + CR.LEARN.controls[c.key].use + "</p>" +
          '<button type="button" class="btn ghost" data-learn>' + CR.icon("learn") + "<span>Mais na aba Aprender</span></button></div>" +
        "</div>" +
        '<div class="adj-right">' + body + "</div>" +
      "</div>";

    if (!c.list) {
      adj.slider = CR.makeSlider(c, { big: true });
      $(".adj-slider", el).appendChild(adj.slider);
      el.querySelectorAll(".quick-btn").forEach(function (b) { b.onclick = function () { setV(Number(b.dataset.v)); }; });
    } else {
      adj.slider = null;
      el.querySelectorAll(".slot-btn").forEach(function (b) { b.onclick = function () { setV(Number(b.dataset.v)); }; });
    }
    el.querySelectorAll("[data-step]").forEach(function (b) { holdRepeat(b, Number(b.dataset.step)); });
    $(".zero-btn", el).onclick = function () { CR.toggleZero(c); };
    $("[data-restore]", el).onclick = function () { setV(adj.start); CR.toast("Valor anterior restaurado"); };
    $("[data-about]", el).onclick = function (e) {
      var a = $(".adj-about", el), open = a.hidden;
      a.hidden = !open;
      e.currentTarget.setAttribute("aria-expanded", String(open));
    };
    $("[data-learn]", el).onclick = function () { closeAdjust(); CR.App.go("learn", "c-" + c.key); };
    el.querySelectorAll("[data-nav]").forEach(function (b) {
      b.onclick = function () { openAdjust((adj.idx + Number(b.dataset.nav) + CR.CONTROLS.length) % CR.CONTROLS.length); };
    });
    $("[data-close]", el).onclick = closeAdjust;
    el.hidden = false;
    refreshAdjust();
    $(".adj-close", el).focus();
  }

  function setV(v) {
    var c = adj.c;
    v = Math.max(0, Math.min(c.max, Math.round(v)));
    if (CR.set(c.off, v)) CR.haptic();
  }

  /* −/+ : um passo no toque; segurando, repete e acelera. */
  function holdRepeat(btn, dir) {
    var t1 = null, t2 = null, count = 0;
    function step() {
      var c = adj.c, big = c.max > 40 && count > 12 ? 3 : 1;
      setV(CR.val(c) + dir * big);
      count++;
    }
    function stop() { clearTimeout(t1); clearInterval(t2); t1 = t2 = null; }
    btn.addEventListener("pointerdown", function (e) {
      if (CR.S.locked) return;
      e.preventDefault();
      count = 0;
      step();
      t1 = setTimeout(function () { t2 = setInterval(step, 90); }, 420);
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach(function (ev) { btn.addEventListener(ev, stop); });
    btn.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); step(); } });
  }

  function refreshAdjust() {
    var c = adj.c, el = $("#adjust");
    if (!c || el.hidden) return;
    var v = CR.val(c), f = CR.format(c, v);
    $(".av-big", el).textContent = f.short;
    $(".av-long", el).textContent = c.list ? CR[c.list][v].kind + " · " + f.long : f.long;
    if (adj.slider) adj.slider.update();
    el.querySelectorAll(".slot-btn, .quick-btn").forEach(function (b) { b.classList.toggle("active", Number(b.dataset.v) === v); });
    var on = CR.isActive(c), z = $(".zero-btn", el);
    z.setAttribute("aria-checked", String(on));
    z.innerHTML = "<b>" + (on ? "Ativo" : "Zerado") + "</b><small>" + (on ? "Toque para zerar" : "Toque para ativar") + "</small>";
    $("[data-restore]", el).disabled = v === adj.start;
    var m = CR.MODULES[c.module - 1];
    el.classList.toggle("module-off", !!m && !CR.moduleOn(m));
    el.classList.toggle("zeroed", !on);
  }

  function closeAdjust() {
    adj.c = null;
    adj.slider = null;
    $("#adjust").hidden = true;
  }

  /* ================================================================ diálogo (explicações e confirmações) */
  function dialog(color, title, subtitle, bodyHtml) {
    var card = $("#dialog .sheet-card");
    card.style.setProperty("--led", "var(--led-" + color + ")");
    card.innerHTML = '<div class="sheet-head"><i class="led"></i><div><h2 id="dialogTitle">' + title + "</h2>" + (subtitle ? "<p>" + subtitle + "</p>" : "") + "</div>" +
      '<button class="icon-btn" type="button" data-close aria-label="Fechar">' + CR.icon("close") + "</button></div>" +
      '<div class="dialog-body">' + bodyHtml + "</div>";
    var d = $("#dialog");
    d.hidden = false;
    d.querySelectorAll("[data-close]").forEach(function (b) { b.onclick = function () { d.hidden = true; }; });
  }
  CR.dialog = dialog;

  /* Voltar do Android e tecla Esc fecham a camada aberta (log, diálogo, ajuste). */
  window.cubeBack = function () {
    if (!$("#logPanel").hidden) { $("#logPanel").hidden = true; return true; }
    if (!$("#dialog").hidden) { $("#dialog").hidden = true; return true; }
    if (!$("#adjust").hidden) { closeAdjust(); return true; }
    var view = document.getElementById("app").dataset.view;
    if (view === "learn") { CR.App.go("settings"); return true; }      // Aprender abre a partir de Ajustes
    if (view !== "stage") { CR.App.go("stage"); return true; }
    return false;
  };
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") window.cubeBack(); });

  CR.on("changed", refresh);
  CR.on("memories", refresh);
  CR.on("preset", function () { if (adj.c) adj.start = CR.val(adj.c); refresh(); });

  return { render: render, refresh: refresh, showState: showState, openAdjust: openAdjust, closeAdjust: closeAdjust };
})();
