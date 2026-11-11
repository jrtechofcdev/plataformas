/* Cube Remote · Copyright (c) 2026 José Renato · Jr_Tech_OFC. Todos os direitos reservados.
   Footswitch ativo (experimental).

   O protocolo não tem um comando "qual preset está tocando". Esta ferramenta procura onde a pedaleira
   guarda isso: lê trechos da memória (só leitura, nunca grava) enquanto você aperta A, B, C, A e B,
   e procura o byte que muda sempre do mesmo jeito (A dá um valor, B outro, C outro, e repete).
   Achando, o app lê esse byte a cada ~1 s: o Palco mostra qual footswitch está tocando e as ações
   ao vivo podem agir só nele. Tudo o que é medido vai para o log, para análise se não achar. */
"use strict";
var CR = window.CR || (window.CR = {});

CR.Follow = (function () {
  var AREAS = [                                   // [região, endereço, tamanho, nome]
    [5, 0, 256, "presets"],
    [4, 0, 4096, "RAM"],
    [0, 0x3000, 256, "ajustes (flash)"],
    [5, 0x80000000, 64, "presets ao vivo"],
  ];
  var SEQ = ["A", "B", "C", "A", "B"];
  var cfg = CR.store.get("cr.follow", null);      // { region, addr, vals: [a, b, c], name }
  var playing = null, timer = null, fails = 0;
  var $ = function (s, r) { return (r || document).querySelector(s); };

  function log(t) { CR.native("jsLog", { text: "[footswitch] " + t }).catch(function () {}); }
  function hex(n, w) { return "0x" + n.toString(16).toUpperCase().padStart(w || 4, "0"); }

  /* ================================================================ captura */
  async function snapshot(progress) {
    var out = [];
    for (var a = 0; a < AREAS.length; a++) {
      var ar = AREAS[a], bytes = [];
      try {
        for (var off = 0; off < ar[2]; off += 1024) {
          var part = await CR.native("readMem", { region: ar[0], addr: ar[1] + off, len: Math.min(1024, ar[2] - off) });
          bytes = bytes.concat(part);
          if (progress) progress((a + off / ar[2]) / AREAS.length);
        }
      } catch (e) { bytes = null; }
      out.push(bytes);
    }
    return out;
  }

  /* Bytes que seguem o padrão A, B, C, A, B (A igual nas duas vezes, B igual, e os três diferentes). */
  function analyze(snaps) {
    var cands = [];
    AREAS.forEach(function (ar, k) {
      if (snaps.some(function (s) { return !s[k]; })) return;
      var n = snaps[0][k].length;
      for (var i = 0; i < n; i++) {
        var v = snaps.map(function (s) { return s[k][i]; });
        if (v[0] === v[3] && v[1] === v[4] && v[0] !== v[1] && v[1] !== v[2] && v[0] !== v[2]) {
          var score = (Math.max(v[0], v[1], v[2]) <= 3 ? 4 : Math.max(v[0], v[1], v[2]) < 16 ? 2 : 0) +
            (v[1] - v[0] === 1 && v[2] - v[1] === 1 ? 3 : 0) + (ar[0] === 4 ? 1 : 0);
          cands.push({ region: ar[0], addr: ar[1] + i, vals: [v[0], v[1], v[2]], name: ar[3], score: score });
        }
      }
    });
    cands.sort(function (a, b) { return b.score - a.score; });
    return cands;
  }

  /* Bytes que mudaram em alguma captura (para o log). */
  function changes(snaps) {
    var lines = [];
    AREAS.forEach(function (ar, k) {
      if (snaps.some(function (s) { return !s[k]; })) { lines.push(ar[3] + ": não foi possível ler"); return; }
      var ch = [];
      for (var i = 0; i < snaps[0][k].length; i++) {
        var v = snaps.map(function (s) { return s[k][i]; });
        if (v.some(function (x) { return x !== v[0]; })) ch.push(hex(ar[1] + i) + "=" + v.join("/"));
      }
      lines.push(ar[3] + ": " + ch.length + " bytes mudaram" + (ch.length ? " · " + ch.slice(0, 40).join(" ") : ""));
    });
    return lines;
  }

  async function wizard() {
    if (!CR.S.presets) { CR.toast("Conecte a pedaleira primeiro", true); return; }
    stopPoll();
    var snaps = [];
    for (var i = 0; i < SEQ.length; i++) {
      var go = await ask(i);
      if (!go) { document.getElementById("dialog").hidden = true; startPoll(); return; }
      var bar = $("#dialog .dl-progress i"), msg = $("#dialog .dl-msg");
      msg.textContent = "Lendo a memória da pedaleira";
      try { snaps.push(await snapshot(function (f) { bar.style.width = Math.round((i + f) / SEQ.length * 100) + "%"; })); }
      catch (e) { CR.toast(e.message, true); document.getElementById("dialog").hidden = true; startPoll(); return; }
    }
    var cands = analyze(snaps);
    log("capturas A,B,C,A,B concluídas. " + changes(snaps).join(" | "));
    log(cands.length ? "candidatos: " + cands.slice(0, 8).map(function (c) { return c.name + " " + hex(c.addr) + " A=" + c.vals[0] + " B=" + c.vals[1] + " C=" + c.vals[2]; }).join("; ")
                     : "nenhum byte seguiu o padrão A,B,C,A,B");
    result(cands);
  }

  function ask(i) {
    return new Promise(function (resolve) {
      var L = SEQ[i];
      CR.dialog(CR.MODULES["ABC".indexOf(L)].color, "Descobrir o footswitch", "Captura " + (i + 1) + " de " + SEQ.length,
        '<div class="dl-step"><b class="dl-count fs-big">' + L + '</b><p class="dl-msg">Na pedaleira, aperte o footswitch ' + L + " (modo PRESET, LED do " + L + " aceso). Depois toque em Capturar.</p>" +
        '<div class="dl-progress"><i style="width:' + Math.round(i / SEQ.length * 100) + '%"></i></div></div>' +
        '<div class="dialog-actions"><button class="btn big" type="button" data-no>Cancelar</button>' +
        '<button class="btn primary big" type="button" data-yes>' + CR.icon("check") + "<span>Capturar</span></button></div>");
      var d = document.getElementById("dialog");
      $("[data-yes]", d).onclick = function () { $("[data-yes]", d).disabled = true; resolve(true); };
      $("[data-no]", d).onclick = function () { resolve(false); };
      d.querySelectorAll("[data-close]").forEach(function (b) { b.onclick = function () { resolve(false); }; });
    });
  }

  function result(cands) {
    if (!cands.length) {
      CR.dialog("white", "Não achei desta vez", "",
        "<p>Nenhum byte da memória lida mudou no padrão A, B, C. Confira se a pedaleira estava no modo PRESET (os footswitches trocam de preset) e tente de novo.</p>" +
        "<p>Se continuar sem achar, abra Ajustes > Abrir log > Compartilhar e me mande: as capturas ficaram registradas lá.</p>" +
        '<div class="dialog-actions"><button class="btn big" type="button" data-close>Fechar</button><button class="btn primary big" type="button" data-again>Tentar de novo</button></div>');
      var d0 = document.getElementById("dialog");
      $("[data-again]", d0).onclick = function () { d0.hidden = true; wizard(); };
      startPoll();
      return;
    }
    var best = cands[0];
    CR.dialog("green", "Achei", cands.length === 1 ? "1 posição combina" : cands.length + " posições combinam",
      '<ul class="fs-cands">' + cands.slice(0, 5).map(function (c, i) {
        return '<li><label class="fs-cand"><input type="radio" name="fsc" value="' + i + '"' + (i === 0 ? " checked" : "") + "><span><b>" + c.name + " " + hex(c.addr) + "</b>" +
          "<small>A = " + c.vals[0] + " · B = " + c.vals[1] + " · C = " + c.vals[2] + "</small></span></label></li>";
      }).join("") + "</ul>" +
      '<p class="hint">O primeiro é o mais provável. Depois de usar, aperte os footswitches e veja se o Palco acompanha.</p>' +
      '<div class="dialog-actions"><button class="btn big" type="button" data-close>Cancelar</button><button class="btn primary big" type="button" data-use>Usar</button></div>');
    var d = document.getElementById("dialog");
    $("[data-use]", d).onclick = function () {
      var c = cands[Number(($('input[name="fsc"]:checked', d) || { value: 0 }).value)];
      cfg = { region: c.region, addr: c.addr, vals: c.vals, name: c.name + " " + hex(c.addr) };
      CR.store.set("cr.follow", cfg);
      log("usando " + cfg.name + " A=" + c.vals[0] + " B=" + c.vals[1] + " C=" + c.vals[2]);
      d.hidden = true;
      CR.toast("Pronto: o app vai acompanhar o footswitch da pedaleira");
      fails = 0; startPoll();
      CR.emit("followcfg");
    };
    void best;
  }

  /* ================================================================ acompanhar */
  async function poll() {
    timer = null;
    if (!cfg || !CR.S.presets) return;
    var busy = !document.getElementById("busy").hidden;
    if (document.visibilityState === "visible" && !busy) {
      try {
        var v = (await CR.native("readMem", { region: cfg.region, addr: cfg.addr, len: 1 }))[0];
        var p = cfg.vals.indexOf(v);
        fails = 0;
        if (p >= 0 && p !== playing) {
          playing = p;
          if (CR.prefs.followPedal !== false && CR.S.preset !== p) { CR.S.preset = p; CR.emit("preset", p); }
          CR.emit("playing", p);
        }
      } catch (e) {
        if (++fails >= 3) { playing = null; CR.emit("playing", null); CR.toast("Parei de acompanhar o footswitch: " + e.message, true); return; }
      }
    }
    timer = setTimeout(poll, 1000);
  }
  function startPoll() { if (cfg && !timer && CR.S.presets) timer = setTimeout(poll, 300); }
  function stopPoll() { clearTimeout(timer); timer = null; }
  function forget() { cfg = null; CR.store.set("cr.follow", null); stopPoll(); playing = null; CR.emit("playing", null); CR.emit("followcfg"); }

  CR.on("status", function (st) {
    if (st.state === "on" && st.presets) startPoll();
    else { stopPoll(); if (playing !== null) { playing = null; CR.emit("playing", null); } }
  });

  /* ================================================================ cartão em Ajustes */
  function cardHtml() {
    return '<article class="card" id="followCard"><header class="card-head">' + CR.icon("search2") + "<div><h2>Footswitch ativo <span class=\"tag-exp\">experimental</span></h2>" +
      "<p>" + (cfg ? "Acompanhando pela posição " + CR.esc(cfg.name) + "." + (playing !== null ? " Agora tocando: " + "ABC"[playing] + "." : "")
        : "Ensine o app a saber qual footswitch (A, B ou C) está tocando na pedaleira.") + "</p></div></header>" +
      '<button class="btn wide big' + (cfg ? "" : " primary") + '" type="button" id="fsFind"' + (CR.S.presets ? "" : " disabled") + ">" + CR.icon("search2") +
        "<span>" + (cfg ? "Descobrir de novo" : "Descobrir o footswitch") + "</span></button>" +
      (cfg ? '<div class="set-row"><div><b>Seguir a pedaleira</b><span>Quando você pisa num footswitch, o Palco passa a editar esse preset.</span></div><span id="swFollow"></span></div>' +
             '<div class="set-row"><div><b>Ao vivo só no que toca</b><span>Boost, Mudo, Swell e Fade agem só no footswitch que está tocando (e acompanham se você trocar).</span></div><span id="swLiveOne"></span></div>' +
             '<button class="btn wide" type="button" id="fsForget">' + CR.icon("trash") + "<span>Esquecer</span></button>" : "") +
      '<p class="hint">São 5 capturas: você aperta A, B, C, A e B na pedaleira. O app só lê a memória, não grava nada.</p></article>';
  }
  function bindCard(root) {
    $("#fsFind", root).onclick = wizard;
    if (!cfg) return;
    var s1 = CR.makeSwitch(CR.prefs.followPedal !== false, "Seguir a pedaleira", function () {
      CR.prefs.followPedal = CR.prefs.followPedal === false; CR.savePrefs(); s1.set(CR.prefs.followPedal !== false);
    });
    $("#swFollow", root).appendChild(s1);
    var s2 = CR.makeSwitch(CR.prefs.liveOne !== false, "Ao vivo só no que toca", function () {
      CR.prefs.liveOne = CR.prefs.liveOne === false; CR.savePrefs(); s2.set(CR.prefs.liveOne !== false); CR.emit("playing", playing);
    });
    $("#swLiveOne", root).appendChild(s2);
    $("#fsForget", root).onclick = async function () {
      if (await CR.confirm("Esquecer", "O app deixa de acompanhar o footswitch da pedaleira.", "Esquecer")) forget();
    };
  }

  return { cardHtml: cardHtml, bindCard: bindCard, wizard: wizard,
           playing: function () { return cfg ? playing : null; }, configured: function () { return !!cfg; },
           _analyze: analyze, _areas: AREAS };
})();
