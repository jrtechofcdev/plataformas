/* Cube Remote · Copyright (c) 2026 José Renato · Jr_Tech_OFC. Todos os direitos reservados.
   Equalizador dentro da pedaleira.

   O IR CAB é o último bloco antes da saída. O EQ é misturado no IR: slot = IR original ⊗ curva.
   Dois modos (Ajustes > Equalizador):
   - "preset": cada preset A, B, C tem a sua curva. Os slots 7, 8 e 9 (posições do IR CAB) ficam
     reservados para A, B e C e recebem "gabinete base ⊗ EQ". O byte IR CAB do preset aponta para o
     slot reservado e o app guarda qual é o gabinete base (pode ser "sem gabinete": só o EQ).
   - "cab": cada gabinete (slot 2 a 9) tem a sua curva. Slot = original ⊗ curva daquele slot.
   Os IRs originais são lidos uma vez e guardados (eqorig.json): o EQ é sempre calculado a partir
   deles, nunca em cima de um IR já equalizado. Prévia na hora pela RAM (irPreview) e gravação
   automática na flash (irSave) 2,5 s depois do último ajuste. */
"use strict";
var CR = window.CR || (window.CR = {});

CR.EQ = (function () {
  var BANDS = [80, 125, 250, 500, 800, 1200, 2000, 3200, 5000, 8000];
  var BAND_LABEL = ["80", "125", "250", "500", "800", "1.2K", "2K", "3.2K", "5K", "8K"];
  var Q = 1.4, SHELF_DB = 9, SAVE_DELAY = 2500;
  var RESERVED = [5, 6, 7];            // slots (índice 0 a 7) reservados para A, B, C = posições 7, 8, 9 do IR CAB
  var PRESETS = [
    ["Plana", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    ["Igreja (menos embolado)", [-6, -4, -2, 0, 0, 0, 0, 1, 0, 0]],
    ["Mais presença", [0, 0, 0, 0, 0, 1, 2, 3, 2, 0]],
    ["Menos estridente", [0, 0, 0, 0, 0, 0, 0, -2, -4, -6]],
    ["Mais corpo", [2, 3, 2, 0, 0, 0, 0, 0, 0, 0]],
    ["Solo cantado", [-2, 0, 0, 1, 2, 3, 2, 0, -1, -2]],
    ["Violão", [-4, -3, -2, 0, -2, 0, 1, 2, 3, 3]],
  ];

  function flat() { return { on: false, bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], pre: 0, bass: 0, treble: 0 }; }
  var data = { kind: "eq", version: 1, mode: "preset", preset: [flat(), flat(), flat()], base: [null, null, null],
               cab: [flat(), flat(), flat(), flat(), flat(), flat(), flat(), flat()], user: [], applied: {} };
  var orig = null;                     // { slots: { "0": { samples, distance } ... }, date }
  var loaded = false, status = "idle", saveTimer = null, saving = false;

  /* ================================================================ arquivos */
  function load() {
    return Promise.all([CR.native("memLoad", { name: "eq" }), CR.native("memLoad", { name: "eqorig" })]).then(function (r) {
      try { var o = r[0] ? JSON.parse(r[0]) : null; if (o && o.kind === "eq") data = Object.assign(data, o); } catch (e) {}
      try { var g = r[1] ? JSON.parse(r[1]) : null; if (g && g.slots) orig = g; } catch (e) {}
      loaded = true;
    }).catch(function () { loaded = true; });
  }
  function persist() { return CR.native("memSave", { name: "eq", data: JSON.stringify(data) }).catch(function () {}); }
  function persistOrig() { return CR.native("memSave", { name: "eqorig", data: JSON.stringify(orig) }).catch(function () {}); }

  /* ================================================================ cálculo */
  function isFlat(c) { return !c.pre && !c.bass && !c.treble && c.bands.every(function (g) { return !g; }); }
  function filters(c) {
    var f = [];
    c.bands.forEach(function (g, i) { if (g) f.push(CR.DSP.biquad("peak", BANDS[i], Q, g)); });
    if (c.bass) f.push(CR.DSP.biquad("lshelf", 120, 0.707, c.bass / 100 * SHELF_DB));
    if (c.treble) f.push(CR.DSP.biquad("hshelf", 4000, 0.707, c.treble / 100 * SHELF_DB));
    return f;
  }
  /* IR final (512 amostras) = base ⊗ curva. */
  function render(base, c) {
    if (isFlat(c)) return base.slice(0, 512);
    var x = base.slice(0, 512);
    while (x.length < CR.DSP.PAD) x.push(0);
    filters(c).forEach(function (k) { x = CR.DSP.filter(x, k); });
    var g = Math.pow(10, c.pre / 20);
    return CR.DSP.fit512(x).map(function (v) { return Math.round(v * g * 1e6) / 1e6; });
  }
  /* Curva pedida (dB) nos pontos de CR.DSP.FREQS. */
  function target(c) {
    var fs = filters(c);
    return CR.DSP.FREQS.map(function (f) { return fs.reduce(function (a, k) { return a + CR.DSP.gainAt(k, f); }, c.pre); });
  }
  /* Curva que realmente sai (resposta do IR final menos a do IR base). */
  function actual(base, c) {
    var a = CR.DSP.response(render(base, c)), b = CR.DSP.response(base);
    return a.map(function (v, i) { return v - b[i]; });
  }

  /* ================================================================ modos e alvos */
  function baseSamples(cabVal) {          // cabVal: valor do IR CAB (0 = sem gabinete, 1 a 8 = slots 0 a 7)
    if (!cabVal) return CR.DSP.impulse();
    var o = orig && orig.slots[cabVal - 1];
    return o ? o.samples : null;
  }
  function baseDistance(slot) { var o = orig && orig.slots[slot]; return o ? o.distance : 0.5; }

  /* O que cada slot deveria ter agora: { key, samples, distance } (key "orig" = original). */
  function desired(slot) {
    if (data.mode === "preset") {
      var p = RESERVED.indexOf(slot);
      if (p >= 0 && data.preset[p].on) {
        var b = data.base[p] || 0, bs = baseSamples(b);
        if (!bs) return null;
        return { key: "p" + p + ":" + b + ":" + JSON.stringify(curveOnly(data.preset[p])), samples: render(bs, data.preset[p]), distance: baseDistance(b ? b - 1 : slot) };
      }
    } else if (data.cab[slot].on && !isFlat(data.cab[slot])) {
      var os = baseSamples(slot + 1);
      if (!os) return null;
      return { key: "c" + slot + ":" + JSON.stringify(curveOnly(data.cab[slot])), samples: render(os, data.cab[slot]), distance: baseDistance(slot) };
    }
    return { key: "orig" };
  }
  function curveOnly(c) { return { b: c.bands, p: c.pre, l: c.bass, h: c.treble }; }

  /* Valor do IR CAB que o preset deve ter na pedaleira (modo preset com EQ ligado = slot reservado). */
  function reservedValue(p) { return RESERVED[p] + 1; }
  function routed(p) { return data.mode === "preset" && data.preset[p].on; }

  /* Gancho de CR.applyValues: ao carregar um som num preset com EQ, guarda o gabinete do som como base. */
  function routeValues(p, values) {
    if (!routed(p)) return values;
    var v = values.slice();
    if (v[9] !== reservedValue(p)) { data.base[p] = v[9]; persist(); schedule(); }
    v[9] = reservedValue(p);
    return v;
  }
  /* Valores "de verdade" do preset (com o gabinete base no lugar do slot reservado). */
  function realValues(p) {
    var v = CR.S.presets[p].slice();
    if (routed(p) && v[9] === reservedValue(p) && data.base[p] !== null) v[9] = data.base[p];
    return v;
  }
  /* O que a tela mostra no IR CAB. */
  function cabFor(p, raw) { return routed(p) && raw === reservedValue(p) && data.base[p] !== null ? data.base[p] : raw; }
  function setBase(p, v) {
    if (v === reservedValue(p) || v === data.base[p]) return false;
    data.base[p] = v; persist(); preview(p); schedule();
    CR.emit("changed", { offset: 9, value: v, preset: p, live: true });
    return true;
  }

  /* ================================================================ originais */
  function hasOriginals() { return !!(orig && [0, 1, 2, 3, 4, 5, 6, 7].every(function (s) { return orig.slots[s]; })); }
  async function ensureOriginals() {
    if (hasOriginals()) return true;
    if (!CR.S.connected) return false;
    if (CR.S.status.irWritable === false) throw new Error("Este modelo não libera a gravação de IR: o equalizador fica bloqueado.");
    orig = orig || { slots: {}, date: new Date().toISOString().slice(0, 10) };
    try {
      for (var s = 0; s < 8; s++) {
        if (orig.slots[s]) continue;
        CR.busy(true, "Guardando os gabinetes originais (" + (s + 1) + " de 8)");
        var r = await CR.native("irRead", { slot: s });
        orig.slots[s] = { samples: r.samples, distance: r.distance };
      }
      await persistOrig();
    } finally { CR.busy(false); }
    return true;
  }
  function original(slot) { return orig && orig.slots[slot] ? orig.slots[slot] : null; }
  /* O Editor de IR gravou um IR novo no slot: ele vira o original e o EQ é reaplicado por cima. */
  function originalWritten(slot, samples, distance) {
    if (!orig) return;
    orig.slots[slot] = { samples: samples.slice(), distance: distance };
    data.applied[slot] = "orig";
    persistOrig(); persist(); schedule();
  }

  /* ================================================================ prévia e gravação */
  function setStatus(s) { status = s; CR.emit("eqstatus", s); }

  var pv = { sending: false, again: null };
  /* Prévia na RAM da pedaleira: no máximo um envio por vez, o último ajuste sempre chega. */
  async function preview(target) {
    if (!CR.S.connected || !hasOriginals()) return;
    var d;
    if (data.mode === "preset") {
      var p = target;
      d = data.preset[p].on ? desired(RESERVED[p]) : null;
      if (!d || d.key === "orig") { var b = data.base[p]; d = { samples: baseSamples(b === null ? CR.S.presets[p][9] : b) || CR.DSP.impulse(), distance: 0.5 }; }
    } else {
      d = desired(target);
      if (!d || d.key === "orig") d = { samples: original(target).samples, distance: original(target).distance };
    }
    if (pv.sending) { pv.again = target; return; }
    pv.sending = true;
    try { await CR.native("irPreview", { samples: d.samples, distance: Math.round(d.distance * 100) }); }
    catch (e) { CR.toast("Prévia do EQ: " + e.message, true); }
    pv.sending = false;
    if (pv.again !== null) { var t = pv.again; pv.again = null; preview(t); }
  }

  function pending() {
    if (!hasOriginals()) return [];
    return [0, 1, 2, 3, 4, 5, 6, 7].filter(function (s) { var d = desired(s); return d && d.key !== (data.applied[s] || "orig"); });
  }
  function needsAny() { return data.preset.some(function (c) { return c.on; }) || data.cab.some(function (c) { return c.on && !isFlat(c); }); }

  function schedule() {
    clearTimeout(saveTimer);
    if (!CR.S.connected) { setStatus(needsAny() ? "offline" : "idle"); return; }
    setStatus("pending");
    saveTimer = setTimeout(sync, SAVE_DELAY);
  }

  /* Grava na flash os slots que estão diferentes do que deveriam ter. */
  async function sync() {
    clearTimeout(saveTimer);
    if (saving) { schedule(); return; }
    if (!CR.S.connected) { setStatus(needsAny() ? "offline" : "idle"); return; }
    try {
      if (!hasOriginals()) { if (!needsAny()) { setStatus("idle"); return; } await ensureOriginals(); }
      var list = pending();
      if (!list.length) { setStatus(needsAny() ? "saved" : "idle"); return; }
      saving = true; setStatus("saving");
      for (var i = 0; i < list.length; i++) {
        var s = list[i], d = desired(s);
        var smp = d.key === "orig" ? original(s).samples : d.samples, dist = d.key === "orig" ? original(s).distance : d.distance;
        await CR.native("irSave", { slot: s, samples: smp, distance: Math.round(dist * 100) });
        data.applied[s] = d.key;
        await persist();
      }
      saving = false;
      setStatus(needsAny() ? "saved" : "idle");
    } catch (e) {
      saving = false; setStatus("error");
      CR.toast("Equalizador: " + e.message, true);
    }
  }

  /* ================================================================ ações da tela */
  function curve(target) { return data.mode === "preset" ? data.preset[target] : data.cab[target]; }
  function changed(target) { persist(); preview(target); schedule(); CR.emit("eq", target); }

  /* Liga ou desliga o EQ do alvo (preset 0 a 2, ou slot 0 a 7). */
  async function setOn(target, on) {
    if (on && CR.S.connected) {
      try { await ensureOriginals(); } catch (e) { CR.toast(e.message, true); return false; }
    }
    var c = curve(target);
    c.on = on;
    if (data.mode === "preset") {
      var p = target, raw = CR.S.presets[p][9];
      if (on) {
        if (raw !== reservedValue(p) || data.base[p] === null) data.base[p] = raw === reservedValue(p) ? 0 : raw;
        CR.setAt(p, 9, reservedValue(p), { force: true });
      } else if (data.base[p] !== null) CR.setAt(p, 9, data.base[p], { force: true });
    }
    changed(target);
    CR.haptic("detent");
    return true;
  }

  /* Troca de modo: desfaz o direcionamento do modo antigo e grava o que precisar. */
  function setMode(mode) {
    if (mode === data.mode) return;
    if (data.mode === "preset") [0, 1, 2].forEach(function (p) { if (data.preset[p].on && data.base[p] !== null) CR.setAt(p, 9, data.base[p], { force: true }); });
    data.mode = mode;
    if (mode === "preset") [0, 1, 2].forEach(function (p) { if (data.preset[p].on) { data.base[p] = CR.S.presets[p][9]; CR.setAt(p, 9, reservedValue(p), { force: true }); } });
    persist(); schedule(); CR.emit("eq", null);
  }

  /* Desliga tudo e devolve os gabinetes originais aos slots. */
  function restoreAll() {
    if (data.mode === "preset") [0, 1, 2].forEach(function (p) { if (data.preset[p].on && data.base[p] !== null) CR.setAt(p, 9, data.base[p], { force: true }); });
    data.preset.forEach(function (c) { c.on = false; });
    data.cab.forEach(function (c) { c.on = false; });
    persist(); schedule(); CR.emit("eq", null);
  }

  /* Alvo que a tela do EQ abre: preset em edição, ou o gabinete dele no modo por gabinete. */
  function defaultTarget() {
    if (data.mode === "preset") return CR.S.preset;
    var v = CR.val(CR.byKey.irCab);
    return v ? v - 1 : null;
  }
  function activeFor(p) {
    if (data.mode === "preset") return data.preset[p].on;
    var v = cabFor(p, CR.S.presets[p][9]);
    return !!(v && data.cab[v - 1].on && !isFlat(data.cab[v - 1]));
  }

  CR.on("status", function (st) {
    if (st.state === "on" && st.presets && loaded && needsAny()) setTimeout(sync, 1500);
    else if (st.state !== "on") setStatus(needsAny() ? "offline" : "idle");
  });

  return {
    BANDS: BANDS, BAND_LABEL: BAND_LABEL, PRESETS: PRESETS, RESERVED: RESERVED,
    init: function () { return load().then(function () { CR.emit("eq", null); }); },
    data: function () { return data; }, mode: function () { return data.mode; }, status: function () { return status; },
    curve: curve, changed: changed, setOn: setOn, setMode: setMode, restoreAll: restoreAll, sync: sync,
    defaultTarget: defaultTarget, activeFor: activeFor, isFlat: isFlat, target: target, actual: actual, baseSamples: baseSamples,
    routeValues: routeValues, realValues: realValues, cabFor: cabFor, setBase: setBase, routed: routed, reservedValue: reservedValue,
    original: original, originalWritten: originalWritten, hasOriginals: hasOriginals, ensureOriginals: ensureOriginals,
    preview: preview, flat: flat, _render: render,
  };
})();
