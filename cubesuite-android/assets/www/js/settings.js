/* Cube Remote · Copyright (c) 2026 José Renato · Jr_Tech_OFC. Todos os direitos reservados.
   Aba Ajustes: tela, afinador, conexão, avançado (log) e Sobre. */
"use strict";
var CR = window.CR || (window.CR = {});

CR.Settings = (function () {
  var $ = function (s, root) { return (root || document).querySelector(s); };
  var appInfo = { version: "2.1.0" };

  function seg(name, options, current) {
    return '<div class="seg" role="group" data-seg="' + name + '">' + options.map(function (o) {
      return '<button type="button" data-v="' + o[0] + '" aria-pressed="' + (o[0] === current) + '">' + (o[2] ? CR.icon(o[2]) : "") + "<span>" + o[1] + "</span></button>";
    }).join("") + "</div>";
  }

  function render() {
    var p = CR.prefs, st = CR.S.status;
    var v = document.getElementById("view-settings");
    v.innerHTML = '<div class="page"><h1 class="page-title">Ajustes</h1>' +
      '<article class="card"><header class="card-head">' + CR.icon("rotate") + "<div><h2>Tela</h2><p>Use em pé ou deitado.</p></div></header>" +
        seg("orientation", [["auto", "Automática"], ["portrait", "Em pé"], ["landscape", "Deitado"]], p.orientation) +
        '<div class="set-row"><div><b>Vibrar ao tocar</b><span>Retorno tátil a cada toque e a cada passo do ajuste.</span></div><span id="swHaptic"></span></div>' +
        '<div class="set-row"><div><b>Trava de palco</b><span>O cadeado no topo trava todos os controles. Para destravar, segure o cadeado por 1 segundo.</span></div></div></article>' +

      '<article class="card"><header class="card-head">' + CR.icon("tuner") + "<div><h2>Afinador</h2><p>Também dá para trocar na própria aba Afinador.</p></div></header>" +
        seg("tunerSource", [["mic", "Microfone"], ["usb", "Entrada USB"]], p.tunerSource) +
        '<p class="hint" id="inputsHint">O microfone sempre funciona; aproxime o celular da guitarra ou do fone. A entrada USB usa o áudio da própria pedaleira e é experimental: alguns celulares não liberam esse áudio enquanto o app controla a pedaleira pelo mesmo cabo.</p>' +
        '<div class="set-row"><div><b>Referência A4</b><span>Padrão 440 Hz.</span></div><div class="stepper"><button class="step" type="button" data-a4="-1" aria-label="Diminuir A4">' + CR.icon("minus") + '</button><b id="a4Val">' + p.a4 + ' Hz</b><button class="step" type="button" data-a4="1" aria-label="Aumentar A4">' + CR.icon("plus") + "</button></div></div></article>" +

      '<article class="card"><header class="card-head">' + CR.icon("usb") + "<div><h2>Conexão</h2><p>" + statusText(st) + "</p></div></header>" +
        '<dl class="info-list">' + infoRows(st) + "</dl>" +
        '<button class="btn wide" type="button" id="btnReconnect">' + CR.icon("plug") + "<span>Reconectar</span></button></article>" +

      '<article class="card"><header class="card-head">' + CR.icon("list") + "<div><h2>Avançado</h2><p>Para diagnosticar problemas de conexão.</p></div></header>" +
        '<button class="btn wide" type="button" id="btnLog">' + CR.icon("list") + "<span>Abrir log</span></button></article>" +

      '<article class="card about"><img src="img/logo.svg" alt="" class="about-logo"><h2>Cube Remote</h2><p class="about-by">by Jr_Tech_OFC</p>' +
        '<p class="about-ver">Versão ' + CR.esc(appInfo.version) + "</p>" +
        "<p>Criado do zero por José Renato (Jr_Tech_OFC) para controlar a pedaleira Cube Baby pelo cabo USB.</p>" +
        '<p class="about-copy">© 2026 José Renato · Jr_Tech_OFC. Todos os direitos reservados.</p>' +
        '<p class="hint">Projeto independente, compatível com a pedaleira Cube Baby, sem vínculo com o fabricante. Nomes dos modelos e gabinetes transcritos do manual do fabricante. Fontes Barlow e Barlow Condensed sob a SIL Open Font License 1.1.</p></article>' +
      "</div>";

    v.querySelectorAll("[data-seg]").forEach(function (g) {
      g.querySelectorAll("button").forEach(function (b) {
        b.onclick = function () {
          var key = g.dataset.seg;
          CR.prefs[key] = b.dataset.v;
          CR.savePrefs();
          g.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
          if (key === "orientation") CR.native("setOrientation", { mode: CR.prefs.orientation });
          CR.haptic();
        };
      });
    });
    var hs = CR.makeSwitch(p.haptics, "Vibrar ao tocar", function () { CR.prefs.haptics = !CR.prefs.haptics; CR.savePrefs(); hs.set(CR.prefs.haptics); CR.haptic(); });
    $("#swHaptic").appendChild(hs);
    v.querySelectorAll("[data-a4]").forEach(function (b) {
      b.onclick = function () { CR.prefs.a4 = Math.max(430, Math.min(450, CR.prefs.a4 + Number(b.dataset.a4))); CR.savePrefs(); $("#a4Val").textContent = CR.prefs.a4 + " Hz"; };
    });
    $("#btnReconnect").onclick = function () { CR.native("connect"); };
    $("#btnLog").onclick = openLog;
    CR.native("audioInputs").then(function (list) {
      var usb = (list || []).some(function (x) { return x.id === "usb"; });
      if (!usb) $("#inputsHint").textContent += " No momento nenhuma entrada USB de áudio foi encontrada.";
    }).catch(function () {});
  }

  function statusText(st) {
    return st.state === "on" ? "Conectada" + (st.mock ? " (simulação)" : "") : st.state === "search" ? "Procurando a pedaleira" : "Desconectada";
  }
  function infoRows(st) {
    if (st.state !== "on") return "<div><dt>Estado</dt><dd>" + CR.esc(st.message || "Sem pedaleira") + "</dd></div>";
    var rows = [["Modelo", st.model], ["Nome interno", st.name], ["Firmware", st.version], ["ID", st.productId],
                ["Conexão", st.device], ["Gravar IR", st.irWritable === false ? "bloqueado por segurança" : "liberado"]];
    return rows.map(function (r) { return "<div><dt>" + r[0] + "</dt><dd>" + CR.esc(r[1] || "-") + "</dd></div>"; }).join("");
  }

  /* ---------------------------------------------------------------- log */
  function openLog() {
    var p = document.getElementById("logPanel");
    p.innerHTML = '<div class="log-head"><h2>Log</h2><button class="icon-btn" type="button" data-close aria-label="Fechar log">' + CR.icon("close") + "</button></div>" +
      '<div class="log-tools">' +
      '<button class="btn" type="button" data-a="probe">' + CR.icon("search") + "<span>Testar protocolos</span></button>" +
      '<button class="btn" type="button" data-a="monitor">' + CR.icon("wave") + "<span>Monitorar 30 s</span></button>" +
      '<button class="btn" type="button" data-a="diag">' + CR.icon("list") + "<span>Diagnóstico</span></button>" +
      '<button class="btn primary" type="button" data-a="shareLog">' + CR.icon("share") + "<span>Compartilhar</span></button>" +
      '<button class="btn" type="button" data-a="copyLog">' + CR.icon("copy") + "<span>Copiar</span></button>" +
      '<button class="btn danger" type="button" data-a="clearLog">' + CR.icon("trash") + "<span>Limpar</span></button></div>" +
      '<div class="log-opts"><label class="check"><input type="checkbox" id="logTrace" checked> Registrar bytes enviados e recebidos</label>' +
      '<label class="check"><input type="checkbox" id="logFollow" checked> Rolar automaticamente</label></div>' +
      '<pre id="logView" tabindex="0"></pre>';
    p.hidden = false;
    p.querySelector("[data-close]").onclick = function () { p.hidden = true; };
    p.querySelectorAll("[data-a]").forEach(function (b) {
      b.onclick = async function () {
        var a = b.dataset.a;
        if (a === "probe" && !(await CR.confirm("Testar protocolos", "Envia 9 tipos de mensagem para a pedaleira (cerca de 30 segundos) e registra quais têm resposta.", "Testar"))) return;
        if (a === "clearLog") $("#logView").textContent = "";
        if (a === "monitor") CR.toast("Monitor ligado: mexa na pedaleira por 30 segundos");
        CR.native(a).then(function () { if (a === "copyLog") CR.toast("Log copiado"); }).catch(function (e) { CR.toast(e.message, true); });
      };
    });
    $("#logTrace").onchange = function (e) { CR.native("setTrace", { on: e.target.checked }); };
    CR.native("getLog").then(function (t) { $("#logView").textContent = t; $("#logView").scrollTop = 1e9; }).catch(function () {});
  }
  CR.on("log", function (chunk) {
    var v = document.getElementById("logView");
    if (!v) return;
    var t = v.textContent + chunk;
    if (t.length > 200000) t = t.slice(t.length - 200000);
    v.textContent = t;
    var f = document.getElementById("logFollow");
    if (!f || f.checked) v.scrollTop = v.scrollHeight;
  });

  CR.native("appInfo").then(function (i) { appInfo = i || appInfo; }).catch(function () {});

  return { render: render, openLog: openLog };
})();
