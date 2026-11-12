/* Cube Remote · Copyright (c) 2026 José Renato · Jr_Tech_OFC. Todos os direitos reservados.
   Biblioteca de presets (aba Memórias > Biblioteca).

   Você sobe presets em lote (.zip com vários .json, ou vários .json de uma vez), testa cada um em
   A, B ou C e guarda nas suas memórias os que aprovar. Os presets ficam separados por categoria.
   Ficam salvos no arquivo biblioteca.json do app.

   Formato aceito (um preset por arquivo, uma lista, ou { items: [...] }):
     { "format": "cube-remote-preset", "name": "...", "author": "...", "description": "...",
       "category": "worship", "model": "Cube Baby",
       "values": [TYPE, GAIN, TONE, REVERB, FB, VOLUME, TIME, MIX, MOD, IR CAB, mód1, mód2, mód3, 0, 0, 0],
       "knobs": { "VOLUME": 41, "IR CAB": 1, ... }   (usado se não houver "values")
       "source": { "id": 901, "url": "...", "likes": 0, "dislikes": 0 } }
   Os 16 valores são exatamente os bytes que a pedaleira guarda em cada preset. */
"use strict";
var CR = window.CR || (window.CR = {});

CR.Library = (function () {
  var CATS = [
    ["worship", "Worship e igreja"], ["clean", "Limpo"], ["drive", "Crunch e overdrive"], ["dist", "Distorção e peso"],
    ["solo", "Solo"], ["ambient", "Ambiente e efeitos"], ["acoustic", "Violão"],
  ];
  var CAT_NAME = {}; CATS.forEach(function (c) { CAT_NAME[c[0]] = c[1]; });
  var STATUS = [["all", "Todos"], ["new", "Para testar"], ["ok", "Aprovados"], ["no", "Descartados"]];
  var PAGE = 25;
  var KNOB_ORDER = [["TYPE", 0], ["GAIN", 1], ["TONE", 2], ["REVERB", 3], ["FB", 4], ["VOLUME", 5], ["TIME", 6], ["MIX", 7], ["MOD", 8], ["IR CAB", 9]];

  var data = { kind: "biblioteca", version: 1, items: [] }, loaded = false;
  var ui = { cat: "all", status: "all", q: "", sort: "likes", shown: PAGE };
  var $ = function (s, r) { return (r || document).querySelector(s); };

  /* ================================================================ dados */
  function load() {
    return CR.native("memLoad", { name: "biblioteca" }).then(function (t) {
      loaded = true;
      if (!t) return;
      try { var o = JSON.parse(t); if (o && Array.isArray(o.items)) data.items = o.items; }
      catch (e) { CR.toast("A biblioteca salva estava com problema e não foi lida.", true); }
    }).catch(function () { loaded = true; });
  }
  function persist() {
    return CR.native("memSave", { name: "biblioteca", data: JSON.stringify(data) }).catch(function (e) { CR.toast(e.message, true); });
  }

  function plain(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }

  /* Categoria pelo nome/descrição e, se não disser nada, pelo tipo de amp e ganho.
     (A mesma regra usada para montar o zip; arquivos que já trazem "category" são respeitados.) */
  function categorize(name, desc, v) {
    var t = plain(name + " " + desc);
    if (/violao|acoustic|acustic|martin|taylor|\bnylon\b/.test(t)) return "acoustic";
    if (/worship|louvor|adora|gospel|igreja|harpa|hillsong|bethel|elevation|ministra|culto|\bhino|crist|church|praise|jesus|deus|senhor|oracao/.test(t)) return "worship";
    if (/\bsolo|\blead\b|lead /.test(t)) return "solo";
    if (/ambien|\bpad\b|fundo|swell|shimmer|freeze|atmosf|reverse|tremolo|vibrato|phaser|flanger|\becho\b/.test(t)) return "ambient";
    if (/clean|limpo|clen\b|\bclear\b/.test(t)) return "clean";
    if (/metal|distor|\bdist\b|heavy|pesad|thrash|djent|grunge|punk|hard ?rock|high gain|hi-gain/.test(t)) return "dist";
    if (/crunch|overdrive|\bdrive|\bod\b|blues|rock|timmy|klon|screamer/.test(t)) return "drive";
    if (v[0] <= 1 && v[1] <= 4) return "clean";
    if (v[0] >= 5 && v[1] >= 4) return "dist";
    return "drive";
  }

  /* Converte qualquer formato aceito em um item da biblioteca (ou null se não servir). */
  function normalize(o) {
    if (!o || typeof o !== "object") return null;
    if (o.model && !/^cube\s*baby$/i.test(String(o.model).trim())) return { skip: "model" };
    var v = null;
    if (Array.isArray(o.values) && o.values.length >= 13) v = o.values.slice(0, 16);
    else if (o.knobs && typeof o.knobs === "object") {
      v = [0, 0, 0, 0, 0, 0, 0, 0, 7, 0, 1, 1, 1, 0, 0, 0];
      var ok = 0;
      KNOB_ORDER.forEach(function (k) { var x = Number(o.knobs[k[0]]); if (o.knobs[k[0]] !== undefined && !isNaN(x)) { v[k[1]] = x; ok++; } });
      if (ok < 8) return null;
    }
    if (!v) return null;
    while (v.length < 16) v.push(0);
    var clean = CR.Memory.clean(v).values;
    var name = String(o.name || o.title || "Sem nome").trim().slice(0, 60);
    var desc = String(o.description || "").trim().slice(0, 400);
    var src = o.source && typeof o.source === "object" ? o.source : {};
    var uid = src.id ? "site:" + src.id : "h:" + plain(name).replace(/\s+/g, "") + ":" + clean.slice(0, 13).join(".");
    return {
      uid: uid, name: name, author: String(o.author || "").slice(0, 40), description: desc,
      category: CAT_NAME[o.category] ? o.category : categorize(name, desc, clean),
      values: clean, notes: Array.isArray(o.notes) ? o.notes.slice(0, 4).map(String) : [],
      source: { id: src.id || null, url: String(src.url || ""), likes: Number(src.likes) || 0, dislikes: Number(src.dislikes) || 0 },
      status: "new",
    };
  }

  /* ================================================================ zip (sem bibliotecas: lê o índice do zip e
     descompacta com o DecompressionStream do próprio navegador) */
  async function inflate(bytes) {
    var ds = new DecompressionStream("deflate-raw");
    var out = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(out).arrayBuffer());
  }
  async function unzip(buf) {
    var d = new DataView(buf), u8 = new Uint8Array(buf), end = -1;
    for (var i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) if (d.getUint32(i, true) === 0x06054b50) { end = i; break; }
    if (end < 0) throw new Error("O arquivo .zip está corrompido");
    var count = d.getUint16(end + 10, true), p = d.getUint32(end + 16, true), files = [], dec = new TextDecoder("utf-8");
    for (var k = 0; k < count; k++) {
      if (d.getUint32(p, true) !== 0x02014b50) break;
      var method = d.getUint16(p + 10, true), csize = d.getUint32(p + 20, true);
      var nlen = d.getUint16(p + 28, true), elen = d.getUint16(p + 30, true), clen = d.getUint16(p + 32, true), lho = d.getUint32(p + 42, true);
      var name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
      p += 46 + nlen + elen + clen;
      if (/\/$/.test(name) || !/\.json$/i.test(name)) continue;
      var start = lho + 30 + d.getUint16(lho + 26, true) + d.getUint16(lho + 28, true);
      var raw = u8.subarray(start, start + csize);
      var bytes = method === 0 ? raw : method === 8 ? await inflate(raw) : null;
      if (bytes) files.push({ name: name, text: dec.decode(bytes) });
    }
    return files;
  }

  /* ================================================================ importar em lote */
  async function importFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;
    CR.busy(true, "Lendo os presets");
    var found = [], bad = 0, other = 0;
    try {
      for (var f = 0; f < files.length; f++) {
        var file = files[f], buf = await file.arrayBuffer(), head = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
        var texts = head[0] === 0x50 && head[1] === 0x4b ? await unzip(buf) : [{ name: file.name, text: new TextDecoder("utf-8").decode(buf) }];
        texts.forEach(function (t) {
          var o;
          try { o = JSON.parse(t.text.replace(/^﻿/, "")); } catch (e) { bad++; return; }
          var list = Array.isArray(o) ? o : Array.isArray(o.items) ? o.items : Array.isArray(o.presets) ? o.presets : [o];
          list.forEach(function (x) {
            var it = normalize(x);
            if (!it) bad++; else if (it.skip) other++; else found.push(it);
          });
        });
      }
    } catch (e) { CR.busy(false); CR.toast("Não consegui ler: " + e.message, true); return; }
    var byUid = {}, added = 0, again = 0;
    data.items.forEach(function (it, i) { byUid[it.uid] = i; });
    found.forEach(function (it) {
      if (byUid[it.uid] !== undefined) {
        var old = data.items[byUid[it.uid]];
        it.status = old.status; it.memory = old.memory;      // mantém o que você já decidiu
        if (old.modOrig !== undefined) { it.modOrig = old.modOrig; it.values[8] = 7; }
        if (old.catSet) { it.category = old.category; it.catSet = true; }
        data.items[byUid[it.uid]] = it; again++;
      } else { byUid[it.uid] = data.items.length; data.items.push(it); added++; }
    });
    await persist();
    CR.busy(false);
    ui.shown = PAGE;
    CR.dialog("green", "Presets importados", "",
      "<p><b>" + added + "</b> novo(s) na biblioteca" + (again ? ", <b>" + again + "</b> já estavam (atualizados)" : "") + ".</p>" +
      (other ? "<p>" + other + " ignorado(s) por serem de outro modelo (Cube Baby Bass ou AC).</p>" : "") +
      (bad ? "<p>" + bad + " arquivo(s) ou item(ns) não reconhecido(s).</p>" : "") +
      "<p>Agora escolha uma categoria, teste em A, B ou C e guarde nas memórias os que gostar.</p>" +
      '<div class="dialog-actions"><button class="btn primary big" type="button" data-close>Ver a biblioteca</button></div>');
    CR.emit("library");
  }

  /* ================================================================ tela */
  function counts(list) {
    var c = { all: 0 };
    list.forEach(function (it) { c.all++; c[it.category] = (c[it.category] || 0) + 1; });
    return c;
  }
  function filtered() {
    var q = plain(ui.q).trim();
    var list = data.items.filter(function (it) {
      if (ui.status === "all" ? it.status === "no" : it.status !== ui.status) return false;
      if (q && plain(it.name + " " + it.author + " " + it.description).indexOf(q) < 0) return false;
      return true;
    });
    var byCat = ui.cat === "all" ? list : list.filter(function (it) { return it.category === ui.cat; });
    byCat.sort(ui.sort === "name" ? function (a, b) { return a.name.localeCompare(b.name, "pt-BR"); }
      : ui.sort === "new" ? function (a, b) { return (b.source.id || 0) - (a.source.id || 0); }
      : function (a, b) { return (b.source.likes - b.source.dislikes) - (a.source.likes - a.source.dislikes) || (b.source.id || 0) - (a.source.id || 0); });
    return { list: byCat, counts: counts(list) };
  }

  function knobLine(v) {
    var mod = v[8] === 7 ? "OFF" : v[8] < 7 ? "CH " + (7 - v[8]) : "PH " + (v[8] - 7);
    return "GAIN " + v[1] + " · TONE " + v[2] + " · REVERB " + v[3] + " · MIX " + v[7] + " · FB " + v[4] + " · TIME " + v[6] + " · MOD " + mod + " · VOL " + v[5];
  }

  function card(it, idx) {
    var v = it.values;
    var st = it.status === "ok" ? '<span class="lib-st ok">Aprovado' + (it.memory ? " · memória " + it.memory : "") + "</span>" : it.status === "no" ? '<span class="lib-st no">Descartado</span>' : "";
    return '<article class="lib-card ' + it.status + '">' +
      '<div class="lib-top"><div class="lib-info"><p class="mem-group">' + CR.esc(CAT_NAME[it.category] || "") + "</p>" +
        "<h3>" + CR.esc(it.name) + "</h3>" +
        '<p class="lib-by">' + (it.author ? "por " + CR.esc(it.author) : "") + (it.source.likes || it.source.dislikes ? " · " + it.source.likes + " curtida(s)" : "") + st + "</p>" +
        (it.description ? '<p class="lib-desc">' + CR.esc(it.description) + "</p>" : "") +
        "<p>" + CR.esc(CR.Memory.summary(v)) + "</p>" +
        '<p class="lib-knobs">' + knobLine(v) + "</p>" + CR.Memory.mods(v) + "</div>" +
        '<button type="button" class="icon-btn mem-more" data-libmore="' + idx + '" aria-label="Detalhes de ' + CR.esc(it.name) + '">' + CR.icon("more") + "</button></div>" +
      (v[8] === 0 || it.modOrig !== undefined ? '<button type="button" class="btn lib-mod" data-libmod="' + idx + '">' + CR.icon("mute") + "<span>" +
        (it.modOrig !== undefined ? "Voltar o chorus do autor (MOD 0)" : "MOD em 0 = chorus no máximo. Tirar o chorus (MOD no centro)") + "</span></button>" : "") +
      CR.Memory.loadButtons(v, "libtest", idx, "Testar em") +
      '<div class="lib-actions"><button type="button" class="btn big primary" data-libsave="' + idx + '">' + CR.icon("save") + "<span>" + (it.status === "ok" ? "Guardar de novo" : "Aprovar e guardar") + "</span></button>" +
      '<button type="button" class="btn big" data-libno="' + idx + '">' + (it.status === "no" ? CR.icon("undo") + "<span>Voltar</span>" : CR.icon("close") + "<span>Descartar</span>") + "</button></div>" +
      "</article>";
  }

  var current = [];
  function render(view, tabs) {
    if (!loaded) { view.innerHTML = '<div class="page">' + tabs + '<div class="state-card"><div class="spinner"></div><h2>Abrindo a biblioteca</h2></div></div>'; load().then(function () { CR.Memory.render(); }); return; }
    var y = view.scrollTop;
    var up = '<label class="btn wide big primary file-btn">' + CR.icon("file") + '<span>Subir presets (.zip ou .json)</span><input id="libFiles" type="file" accept=".zip,.json,application/zip,application/json" multiple hidden></label>';
    if (!data.items.length) {
      view.innerHTML = '<div class="page mem-page">' + tabs +
        '<div class="state-card lib-empty">' + CR.icon("learn", "state-ico") + "<h2>Biblioteca vazia</h2>" +
        "<p>Suba aqui um pacote de presets (.zip) ou vários arquivos .json de uma vez. Depois é só testar em A, B ou C e guardar nas memórias os que você aprovar.</p>" + up + "</div></div>";
      bindUpload(view);
      return;
    }
    var r = filtered(); current = r.list;
    var ok = data.items.filter(function (it) { return it.status === "ok"; }).length;
    view.innerHTML = '<div class="page mem-page">' + tabs +
      '<header class="mem-head"><p>' + data.items.length + " presets na biblioteca · " + ok + " aprovado(s). Teste em A, B ou C e guarde os que gostar.</p></header>" +
      up +
      '<input class="text-input" id="libQ" type="search" placeholder="Buscar por nome, autor ou descrição" value="' + CR.esc(ui.q) + '" aria-label="Buscar presets">' +
      '<div class="chips lib-cats">' + [["all", "Todas"]].concat(CATS).map(function (c) {
        var n = r.counts[c[0]] || 0;
        return '<button type="button" class="chip-btn" data-cat="' + c[0] + '" aria-pressed="' + (ui.cat === c[0]) + '">' + c[1] + " <small>" + n + "</small></button>";
      }).join("") + "</div>" +
      '<div class="seg lib-status" role="group">' + STATUS.map(function (s) { return '<button type="button" data-st="' + s[0] + '" aria-pressed="' + (ui.status === s[0]) + '">' + s[1] + "</button>"; }).join("") + "</div>" +
      '<label class="field lib-sort"><span class="field-head"><span>Ordenar</span></span><select class="text-input" id="libSort">' +
        [["likes", "Mais curtidos"], ["new", "Mais recentes"], ["name", "Nome (A a Z)"]].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === ui.sort ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>" +
      '<p class="lib-count">' + r.list.length + " preset(s) nesta visão" + (CR.S.presets ? "" : ". Conecte a pedaleira para testar.") + "</p>" +
      '<div class="lib-list">' + r.list.slice(0, ui.shown).map(card).join("") + "</div>" +
      (r.list.length > ui.shown ? '<button class="btn wide big" type="button" id="libMore">Mostrar mais (' + (r.list.length - ui.shown) + " restantes)</button>" : "") +
      '<article class="card"><header class="card-head">' + CR.icon("trash") + "<div><h2>Gerenciar</h2><p>As memórias que você guardou não são afetadas.</p></div></header>" +
        '<button class="btn wide danger" type="button" id="libClear">' + CR.icon("trash") + "<span>Apagar a biblioteca inteira</span></button></article>" +
      "</div>";
    view.scrollTop = y;
    bindUpload(view);
    var qi = $("#libQ", view), qt = null;
    qi.oninput = function () { clearTimeout(qt); qt = setTimeout(function () { ui.q = qi.value; ui.shown = PAGE; rerender(true); }, 300); };
    view.querySelectorAll("[data-cat]").forEach(function (b) { b.onclick = function () { ui.cat = b.dataset.cat; ui.shown = PAGE; rerender(); }; });
    view.querySelectorAll("[data-st]").forEach(function (b) { b.onclick = function () { ui.status = b.dataset.st; ui.shown = PAGE; rerender(); }; });
    $("#libSort", view).onchange = function (e) { ui.sort = e.target.value; ui.shown = PAGE; rerender(); };
    var more = $("#libMore", view);
    if (more) more.onclick = function () { ui.shown += PAGE; rerender(); };
    view.querySelectorAll("[data-libtest]").forEach(function (b) {
      b.onclick = function () { var it = current[Number(b.dataset.libtest)]; CR.Memory.applyTo(it.values, Number(b.dataset.to), '"' + it.name + '"'); };
    });
    view.querySelectorAll("[data-libsave]").forEach(function (b) { b.onclick = function () { approve(current[Number(b.dataset.libsave)]); }; });
    view.querySelectorAll("[data-libno]").forEach(function (b) {
      b.onclick = function () { var it = current[Number(b.dataset.libno)]; it.status = it.status === "no" ? "new" : "no"; persist(); rerender(); CR.toast(it.status === "no" ? "Descartado (aparece em Descartados)" : "Voltou para Para testar"); };
    });
    view.querySelectorAll("[data-libmod]").forEach(function (b) {
      b.onclick = function () {
        var it = current[Number(b.dataset.libmod)];
        if (it.modOrig !== undefined) { it.values[8] = it.modOrig; delete it.modOrig; }
        else { it.modOrig = it.values[8]; it.values[8] = 7; }
        persist(); rerender();
        CR.toast(it.modOrig !== undefined ? "Sem modulação: MOD no centro" : "Chorus do autor de volta");
      };
    });
    view.querySelectorAll("[data-libmore]").forEach(function (b) { b.onclick = function () { details(current[Number(b.dataset.libmore)]); }; });
    $("#libClear", view).onclick = async function () {
      if (!(await CR.confirm("Apagar a biblioteca", "Tirar os " + data.items.length + " presets da biblioteca? As memórias que você guardou continuam.", "Apagar"))) return;
      data.items = []; persist(); rerender(); CR.emit("library");
    };
    if (document.activeElement === document.body && ui.focusQ) { qi.focus(); qi.setSelectionRange(qi.value.length, qi.value.length); }
  }
  function rerender(keepFocus) { ui.focusQ = !!keepFocus; CR.Memory.render(); ui.focusQ = false; }

  function bindUpload(view) {
    var inp = $("#libFiles", view);
    if (inp) inp.onchange = function (e) { var fs = e.target.files; importFiles(fs).then(function () { e.target.value = ""; rerender(); }); };
  }

  function approve(it) {
    CR.Memory.saveValues(it.values, it.name.slice(0, 28), function (i) {
      it.status = "ok"; it.memory = i + 1; persist(); rerender();
    });
  }

  function details(it) {
    var v = it.values;
    CR.dialog("white", CR.esc(it.name), (it.author ? "por " + CR.esc(it.author) + " · " : "") + CR.esc(CAT_NAME[it.category] || ""),
      (it.description ? "<p>" + CR.esc(it.description) + "</p>" : "") +
      '<dl class="mem-values">' + CR.CONTROLS.map(function (c) {
        var f = CR.format(c, v[c.off]);
        return '<div style="--led:var(--led-' + c.color + ')"><dt>' + c.label + "</dt><dd>" + f.short + (c.list ? " · " + CR.esc(f.long) : "") + "</dd></div>";
      }).join("") + "</dl>" +
      it.notes.map(function (n) { return '<p class="hint">' + CR.esc(n) + "</p>"; }).join("") +
      (it.source.url ? '<p class="hint">Fonte: ' + CR.esc(it.source.url) + "</p>" : "") +
      '<label class="field"><span class="field-head"><span>Categoria</span></span><select class="text-input" id="libCat">' +
        CATS.map(function (c) { return '<option value="' + c[0] + '"' + (c[0] === it.category ? " selected" : "") + ">" + c[1] + "</option>"; }).join("") + "</select></label>" +
      '<div class="mem-menu"><button class="btn big danger" type="button" data-del>' + CR.icon("trash") + "<span>Tirar da biblioteca</span></button>" +
      '<button class="btn big primary" type="button" data-close>' + CR.icon("check") + "<span>Fechar</span></button></div>");
    var d = document.getElementById("dialog");
    $("#libCat", d).onchange = function (e) { it.category = e.target.value; it.catSet = true; persist(); rerender(); };
    $("[data-del]", d).onclick = function () {
      data.items.splice(data.items.indexOf(it), 1); persist(); d.hidden = true; rerender(); CR.emit("library");
    };
  }

  /* Nome do preset da biblioteca carregado num footswitch (para o Palco). */
  function nameFor(p) {
    for (var i = 0; i < data.items.length; i++) if (CR.Memory.sameAs(data.items[i].values, p)) return data.items[i].name;
    return "";
  }

  return { render: render, count: function () { return data.items.length; }, init: function () { return load().then(function () { CR.emit("library"); }); },
           importFiles: importFiles, nameFor: nameFor, _normalize: normalize, _categorize: categorize, _unzip: unzip, CATS: CATS };
})();
