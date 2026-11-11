/* Cube Remote · Copyright (c) 2026 José Renato · Jr_Tech_OFC. Todos os direitos reservados.
   Aba Culto: setlist (músicas na ordem do culto), ações ao vivo e pedal Bluetooth.

   Cada música diz qual som vai em A, B e C (memórias da aba Memórias ou presets de fábrica).
   "Próxima" carrega os três de uma vez. Salvo no arquivo setlist.json do app.
   Formato: { kind: "setlist", version: 1, name, current, songs: [{ id, name, key, bpm, notes, A, B, C }] } */
"use strict";
var CR = window.CR || (window.CR = {});

CR.Culto = (function () {
  var LETTERS = ["A", "B", "C"];
  var KEYS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  var MAX_SONGS = 40;
  var data = empty(), loaded = false, lastKey = "", pulseOn = CR.store.get("cr.pulse", false);
  var $ = function (s, r) { return (r || document).querySelector(s); };

  function empty() { return { kind: "setlist", version: 1, name: "Culto", current: -1, songs: [] }; }
  function newId() { return "s" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36); }

  /* ================================================================ dados */
  function clean(o) {
    var d = empty();
    if (!o || !Array.isArray(o.songs)) return d;
    d.name = String(o.name || "Culto").slice(0, 40);
    d.songs = o.songs.slice(0, MAX_SONGS).map(function (s) {
      var bpm = Math.round(Number(s.bpm) || 0);
      return { id: s.id || newId(), name: String(s.name || "Música").trim().slice(0, 60), key: String(s.key || "").slice(0, 4),
               bpm: bpm >= 30 && bpm <= 250 ? bpm : 0, notes: String(s.notes || "").slice(0, 300),
               A: s.A || "", B: s.B || "", C: s.C || "" };
    });
    d.current = Math.max(-1, Math.min(d.songs.length - 1, Number(o.current) >= -1 ? Number(o.current) : -1));
    return d;
  }

  function load() {
    return CR.native("memLoad", { name: "setlist" }).then(function (txt) {
      loaded = true;
      if (txt) try { data = clean(JSON.parse(txt)); } catch (e) { CR.toast("A setlist salva estava com problema e não foi lida.", true); }
    }).catch(function () { loaded = true; });
  }
  function persist() {
    return CR.native("memSave", { name: "setlist", data: JSON.stringify(data, null, 1) }).catch(function (e) { CR.toast(e.message, true); });
  }

  function song(i) { return data.songs[i] || null; }
  function meta(s) {
    var parts = [];
    if (s.key) parts.push("Tom " + s.key);
    if (s.bpm) parts.push(s.bpm + " BPM");
    return parts.join(" · ");
  }
  function soundName(ref) {
    if (!ref) return "mantém";
    var m = CR.Memory.byRef(ref);
    return m ? m.name : "memória apagada";
  }
  function chips(s) {
    return '<span class="abc">' + LETTERS.map(function (L, p) {
      var ref = s[L], m = ref ? CR.Memory.byRef(ref) : null;
      return '<span class="abc-chip' + (ref ? "" : " keep") + (ref && !m ? " missing" : "") + '" style="--led:var(--led-' + CR.MODULES[p].color + ')">' +
        "<b>" + L + "</b><span>" + CR.esc(soundName(ref)) + "</span></span>";
    }).join("") + "</span>";
  }

  /* ================================================================ carregar música */
  var busy = false;
  async function loadSong(i, force) {
    var s = song(i);
    if (!s || busy) return;
    if (!CR.S.presets) { CR.toast("Conecte a pedaleira primeiro", true); return; }
    if (CR.S.locked && !force) { CR.toast("Controles travados. Segure o cadeado para destravar."); return; }
    busy = true;
    CR.busy(true, "Carregando: " + s.name);
    var missing = [], first = -1;
    try {
      CR.Live.release();
      for (var p = 0; p < 3; p++) {
        var ref = s[LETTERS[p]];
        if (!ref) continue;
        var m = CR.Memory.byRef(ref);
        if (!m) { missing.push(LETTERS[p]); continue; }
        await CR.applyValues(p, m.values, { force: force });
        if (first < 0) first = p;
      }
      data.current = i;
      persist();
      if (first >= 0) { CR.S.preset = first; CR.emit("preset", first); }
      CR.haptic();
      CR.toast(s.name + (missing.length ? ". Atenção: memória apagada em " + missing.join(", ") + "." : " carregada"), !!missing.length);
    } catch (e) { CR.toast(e.message, true); }
    finally { busy = false; CR.busy(false); render(); }
  }
  function next(force) {
    if (!data.songs.length) { CR.toast("A setlist está vazia. Adicione músicas na aba Culto."); return; }
    if (data.current >= data.songs.length - 1) { CR.toast("Fim da setlist"); return; }
    loadSong(data.current + 1, force);
  }
  function prev(force) {
    if (data.current <= 0) { CR.toast("Esta é a primeira música"); return; }
    loadSong(data.current - 1, force);
  }

  /* ================================================================ desenho */
  function nowHtml() {
    var n = data.songs.length, s = song(data.current), nx = song(data.current + 1);
    if (!n) {
      return '<section class="song-now empty"><p class="song-pos">Setlist vazia</p><h2>Monte o culto de hoje</h2>' +
        "<p>Adicione as músicas na ordem. Cada uma carrega os sons de A, B e C de uma vez, com um toque ou com o pedal Bluetooth.</p>" +
        '<button class="btn primary big" type="button" data-add>' + CR.icon("plus") + "<span>Adicionar música</span></button></section>";
    }
    if (!s) {
      return '<section class="song-now"><p class="song-pos">' + n + " música" + (n > 1 ? "s" : "") + ' na setlist</p><h2>Pronto para começar</h2>' +
        "<p>Toque em Próxima para carregar a primeira: <b>" + CR.esc(data.songs[0].name) + "</b>.</p>" + navHtml() + "</section>";
    }
    var beat = s.bpm ? (60 / s.bpm).toFixed(3) + "s" : "";
    return '<section class="song-now"><div class="song-pos-row"><p class="song-pos">Música ' + (data.current + 1) + " de " + n + "</p>" +
      (s.bpm ? '<button type="button" class="pulse' + (pulseOn ? " on" : "") + '" data-pulse aria-pressed="' + pulseOn + '" aria-label="Pulso visual no tempo" style="--beat:' + beat + '"><i></i><span>' + s.bpm + "</span></button>" : "") +
      "</div><h2>" + CR.esc(s.name) + "</h2>" + (meta(s) ? '<p class="song-meta">' + CR.esc(meta(s)) + "</p>" : "") +
      chips(s) + (s.notes ? '<p class="song-notes">' + CR.esc(s.notes) + "</p>" : "") +
      '<p class="song-next">' + (nx ? "Depois: <b>" + CR.esc(nx.name) + "</b>" : "Última música") + "</p>" + navHtml() + "</section>";
  }
  function navHtml() {
    var dis = CR.S.presets ? "" : " disabled";
    return '<div class="song-nav"><button type="button" class="nav-big" data-prev' + dis + (data.current <= 0 ? " disabled" : "") + ">" + CR.icon("prev") + "<span>Anterior</span></button>" +
      '<button type="button" class="nav-big primary" data-next' + dis + (data.current >= data.songs.length - 1 ? " disabled" : "") + "><span>Próxima</span>" + CR.icon("next") + "</button></div>";
  }

  function listHtml() {
    if (!data.songs.length) return "";
    return '<ol class="song-list">' + data.songs.map(function (s, i) {
      return '<li class="song-item' + (i === data.current ? " current" : "") + '"><span class="song-n">' + (i + 1) + "</span>" +
        '<div class="song-info"><b>' + CR.esc(s.name) + "</b>" + (meta(s) ? "<small>" + CR.esc(meta(s)) + "</small>" : "") + chips(s) + "</div>" +
        '<div class="song-btns"><button class="btn" type="button" data-load="' + i + '"' + (CR.S.presets ? "" : " disabled") + ">Carregar</button>" +
        '<button class="icon-btn" type="button" data-edit="' + i + '" aria-label="Editar ' + CR.esc(s.name) + '">' + CR.icon("more") + "</button></div></li>";
    }).join("") + "</ol>";
  }

  function render() {
    var view = document.getElementById("view-culto");
    if (!view || document.getElementById("app").dataset.view !== "culto") return;
    if (!loaded || !CR.Memory.ready()) {
      view.innerHTML = '<div class="page"><div class="state-card"><div class="spinner"></div><h2>Abrindo a setlist</h2></div></div>';
      Promise.all([loaded ? 0 : load(), CR.Memory.ready() ? 0 : CR.Memory.init()]).then(render);
      return;
    }
    var y = view.scrollTop;
    view.innerHTML = '<div class="page culto-page">' +
      (CR.S.presets ? "" : '<p class="mem-warn">Conecte a pedaleira para carregar músicas e usar as ações ao vivo. A setlist pode ser montada mesmo sem ela.</p>') +
      '<div class="culto-top">' + nowHtml() +
        '<section class="live-wrap"><h2 class="mem-sec">Ao vivo</h2><p class="mem-sub">Age nos 3 presets, então funciona em qualquer footswitch.</p>' + CR.Live.padHtml() + "</section></div>" +
      '<article class="card"><header class="card-head">' + CR.icon("culto") + '<div><h2 id="slName">' + CR.esc(data.name) + "</h2><p>" + data.songs.length + " de " + MAX_SONGS + " músicas</p></div>" +
        '<button class="icon-btn" type="button" data-rename aria-label="Renomear setlist">' + CR.icon("edit") + "</button></header>" +
        listHtml() +
        '<div class="row2"><button class="btn big" type="button" data-add' + (data.songs.length >= MAX_SONGS ? " disabled" : "") + ">" + CR.icon("plus") + "<span>Adicionar música</span></button>" +
        '<button class="btn big danger" type="button" data-clear' + (data.songs.length ? "" : " disabled") + ">" + CR.icon("trash") + "<span>Limpar setlist</span></button></div></article>" +
      '<article class="card"><header class="card-head">' + CR.icon("boost") + "<div><h2>Ajustes do ao vivo</h2><p>Valem para os botões e para o pedal.</p></div></header>" + CR.Live.settingsHtml() + "</article>" +
      pedalHtml() + "</div>";
    view.scrollTop = y;

    view.querySelectorAll("[data-add]").forEach(function (b) { b.onclick = function () { editDialog(-1); }; });
    view.querySelectorAll("[data-edit]").forEach(function (b) { b.onclick = function () { editDialog(Number(b.dataset.edit)); }; });
    view.querySelectorAll("[data-load]").forEach(function (b) { b.onclick = function () { loadSong(Number(b.dataset.load)); }; });
    var bp = $("[data-prev]", view), bn = $("[data-next]", view);
    if (bp) bp.onclick = function () { prev(); };
    if (bn) bn.onclick = function () { next(); };
    var pl = $("[data-pulse]", view);
    if (pl) pl.onclick = function () { pulseOn = !pulseOn; CR.store.set("cr.pulse", pulseOn); pl.classList.toggle("on", pulseOn); pl.setAttribute("aria-pressed", String(pulseOn)); };
    $("[data-rename]", view).onclick = renameDialog;
    $("[data-clear]", view).onclick = async function () {
      if (!(await CR.confirm("Limpar setlist", "Apagar todas as " + data.songs.length + " músicas da setlist? As memórias não são apagadas.", "Limpar"))) return;
      data.songs = []; data.current = -1; persist(); render();
    };
    CR.Live.bind(view);
    CR.Live.bindSettings(view);
    bindPedal(view);
  }

  /* ================================================================ editar música */
  function keyOptions(cur) {
    var opts = [["", "Sem tom"]];
    KEYS.forEach(function (k) { opts.push([k, k]); });
    KEYS.forEach(function (k) { opts.push([k + "m", k + "m (menor)"]); });
    return opts.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === cur ? " selected" : "") + ">" + o[1] + "</option>"; }).join("");
  }
  function soundOptions(cur) {
    var list = CR.Memory.options(), html = '<option value="">Manter como está</option>', found = !cur;
    list.forEach(function (o) { if (o.ref === cur) found = true; html += '<option value="' + o.ref + '"' + (o.ref === cur ? " selected" : "") + ">" + CR.esc(o.name) + "</option>"; });
    if (!found) html += '<option value="' + CR.esc(cur) + '" selected>Memória apagada</option>';
    return html;
  }

  function editDialog(i) {
    var s = i >= 0 ? data.songs[i] : { name: "", key: "", bpm: 0, notes: "", A: "", B: "", C: "" };
    var mems = CR.Memory.options().length > 3;
    CR.dialog("white", i >= 0 ? "Editar música" : "Nova música", i >= 0 ? "Posição " + (i + 1) + " na setlist" : "Entra no fim da setlist",
      '<label class="field"><span class="field-head"><span>Nome da música</span></span><input class="text-input" id="sgName" maxlength="60" autocomplete="off" value="' + CR.esc(s.name) + '" placeholder="Ex.: Bondade de Deus"></label>' +
      '<div class="row2"><label class="field"><span class="field-head"><span>Tom</span></span><select class="text-input" id="sgKey">' + keyOptions(s.key) + "</select></label>" +
      '<label class="field"><span class="field-head"><span>BPM</span></span><input class="text-input" id="sgBpm" type="number" inputmode="numeric" min="30" max="250" value="' + (s.bpm || "") + '" placeholder="Ex.: 72"></label></div>' +
      (mems ? "" : '<p class="hint">Dica: guarde seus sons na aba Memórias para poder escolher aqui. Por enquanto só aparecem os de fábrica.</p>') +
      LETTERS.map(function (L, p) {
        return '<label class="field abc-field" style="--led:var(--led-' + CR.MODULES[p].color + ')"><span class="field-head"><span><i class="led on"></i>Footswitch ' + L + "</span></span>" +
          '<select class="text-input" id="sg' + L + '">' + soundOptions(s[L]) + "</select></label>";
      }).join("") +
      '<label class="field"><span class="field-head"><span>Anotações</span></span><textarea class="text-input" id="sgNotes" rows="2" maxlength="300" placeholder="Ex.: solo no 2º refrão, usar B">' + CR.esc(s.notes) + "</textarea></label>" +
      (i >= 0 ? '<div class="mem-menu">' +
        '<button class="btn big" type="button" data-m="up"' + (i === 0 ? " disabled" : "") + ">" + CR.icon("up") + "<span>Subir</span></button>" +
        '<button class="btn big" type="button" data-m="down"' + (i === data.songs.length - 1 ? " disabled" : "") + ">" + CR.icon("down") + "<span>Descer</span></button>" +
        '<button class="btn big danger" type="button" data-m="delete">' + CR.icon("trash") + "<span>Tirar da setlist</span></button>" +
        '<button class="btn big" type="button" data-m="copy">' + CR.icon("copy") + "<span>Duplicar</span></button></div>" : "") +
      '<div class="dialog-actions"><button class="btn big" type="button" data-no>Cancelar</button>' +
      '<button class="btn primary big" type="button" data-yes>' + CR.icon("check") + "<span>Salvar</span></button></div>");
    var d = document.getElementById("dialog");
    if (i < 0) setTimeout(function () { $("#sgName").focus(); }, 60);
    $("[data-no]", d).onclick = function () { d.hidden = true; };
    $("[data-yes]", d).onclick = function () {
      var name = $("#sgName").value.trim();
      if (!name) { CR.toast("Dê um nome para a música", true); $("#sgName").focus(); return; }
      var bpm = Math.round(Number($("#sgBpm").value) || 0);
      var o = { id: s.id || newId(), name: name.slice(0, 60), key: $("#sgKey").value, bpm: bpm >= 30 && bpm <= 250 ? bpm : 0,
                notes: $("#sgNotes").value.trim().slice(0, 300), A: $("#sgA").value, B: $("#sgB").value, C: $("#sgC").value };
      if (i >= 0) data.songs[i] = o; else data.songs.push(o);
      d.hidden = true;
      persist(); render();
      CR.toast(i >= 0 ? "Música atualizada" : "Música adicionada");
    };
    d.querySelectorAll("[data-m]").forEach(function (b) {
      b.onclick = async function () {
        var m = b.dataset.m;
        if (m === "delete") {
          d.hidden = true;
          if (!(await CR.confirm("Tirar da setlist", 'Tirar "' + CR.esc(s.name) + '" da setlist?', "Tirar"))) return;
          data.songs.splice(i, 1);
          if (data.current >= i) data.current = Math.max(-1, data.current - 1);
          persist(); render(); return;
        }
        if (m === "copy") {
          if (data.songs.length >= MAX_SONGS) { CR.toast("A setlist já tem " + MAX_SONGS + " músicas", true); return; }
          var c = JSON.parse(JSON.stringify(s)); c.id = newId();
          data.songs.splice(i + 1, 0, c);
          d.hidden = true; persist(); render(); return;
        }
        var j = i + (m === "up" ? -1 : 1), t = data.songs[j];
        data.songs[j] = data.songs[i]; data.songs[i] = t;
        if (data.current === i) data.current = j; else if (data.current === j) data.current = i;
        persist(); render(); editDialog(j);
      };
    });
  }

  function renameDialog() {
    CR.dialog("white", "Nome da setlist", "", '<input class="text-input" id="slInput" maxlength="40" autocomplete="off" value="' + CR.esc(data.name) + '">' +
      '<div class="dialog-actions"><button class="btn big" type="button" data-no>Cancelar</button><button class="btn primary big" type="button" data-yes>Salvar</button></div>');
    var d = document.getElementById("dialog"), inp = $("#slInput");
    setTimeout(function () { inp.focus(); inp.select(); }, 60);
    function done() { data.name = inp.value.trim().slice(0, 40) || "Culto"; d.hidden = true; persist(); render(); }
    $("[data-yes]", d).onclick = done;
    $("[data-no]", d).onclick = function () { d.hidden = true; };
    inp.onkeydown = function (e) { if (e.key === "Enter") done(); };
  }

  /* ================================================================ pedal Bluetooth e botões de volume
     Viradores de página Bluetooth mandam setas ou Page Up / Page Down; controles de selfie mandam
     Volume +. Pedal da direita = "seguinte", pedal da esquerda = "anterior". Funciona com a trava ligada. */
  var NEXT_KEYS = ["ArrowRight", "ArrowDown", "PageDown", "Enter", " ", "VolumeUp", "MediaTrackNext"];
  var PREV_KEYS = ["ArrowLeft", "ArrowUp", "PageUp", "Backspace", "VolumeDown", "MediaTrackPrevious"];
  var MODES = [["songs", "Músicas"], ["live", "Boost e Mudo"], ["swell", "Swell e Fade"]];

  function pedalHtml() {
    var mode = CR.prefs.pedal || "songs";
    var what = { songs: "Direita: próxima música. Esquerda: música anterior.", live: "Direita: Boost de solo. Esquerda: Mudo.", swell: "Direita: Swell. Esquerda: Fade out." }[mode];
    return '<article class="card"><header class="card-head">' + CR.icon("pedalbt") + "<div><h2>Pedal Bluetooth</h2><p>Use um virador de páginas Bluetooth no pé.</p></div></header>" +
      '<div class="seg" role="group" data-pedal>' + MODES.map(function (m) {
        return '<button type="button" data-v="' + m[0] + '" aria-pressed="' + (m[0] === mode) + '">' + m[1] + "</button>"; }).join("") + "</div>" +
      '<p class="hint" id="pedalWhat">' + what + "</p>" +
      '<div class="set-row"><div><b>Botões de volume como pedal</b><span>Os botões de volume do celular (e controles de selfie Bluetooth) passam a funcionar como o pedal. Volume + é a direita.</span></div><span id="swVolKeys"></span></div>' +
      '<p class="pedal-test">Teste: aperte o pedal. Última tecla: <b id="lastKey">' + (lastKey || "nenhuma") + "</b></p></article>";
  }
  function bindPedal(view) {
    view.querySelectorAll("[data-pedal] button").forEach(function (b) {
      b.onclick = function () { CR.prefs.pedal = b.dataset.v; CR.savePrefs(); render(); };
    });
    var sw = CR.makeSwitch(!!CR.prefs.volumeKeys, "Botões de volume como pedal", function () {
      CR.prefs.volumeKeys = !CR.prefs.volumeKeys; CR.savePrefs(); sw.set(CR.prefs.volumeKeys);
      CR.native("setVolumeKeys", { on: CR.prefs.volumeKeys }).catch(function () {});
    });
    $("#swVolKeys", view).appendChild(sw);
  }

  function onPedal(dir, keyName) {
    lastKey = keyName;
    var lk = document.getElementById("lastKey");
    if (lk) lk.textContent = keyName + (dir > 0 ? " (direita)" : " (esquerda)");
    var mode = CR.prefs.pedal || "songs";
    if (mode === "songs") { if (dir > 0) next(true); else prev(true); }
    else if (mode === "live") { if (dir > 0) CR.Live.toggleBoost(true); else CR.Live.toggleMute(true); }
    else { if (dir > 0) CR.Live.swell(true); else CR.Live.fadeOut(true); }
  }

  document.addEventListener("keydown", function (e) {
    var t = e.target, tag = t && t.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return;
    if (!document.getElementById("dialog").hidden || !document.getElementById("logPanel").hidden) return;
    var dir = NEXT_KEYS.indexOf(e.key) >= 0 ? 1 : PREV_KEYS.indexOf(e.key) >= 0 ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat) return;
    onPedal(dir, e.key === " " ? "Espaço" : e.key);
  }, true);
  /* Botões de volume chegam pelo Java (MainActivity.dispatchKeyEvent) */
  window.cubeKey = function (name) { onPedal(name === "VolumeUp" ? 1 : -1, name === "VolumeUp" ? "Volume +" : "Volume -"); };

  CR.on("memories", render);
  CR.on("status", function () { setTimeout(render, 0); });

  return { render: render, data: function () { return data; }, next: next, prev: prev,
           importData: function (o) { data = clean(o); persist(); render(); },
           init: function () { load(); if (CR.prefs.volumeKeys) CR.native("setVolumeKeys", { on: true }).catch(function () {}); } };
})();
