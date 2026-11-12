/* Cube Remote · Copyright (c) 2026 José Renato · Jr_Tech_OFC. Todos os direitos reservados.
   Aba Memórias: 10 sons guardados no celular, que carregam no preset A, B ou C com um toque.
   Os 3 presets de fábrica ficam sempre disponíveis como memórias fixas (não se apagam).

   Onde ficam salvas: arquivo memorias.json do app (MainActivity.memSave), com cópia de segurança
   automática (memorias.bak.json). Backup manual: pasta Download ou compartilhar.
   Formato: { app, kind: "memorias", version: 1, slots: [ null | { name, values[16], from, saved } ] } */
"use strict";
var CR = window.CR || (window.CR = {});

CR.Memory = (function () {
  var N = 10;                          // quantidade de memórias (mude aqui se quiser mais)
  var NAME_MAX = 28;
  var LETTERS = ["A", "B", "C"];
  var FACTORY_DEFAULT = [[2, 4, 10, 4, 31, 38, 31, 19, 7, 8, 1, 1, 1, 0, 0, 0],
                         [6, 3, 10, 0, 31, 12, 31, 16, 7, 8, 1, 1, 1, 0, 0, 0],
                         [0, 5, 11, 0, 31, 32, 31, 19, 7, 8, 1, 1, 1, 0, 0, 0]];
  var data = emptyData(), loaded = false, loadError = "";
  var $ = function (s, r) { return (r || document).querySelector(s); };

  /* Código fixo de cada memória: a setlist aponta para ele, então reordenar não estraga nada. */
  function newId() { return "m" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36); }

  function emptyData() {
    var slots = [];
    for (var i = 0; i < N; i++) slots.push(null);
    return { app: "Cube Remote", kind: "memorias", version: 1, slots: slots };
  }

  /* ================================================================ dados */

  /* Confere e corrige uma memória vinda do arquivo (valores fora da faixa são limitados). */
  function cleanSlot(s) {
    if (!s || !Array.isArray(s.values) || s.values.length < 13) return null;
    var v = [];
    for (var i = 0; i < 16; i++) {
      var x = Math.round(Number(s.values[i]) || 0);
      v.push(Math.max(0, Math.min(127, x)));
    }
    CR.CONTROLS.forEach(function (c) { v[c.off] = Math.min(v[c.off], c.max); });
    CR.MODULES.forEach(function (m) { v[m.off] = v[m.off] ? 1 : 0; });
    return { id: typeof s.id === "string" && /^[a-z0-9]{4,24}$/.test(s.id) ? s.id : newId(), name: String(s.name || "").trim().slice(0, NAME_MAX) || "Sem nome", values: v,
             from: LETTERS.indexOf(s.from) >= 0 ? s.from : "", saved: String(s.saved || "") };
  }

  /* Aceita o arquivo completo de backup; o texto pode vir com algo antes ou depois (ex.: colado do WhatsApp). */
  function parse(text) {
    var a = text.indexOf("{"), b = text.lastIndexOf("}");
    if (a < 0 || b < a) throw new Error("O texto não parece um backup do Cube Remote.");
    var o = JSON.parse(text.slice(a, b + 1));
    if (!o || o.kind !== "memorias" || !Array.isArray(o.slots)) throw new Error("O arquivo não é um backup de memórias do Cube Remote.");
    var d = emptyData();
    for (var i = 0; i < N; i++) {
      d.slots[i] = cleanSlot(o.slots[i]);
      if (d.slots[i] && (!o.slots[i].id || o.slots[i].id !== d.slots[i].id)) d._newIds = true;
    }
    if (o.setlist) d._setlist = o.setlist;     // backup completo também traz a setlist
    return d;
  }

  function load() {
    return CR.native("memLoad").then(function (txt) {
      loaded = true;
      if (!txt) return;
      try {
        data = parse(txt); loadError = "";
        // arquivo de uma versão antiga, sem códigos: grava os códigos novos para não mudarem a cada abertura
        if (data._newIds) { delete data._newIds; persist(); }
      }
      catch (e) { loadError = "O arquivo de memórias estava com problema e não foi lido: " + e.message; }
    }).catch(function (e) { loaded = true; loadError = e.message; });
  }

  function persist() {
    CR.emit("memories");
    return CR.native("memSave", { data: JSON.stringify(data, null, 1) })
      .catch(function (e) { CR.toast(e.message, true); throw e; });
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function factory() { return CR.S.factory || FACTORY_DEFAULT; }

  /* true quando o som da memória é igual ao preset p da pedaleira (bytes 0 a 12) */
  function sameAs(values, p) {
    if (!CR.S.presets) return false;
    var cur = CR.S.presets[p];
    for (var i = 0; i <= 12; i++) if (cur[i] !== values[i]) return false;
    return true;
  }

  /* ================================================================ desenho */
  function summary(v) {
    return CR.TYPES[v[0]].name + " · " + (v[9] === 0 ? "sem IR" : CR.CABS[v[9]].name);
  }

  function mods(v) {
    return '<span class="mem-mods" aria-label="Módulos">' + CR.MODULES.map(function (m) {
      var on = !!v[m.off];
      return '<i class="' + (on ? "on" : "") + '" style="--led:var(--led-' + m.color + ')" title="Módulo ' + m.n + (on ? " ligado" : " desligado") + '">' + m.n + "</i>";
    }).join("") + "</span>";
  }

  function loadButtons(values, kindAttr, idx, label) {
    var dis = CR.S.presets ? "" : " disabled";
    return '<div class="mem-actions"><span class="mem-act-label">' + label + "</span>" + LETTERS.map(function (L, p) {
      var match = values && sameAs(values, p);
      return '<button type="button" class="load-btn' + (match ? " match" : "") + '" data-' + kindAttr + '="' + idx + '" data-to="' + p + '"' + dis +
        ' style="--led:var(--led-' + CR.MODULES[p].color + ')" aria-label="' + label + " " + L + (match ? " (igual ao preset atual)" : "") + '">' +
        '<i class="led"></i><b>' + L + "</b></button>";
    }).join("") + "</div>";
  }

  function card(slot, i) {
    var n = i + 1;
    if (!slot) {
      return '<article class="mem-card empty"><div class="mem-top"><span class="mem-n">' + n + "</span>" +
        '<div class="mem-info"><h3>Memória vazia</h3><p>Guarde aqui o som de um preset da pedaleira.</p></div></div>' +
        loadButtons(null, "save", i, "Guardar o preset") + "</article>";
    }
    var v = slot.values;
    return '<article class="mem-card"><div class="mem-top"><span class="mem-n">' + n + "</span>" +
      '<div class="mem-info"><h3>' + CR.esc(slot.name) + "</h3><p>" + CR.esc(summary(v)) + "</p>" + mods(v) + "</div>" +
      '<button type="button" class="icon-btn mem-more" data-more="' + i + '" aria-label="Opções da memória ' + n + '">' + CR.icon("more") + "</button></div>" +
      loadButtons(v, "load", i, "Carregar em") + "</article>";
  }

  function factoryCard(v, p) {
    return '<article class="mem-card factory"><div class="mem-top"><span class="mem-n f">F' + LETTERS[p] + "</span>" +
      '<div class="mem-info"><h3>Fábrica ' + LETTERS[p] + "</h3><p>" + CR.esc(summary(v)) + "</p>" + mods(v) + "</div></div>" +
      loadButtons(v, "factory", p, "Carregar em") + "</article>";
  }

  /* Sons prontos (js/sounds.js): só leitura, carregam em A/B/C ou viram uma memória sua. */
  function readyValues(i) { return cleanSlot({ values: CR.SOUNDS[i].values }).values; }
  function readyCard(s, i) {
    var v = readyValues(i);
    return '<article class="mem-card ready"><div class="mem-top"><span class="mem-n r">' + CR.icon("culto") + "</span>" +
      '<div class="mem-info"><p class="mem-group">' + CR.esc(s.group) + "</p><h3>" + CR.esc(s.name) + '</h3><p class="mem-desc">' + CR.esc(s.desc) + "</p>" +
      "<p>" + CR.esc(summary(v)) + "</p>" + mods(v) + "</div>" +
      '<button type="button" class="icon-btn mem-more" data-keep="' + i + '" aria-label="Guardar ' + CR.esc(s.name) + ' numa memória">' + CR.icon("save") + "</button></div>" +
      loadButtons(v, "ready", i, "Carregar em") + "</article>";
  }
  function keepReady(i) {
    var s = CR.SOUNDS[i], free = data.slots.indexOf(null);
    if (free < 0) { CR.toast("As 10 memórias estão em uso. Apague uma para guardar este som.", true); return; }
    data.slots[free] = { id: newId(), name: s.name.slice(0, NAME_MAX), values: readyValues(i), from: "", saved: today() };
    persist().then(function () { CR.toast('"' + s.name + '" guardado na memória ' + (free + 1) + ". Agora dá para ajustar e substituir à vontade."); refresh(); });
  }

  function render() {
    var view = document.getElementById("view-memory");
    if (!loaded) {
      view.innerHTML = '<div class="page"><div class="state-card"><div class="spinner"></div><h2>Abrindo memórias</h2></div></div>';
      load().then(render);
      return;
    }
    var used = data.slots.filter(Boolean).length;
    var offline = !CR.S.presets;
    view.innerHTML = '<div class="page mem-page">' +
      '<header class="mem-head"><h1 class="page-title">Memórias</h1><p>' + used + " de " + N + " em uso. Toque em A, B ou C para carregar o som no footswitch.</p></header>" +
      (loadError ? '<p class="mem-warn">' + CR.esc(loadError) + "</p>" : "") +
      (offline ? '<p class="mem-warn">Conecte a pedaleira para carregar ou guardar sons. Dá para renomear, organizar e fazer backup mesmo sem ela.</p>' : "") +
      '<div class="mem-list">' + data.slots.map(card).join("") + "</div>" +
      '<h2 class="mem-sec">Presets de fábrica</h2><p class="mem-sub">Sempre disponíveis. Não podem ser apagados nem alterados.</p>' +
      '<div class="mem-list">' + factory().map(factoryCard).join("") + "</div>" +
      '<h2 class="mem-sec">Sons prontos para o culto</h2><p class="mem-sub">' + CR.SOUNDS.length + " sons de ponto de partida, by Jr_Tech_OFC. Carregue em A, B ou C, ou toque na seta de guardar para copiar numa memória sua e ajustar. Nivele os volumes no ensaio.</p>" +
      '<div class="mem-list">' + CR.SOUNDS.map(readyCard).join("") + "</div>" +
      '<article class="card"><header class="card-head">' + CR.icon("save") + "<div><h2>Backup</h2><p>Guarde uma cópia das memórias para não perder ao trocar de celular.</p></div></header>" +
        '<div class="mem-backup">' +
        '<button class="btn" type="button" data-backup="export">' + CR.icon("save") + "<span>Salvar em Download</span></button>" +
        '<button class="btn" type="button" data-backup="share">' + CR.icon("share") + "<span>Enviar backup</span></button>" +
        '<button class="btn" type="button" data-backup="import">' + CR.icon("file") + "<span>Importar backup</span></button></div></article>" +
      "</div>";

    view.querySelectorAll("[data-load]").forEach(function (b) {
      b.onclick = function () { var s = data.slots[Number(b.dataset.load)]; applyTo(s.values, Number(b.dataset.to), '"' + s.name + '"'); };
    });
    view.querySelectorAll("[data-factory]").forEach(function (b) {
      b.onclick = function () { var p = Number(b.dataset.factory); applyTo(factory()[p], Number(b.dataset.to), "Fábrica " + LETTERS[p]); };
    });
    view.querySelectorAll("[data-ready]").forEach(function (b) {
      b.onclick = function () { var i = Number(b.dataset.ready); applyTo(readyValues(i), Number(b.dataset.to), '"' + CR.SOUNDS[i].name + '"'); };
    });
    view.querySelectorAll("[data-keep]").forEach(function (b) { b.onclick = function () { keepReady(Number(b.dataset.keep)); }; });
    view.querySelectorAll("[data-save]").forEach(function (b) {
      b.onclick = function () { saveDialog(Number(b.dataset.save), Number(b.dataset.to)); };
    });
    view.querySelectorAll("[data-more]").forEach(function (b) { b.onclick = function () { menu(Number(b.dataset.more)); }; });
    view.querySelectorAll("[data-backup]").forEach(function (b) {
      b.onclick = function () { ({ export: exportFile, share: share, import: importDialog })[b.dataset.backup](); };
    });
  }

  function refresh() {
    if (document.getElementById("app").dataset.view === "memory" && loaded) {
      var v = document.getElementById("view-memory"), y = v.scrollTop;
      render();
      v.scrollTop = y;
    }
  }

  /* ================================================================ ações */
  async function applyTo(values, p, label) {
    if (CR.S.locked) { CR.toast("Controles travados. Segure o cadeado para destravar."); return; }
    if (!CR.S.presets) { CR.toast("Conecte a pedaleira primeiro", true); return; }
    CR.busy(true, "Carregando no preset " + LETTERS[p]);
    try {
      if (CR.Live) CR.Live.release();
      await CR.applyValues(p, values);
      CR.haptic();
      CR.toast(label + " carregada no preset " + LETTERS[p] + ". Para voltar, use Desfazer no topo.");
    } catch (e) { CR.toast(e.message, true); }
    finally { CR.busy(false); refresh(); }
  }

  function nameField(value, placeholder) {
    return '<label class="field"><span class="field-head"><span>Nome</span></span>' +
      '<input class="text-input" id="memName" type="text" maxlength="' + NAME_MAX + '" autocomplete="off" value="' + CR.esc(value || "") +
      '" placeholder="' + CR.esc(placeholder) + '"></label>';
  }

  function saveDialog(i, p) {
    if (CR.S.locked) { CR.toast("Controles travados. Segure o cadeado para destravar."); return; }
    if (!CR.S.presets) return;
    if (CR.Live && CR.Live.active()) { CR.toast("Desligue Boost, Mudo ou Fade na aba Culto antes de guardar, para não salvar o volume alterado.", true); return; }
    var v = CR.S.presets[p], old = data.slots[i];
    CR.dialog(CR.MODULES[p].color, "Guardar na memória " + (i + 1), "Som atual do preset " + LETTERS[p],
      '<p class="mem-preview">' + CR.esc(summary(v)) + "</p>" + mods(v) +
      nameField(old ? old.name : "", "Ex.: Louvor limpo, Solo, Ministração") +
      (old ? '<p class="hint">A memória "' + CR.esc(old.name) + '" será substituída.</p>' : "") +
      '<div class="dialog-actions"><button class="btn big" type="button" data-no>Cancelar</button>' +
      '<button class="btn primary big" type="button" data-yes>' + CR.icon("save") + "<span>Guardar</span></button></div>");
    var d = document.getElementById("dialog"), input = $("#memName");
    setTimeout(function () { input.focus(); }, 60);
    function done() {
      data.slots[i] = { id: old ? old.id : newId(), name: input.value.trim().slice(0, NAME_MAX) || "Memória " + (i + 1), values: v.slice(), from: LETTERS[p], saved: today() };
      d.hidden = true;
      persist().then(function () { CR.haptic(); CR.toast("Guardado na memória " + (i + 1)); refresh(); });
    }
    $("[data-yes]", d).onclick = done;
    $("[data-no]", d).onclick = function () { d.hidden = true; };
    input.onkeydown = function (e) { if (e.key === "Enter") done(); };
  }

  function valuesTable(v) {
    return '<dl class="mem-values">' + CR.CONTROLS.map(function (c) {
      var f = CR.format(c, v[c.off]);
      return '<div style="--led:var(--led-' + c.color + ')"><dt>' + c.label + "</dt><dd>" + f.short + (c.list ? " · " + CR.esc(f.long) : "") + "</dd></div>";
    }).join("") + "</dl>";
  }

  function menu(i) {
    var s = data.slots[i];
    if (!s) return;
    var dis = CR.S.presets ? "" : " disabled";
    CR.dialog("white", CR.esc(s.name), "Memória " + (i + 1) + (s.saved ? " · guardada em " + s.saved.split("-").reverse().join("/") : "") + (s.from ? " a partir do preset " + s.from : ""),
      mods(s.values) + valuesTable(s.values) +
      '<h3>Substituir pelo som atual do preset</h3><div class="mem-replace">' + LETTERS.map(function (L, p) {
        return '<button class="btn big" type="button" data-replace="' + p + '"' + dis + ' style="--led:var(--led-' + CR.MODULES[p].color + ')"><i class="led on"></i><span>' + L + "</span></button>";
      }).join("") + "</div>" +
      '<div class="mem-menu">' +
        '<button class="btn big" type="button" data-m="rename">' + CR.icon("edit") + "<span>Renomear</span></button>" +
        '<button class="btn big danger" type="button" data-m="delete">' + CR.icon("trash") + "<span>Apagar</span></button>" +
        '<button class="btn big" type="button" data-m="up"' + (i === 0 ? " disabled" : "") + ">" + CR.icon("up") + "<span>Subir</span></button>" +
        '<button class="btn big" type="button" data-m="down"' + (i === N - 1 ? " disabled" : "") + ">" + CR.icon("down") + "<span>Descer</span></button>" +
      "</div>");
    var d = document.getElementById("dialog");
    d.querySelectorAll("[data-replace]").forEach(function (b) {
      b.onclick = function () { d.hidden = true; saveDialog(i, Number(b.dataset.replace)); };
    });
    $('[data-m="rename"]', d).onclick = function () { renameDialog(i); };
    $('[data-m="delete"]', d).onclick = async function () {
      d.hidden = true;
      if (!(await CR.confirm("Apagar memória", 'Apagar "' + CR.esc(s.name) + '"? O preset da pedaleira não muda.', "Apagar"))) return;
      data.slots[i] = null;
      persist().then(function () { CR.toast("Memória " + (i + 1) + " apagada"); refresh(); });
    };
    d.querySelectorAll('[data-m="up"], [data-m="down"]').forEach(function (b) {
      b.onclick = function () {
        var j = i + (b.dataset.m === "up" ? -1 : 1);
        var t = data.slots[j]; data.slots[j] = data.slots[i]; data.slots[i] = t;
        persist().then(function () { refresh(); menu(j); });
      };
    });
  }

  function renameDialog(i) {
    var s = data.slots[i];
    CR.dialog("white", "Renomear memória " + (i + 1), "", nameField(s.name, "Nome da memória") +
      '<div class="dialog-actions"><button class="btn big" type="button" data-no>Cancelar</button>' +
      '<button class="btn primary big" type="button" data-yes>' + CR.icon("check") + "<span>Salvar nome</span></button></div>");
    var d = document.getElementById("dialog"), input = $("#memName");
    setTimeout(function () { input.focus(); input.select(); }, 60);
    function done() {
      s.name = input.value.trim().slice(0, NAME_MAX) || s.name;
      d.hidden = true;
      persist().then(refresh);
    }
    $("[data-yes]", d).onclick = done;
    $("[data-no]", d).onclick = function () { d.hidden = true; };
    input.onkeydown = function (e) { if (e.key === "Enter") done(); };
  }

  /* ================================================================ backup */
  function backupText() {
    var o = { app: data.app, kind: data.kind, version: data.version, slots: data.slots };
    if (CR.Culto) o.setlist = CR.Culto.data();
    return JSON.stringify(o, null, 1);
  }

  function exportFile() {
    CR.native("memExport", { data: backupText() })
      .then(function (name) { CR.toast("Backup salvo na pasta Download: " + name); })
      .catch(function (e) { CR.toast("Não consegui salvar em Download (" + e.message + "). Use Enviar backup.", true); });
  }

  function share() { CR.native("memShare", { data: backupText() }).catch(function (e) { CR.toast(e.message, true); }); }

  function importDialog() {
    CR.dialog("white", "Importar backup", "Substitui as 10 memórias pelas do backup",
      '<label class="btn wide big file-btn">' + CR.icon("file") + '<span>Escolher arquivo .json</span><input type="file" id="memFile" accept=".json,application/json,text/plain" hidden></label>' +
      '<p class="hint">Ou cole aqui o texto do backup (por exemplo, enviado pelo WhatsApp):</p>' +
      '<textarea class="text-input mem-paste" id="memPaste" rows="4" placeholder="Cole o backup aqui"></textarea>' +
      '<div class="dialog-actions"><button class="btn big" type="button" data-no>Cancelar</button>' +
      '<button class="btn primary big" type="button" data-yes>Importar texto</button></div>');
    var d = document.getElementById("dialog");
    $("[data-no]", d).onclick = function () { d.hidden = true; };
    $("[data-yes]", d).onclick = function () { tryImport($("#memPaste").value); };
    $("#memFile").onchange = function (e) {
      var f = e.target.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () { tryImport(String(r.result)); };
      r.onerror = function () { CR.toast("Não consegui ler o arquivo", true); };
      r.readAsText(f);
    };
  }

  async function tryImport(text) {
    var d;
    try { d = parse(text || ""); }
    catch (e) { CR.toast(e.message, true); return; }
    var count = d.slots.filter(Boolean).length, sl = d._setlist;
    delete d._setlist;
    var songs = sl && Array.isArray(sl.songs) ? sl.songs.length : 0;
    document.getElementById("dialog").hidden = true;
    if (!(await CR.confirm("Importar backup", "O backup tem " + count + " memória(s)" + (songs ? " e uma setlist com " + songs + " música(s)" : "") +
      ". O que está no app agora será substituído.", "Importar"))) return;
    delete d._newIds;
    data = d;
    if (sl && CR.Culto) CR.Culto.importData(sl);
    loadError = "";
    persist().then(function () { CR.toast(count + " memória(s) importada(s)"); refresh(); });
  }

  CR.on("changed", refresh);
  CR.on("preset", refresh);

  /* Nome da memória cujo som é igual ao preset p agora (para os botões A, B, C do Palco). */
  function nameFor(p) {
    for (var i = 0; i < N; i++) { var sl = data.slots[i]; if (sl && sameAs(sl.values, p)) return sl.name; }
    var f = factory();
    for (var j = 0; j < 3; j++) if (sameAs(f[j], p)) return "Fábrica " + LETTERS[j];
    for (var k = 0; k < CR.SOUNDS.length; k++) if (sameAs(readyValues(k), p)) return CR.SOUNDS[k].name;
    return "";
  }

  /* Abre o arquivo de memórias ao iniciar o app, para o Palco já mostrar os nomes. */
  function init() { return load().then(function () { CR.emit("memories"); }); }

  /* Para a setlist: lista de sons que podem ir num footswitch ("f0" a "f2" = fábrica A a C). */
  function options() {
    var out = [];
    data.slots.forEach(function (sl, i) { if (sl) out.push({ ref: sl.id, name: (i + 1) + ". " + sl.name }); });
    LETTERS.forEach(function (L, p) { out.push({ ref: "f" + p, name: "Fábrica " + L }); });
    CR.SOUNDS.forEach(function (s, i) { out.push({ ref: "r" + i, name: "Pronto: " + s.name }); });
    return out;
  }
  function byRef(ref) {
    if (!ref) return null;
    if (/^f[0-2]$/.test(ref)) { var p = Number(ref[1]); return { name: "Fábrica " + LETTERS[p], values: factory()[p] }; }
    if (/^r\d+$/.test(ref) && CR.SOUNDS[Number(ref.slice(1))]) { var r = Number(ref.slice(1)); return { name: CR.SOUNDS[r].name, values: readyValues(r) }; }
    for (var i = 0; i < N; i++) if (data.slots[i] && data.slots[i].id === ref) return data.slots[i];
    return null;
  }

  return { render: render, refresh: refresh, nameFor: nameFor, init: init, options: options, byRef: byRef,
           ready: function () { return loaded; }, _parse: parse };
})();
