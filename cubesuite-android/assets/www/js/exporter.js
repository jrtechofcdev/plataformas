/* Cube Remote · Copyright (c) 2026 José Renato · Jr_Tech_OFC. Todos os direitos reservados.
   Exportar presets: um preset vira um .json; vários viram um .zip (um .json por preset, em pastas
   por categoria). É o mesmo formato que a Biblioteca importa, então o arquivo pode ser importado de
   novo neste ou em outro celular. Salva na pasta Download ou envia (WhatsApp, Drive, e-mail). */
"use strict";
var CR = window.CR || (window.CR = {});

CR.Exporter = (function () {
  var TYPES_K = [["TYPE", 0], ["GAIN", 1], ["TONE", 2], ["REVERB", 3], ["FB", 4], ["VOLUME", 5], ["TIME", 6], ["MIX", 7], ["MOD", 8], ["IR CAB", 9]];
  var FOLDER = { worship: "01 Worship e igreja", clean: "02 Limpo", drive: "03 Crunch e overdrive", dist: "04 Distorcao e peso",
                 solo: "05 Solo", ambient: "06 Ambiente e efeitos", acoustic: "07 Violao" };

  /* Um preset no formato de arquivo do Cube Remote (o mesmo do zip da biblioteca). */
  function presetJson(p) {
    var v = CR.Memory.clean(p.values).values, knobs = {};
    TYPES_K.forEach(function (k) { knobs[k[0]] = v[k[1]]; });
    var cat = p.category || CR.Library._categorize(p.name || "", p.description || "", v);
    return {
      format: "cube-remote-preset", version: 1,
      name: p.name || "Sem nome", author: p.author || "", description: p.description || "",
      category: cat, model: "Cube Baby", knobs: knobs, values: v,
      bytes_hex: v.map(function (x) { return (x < 16 ? "0" : "") + x.toString(16).toUpperCase(); }).join(" "),
      amp: (v[0] + 1) + " " + CR.TYPES[v[0]].name, cab: (v[9] + 1) + " " + CR.CABS[v[9]].name,
      notes: p.notes || [], source: p.source || { app: "Cube Remote by Jr_Tech_OFC" },
      exported: new Date().toISOString().slice(0, 10),
    };
  }

  function safe(s) {
    return String(s || "preset").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 ._()-]+/g, "").replace(/\s+/g, " ").trim().slice(0, 60) || "preset";
  }

  /* ---------------------------------------------------------------- zip */
  var CRC = (function () { var t = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t.push(c >>> 0); } return t; })();
  function crc32(u8) { var c = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  async function deflate(u8) {
    if (typeof CompressionStream === "undefined") return null;
    var out = new Blob([u8]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(out).arrayBuffer());
  }
  async function zip(files) {             // files: [{ name, data: Uint8Array }]
    var enc = new TextEncoder(), parts = [], central = [], off = 0, now = new Date();
    var dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    var dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    for (var i = 0; i < files.length; i++) {
      var f = files[i], name = enc.encode(f.name), crc = crc32(f.data);
      var comp = await deflate(f.data), method = 8;
      if (!comp || comp.length >= f.data.length) { comp = f.data; method = 0; }
      var h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, method, true);
      h.setUint16(10, dosTime, true); h.setUint16(12, dosDate, true); h.setUint32(14, crc, true);
      h.setUint32(18, comp.length, true); h.setUint32(22, f.data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, comp);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, method, true);
      c.setUint16(12, dosTime, true); c.setUint16(14, dosDate, true); c.setUint32(16, crc, true); c.setUint32(20, comp.length, true);
      c.setUint32(24, f.data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), name);
      off += 30 + name.length + comp.length;
    }
    var cdSize = central.reduce(function (a, b) { return a + b.length; }, 0);
    var e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, cdSize, true); e.setUint32(16, off, true);
    var all = parts.concat(central, [new Uint8Array(e.buffer)]), total = all.reduce(function (a, b) { return a + b.length; }, 0);
    var out = new Uint8Array(total), p = 0;
    all.forEach(function (b) { out.set(b, p); p += b.length; });
    return out;
  }

  function b64(u8) {
    var s = "";
    for (var i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }

  /* ---------------------------------------------------------------- exportar */
  /* items: [{ name, author, description, category, values, notes, source }]; base: nome do arquivo */
  async function run(items, base) {
    if (!items.length) { CR.toast("Nada para exportar"); return; }
    var share = await ask(items.length);
    if (share === null) return;
    CR.busy(true, items.length === 1 ? "Preparando o preset" : "Montando o pacote com " + items.length + " presets");
    try {
      var enc = new TextEncoder(), name, data, mime;
      var stamp = new Date().toISOString().slice(0, 10);
      if (items.length === 1) {
        name = safe(items[0].name) + ".json";
        data = enc.encode(JSON.stringify(presetJson(items[0]), null, 1));
        mime = "application/json";
      } else {
        var used = {}, files = [{ name: "LEIA-ME.txt", data: enc.encode(readme(items.length).replace(/\n/g, "\r\n")) }];
        items.forEach(function (it, i) {
          var j = presetJson(it), fn = (FOLDER[j.category] || "08 Outros") + "/" + String(i + 1).padStart(3, "0") + " - " + safe(j.name) + ".json";
          while (used[fn]) fn = fn.replace(/\.json$/, "_.json");
          used[fn] = 1;
          files.push({ name: fn, data: enc.encode(JSON.stringify(j, null, 1)) });
        });
        data = await zip(files);
        name = safe(base) + " - " + items.length + " presets - " + stamp + ".zip";
        mime = "application/zip";
      }
      var saved = await CR.native("fileExport", { name: name, b64: b64(data), mime: mime, share: share });
      CR.busy(false);
      if (!share) CR.toast("Salvo na pasta Download: " + saved);
      return { name: saved, bytes: data.length };
    } catch (e) { CR.busy(false); CR.toast("Não consegui exportar: " + e.message, true); }
  }

  function readme(n) {
    return "CUBE REMOTE by Jr_Tech_OFC · PRESETS EXPORTADOS\n\n" + n + " presets da Cube Baby, um arquivo .json por preset, em pastas por categoria.\n" +
      "Cada arquivo tem os 16 bytes que a pedaleira guarda (campo \"values\") e os valores dos knobs.\n\n" +
      "Para usar: no Cube Remote, abra Memórias > Biblioteca > Subir presets e escolha este .zip.\n";
  }

  function ask(n) {
    return new Promise(function (resolve) {
      CR.dialog("green", n === 1 ? "Exportar preset" : "Exportar " + n + " presets",
        n === 1 ? "Um arquivo .json" : "Um arquivo .zip com um .json por preset",
        "<p>O arquivo pode ser importado de novo na Biblioteca, neste ou em outro celular com o Cube Remote.</p>" +
        '<div class="dialog-actions"><button class="btn big" type="button" data-save>' + CR.icon("save") + "<span>Salvar em Download</span></button>" +
        '<button class="btn primary big" type="button" data-share>' + CR.icon("share") + "<span>Enviar</span></button></div>");
      var d = document.getElementById("dialog"), done = false;
      function fin(v) { if (!done) { done = true; d.hidden = true; resolve(v); } }
      d.querySelector("[data-save]").onclick = function () { fin(false); };
      d.querySelector("[data-share]").onclick = function () { fin(true); };
      d.querySelectorAll("[data-close]").forEach(function (b) { b.onclick = function () { fin(null); }; });
    });
  }

  /* Escolher quais (lista com caixas de marcar). list: [{ label, sub, item }] */
  function choose(title, list, base) {
    CR.dialog("green", title, "Marque os que quer exportar",
      '<div class="exp-tools"><button class="btn" type="button" data-all>Marcar todos</button><button class="btn" type="button" data-none>Desmarcar</button></div>' +
      '<div class="exp-list">' + list.map(function (x, i) {
        return '<label class="exp-row"><input type="checkbox" data-i="' + i + '" checked><span><b>' + CR.esc(x.label) + "</b><small>" + CR.esc(x.sub || "") + "</small></span></label>";
      }).join("") + "</div>" +
      '<div class="dialog-actions"><button class="btn big" type="button" data-no>Cancelar</button><button class="btn primary big" type="button" data-go>' + CR.icon("share") + '<span>Exportar <b id="expN">' + list.length + "</b></span></button></div>");
    var d = document.getElementById("dialog");
    function count() { d.querySelector("#expN").textContent = d.querySelectorAll(".exp-list input:checked").length; }
    d.querySelectorAll(".exp-list input").forEach(function (c) { c.onchange = count; });
    d.querySelector("[data-all]").onclick = function () { d.querySelectorAll(".exp-list input").forEach(function (c) { c.checked = true; }); count(); };
    d.querySelector("[data-none]").onclick = function () { d.querySelectorAll(".exp-list input").forEach(function (c) { c.checked = false; }); count(); };
    d.querySelector("[data-no]").onclick = function () { d.hidden = true; };
    d.querySelector("[data-go]").onclick = function () {
      var items = [];
      d.querySelectorAll(".exp-list input:checked").forEach(function (c) { items.push(list[Number(c.dataset.i)].item); });
      if (!items.length) { CR.toast("Marque pelo menos um"); return; }
      d.hidden = true;
      run(items, base);
    };
  }

  return { run: run, choose: choose, presetJson: presetJson, _zip: zip };
})();
