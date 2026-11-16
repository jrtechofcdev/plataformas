/* Cube Remote · Copyright (c) 2026 José Renato · Jr_Tech_OFC. Todos os direitos reservados.
   Modelo: os controles da pedaleira, o estado dos presets, envio, desfazer e preferências. */
"use strict";
var CR = window.CR || (window.CR = {});

/* Modelos de pré-amplificador (knob TYPE). Nomes do manual do fabricante; valor = slot - 1. */
CR.TYPES = [
  { slot: 1, name: "Power-Zone Clean", kind: "Clean" },
  { slot: 2, name: "US Gold 100 Clean", kind: "Clean" },
  { slot: 3, name: "Two Stone Coral OD", kind: "Overdrive" },
  { slot: 4, name: "Doctor3 B", kind: "Overdrive" },
  { slot: 5, name: "Cali JP A", kind: "Overdrive" },
  { slot: 6, name: "Day Tripper OD", kind: "Distortion" },
  { slot: 7, name: "Shittcow Dist", kind: "Distortion" },
  { slot: 8, name: "Wo Stone Coral OD", kind: "Distortion" },
  { slot: 9, name: "Mr Smith Dist", kind: "Distortion" },
];

/* Gabinetes (knob IR CAB). Slot 1 desliga o IR. */
CR.CABS = [
  { slot: 1, name: "IR desligado", kind: "Sem gabinete" },
  { slot: 2, name: "Line 6 Vetta", kind: "1x12" },
  { slot: 3, name: "Marshall 1960AV", kind: "4x12" },
  { slot: 4, name: "Marshall 1960A T75 La610", kind: "4x12" },
  { slot: 5, name: "VHT Deliverance", kind: "2x12" },
  { slot: 6, name: "Soldano", kind: "2x12" },
  { slot: 7, name: "Peavey 5150 + Mesa Oversized", kind: "4x12" },
  { slot: 8, name: "JSX KT77 + Mesa Stiletto AKG C1000", kind: "4x12" },
  { slot: 9, name: "Diezel V30 SM57 (Soldano HR PowerAmp)", kind: "4x12" },
];

/* Os 10 knobs, na ordem do painel (de cima para baixo com a pedaleira em pé).
   off = posição do byte no preset; zero = posição "desligado/zerado"; string = letra do afinador. */
CR.CONTROLS = [
  { key: "volume", label: "VOLUME", name: "Volume geral",      off: 5, max: 127, module: 0, color: "white", zero: 0 },
  { key: "irCab",  label: "IR CAB", name: "Gabinete (IR)",     off: 9, max: 8,   module: 1, color: "green", zero: 0, list: "CABS", string: "E" },
  { key: "reverb", label: "REVERB", name: "Ambiente", off: 3, max: 15,  module: 1, color: "green", zero: 0, string: "A" },
  { key: "mix",    label: "MIX",    name: "Volume do eco",     off: 7, max: 118, module: 2, color: "blue",  zero: 0, string: "D" },
  { key: "fb",     label: "FB",     name: "Repetições do eco", off: 4, max: 127, module: 2, color: "blue", zero: 0, string: "G" },
  { key: "time",   label: "TIME",   name: "Tempo do eco",      off: 6, max: 31,  module: 2, color: "blue",  zero: 0, string: "B" },
  { key: "mod",    label: "MOD",    name: "Chorus | Phaser",   off: 8, max: 15,  module: 2, color: "blue",  zero: 7, bipolar: true, string: "E" },
  { key: "tone",   label: "TONE",   name: "Brilho", off: 2, max: 15, module: 3, color: "red",  zero: 0, tuner: "low" },
  { key: "gain",   label: "GAIN",   name: "Saturação", off: 1, max: 7,   module: 3, color: "red",   zero: 0, tuner: "ok" },
  { key: "type",   label: "TYPE",   name: "Modelo de pré",     off: 0, max: 8,   module: 3, color: "red",   zero: 0, list: "TYPES", tuner: "high" },
];

/* Footswitches e módulos (byte 10, 11 e 12 de cada preset liga/desliga o módulo). */
CR.MODULES = [
  { n: 1, fs: "A", label: "IR CAB-REVERB", name: "Gabinete e reverb", off: 10, color: "green" },
  { n: 2, fs: "B", label: "DELAY-MOD", name: "Delay e modulação", off: 11, color: "blue" },
  { n: 3, fs: "C", label: "TONE-AMP", name: "Pré-amplificador", off: 12, color: "red" },
];

CR.byKey = {};
CR.CONTROLS.forEach(function (c) { CR.byKey[c.key] = c; });

/* ---------------------------------------------------------------- estado */
/* Presets de fábrica da Cube Baby (usados quando o app nunca viu a pedaleira). */
CR.FACTORY_DEFAULT = [[2, 4, 10, 4, 31, 38, 31, 19, 7, 8, 1, 1, 1, 0, 0, 0],
                      [6, 3, 10, 0, 31, 12, 31, 16, 7, 8, 1, 1, 1, 0, 0, 0],
                      [0, 5, 11, 0, 31, 32, 31, 19, 7, 8, 1, 1, 1, 0, 0, 0]];

/* O app funciona com ou sem a pedaleira. Os presets ficam sempre no app (última cópia conhecida,
   ou os de fábrica). Sem a pedaleira, o que você mexe fica "pendente" (dirty) e, ao conectar,
   o app pergunta se envia para ela (CR.syncOnConnect). */
CR.S = {
  status: { state: "off", message: "" },
  presets: null,          // [3][16]
  connected: false,       // true só com a pedaleira conectada e respondendo
  dirty: {},              // presets mexidos sem a pedaleira: { 0: true, 2: true }
  preset: 0,              // preset em edição (0 = A)
  locked: false,
  undo: [],
};
(function () {
  try {
    var c = JSON.parse(localStorage.getItem("cr.lastPresets") || "null");
    if (Array.isArray(c) && c.length === 3 && c.every(function (r) { return Array.isArray(r) && r.length === 16; })) CR.S.presets = c;
    CR.S.dirty = JSON.parse(localStorage.getItem("cr.dirty") || "{}") || {};
  } catch (e) {}
  if (!CR.S.presets) CR.S.presets = CR.FACTORY_DEFAULT.map(function (r) { return r.slice(); });
})();
CR.saveCache = (function () {
  var t = null;
  return function () {
    clearTimeout(t);
    t = setTimeout(function () {
      try { localStorage.setItem("cr.lastPresets", JSON.stringify(CR.S.presets)); localStorage.setItem("cr.dirty", JSON.stringify(CR.S.dirty)); } catch (e) {}
    }, 300);
  };
})();
CR.markDirty = (function () {
  var told = false;
  return function (p) {
    CR.S.dirty[p] = true;
    CR.saveCache();
    if (!told) { told = true; CR.toast("Sem a pedaleira: os ajustes ficam guardados no app e vão para ela quando você conectar."); }
  };
})();

/* Conectou: se há ajustes feitos sem a pedaleira, pergunta se envia; senão usa os da pedaleira. */
CR.syncOnConnect = function (pedal) {
  var list = Object.keys(CR.S.dirty).map(Number).filter(function (p) { return p >= 0 && p <= 2; });
  if (!list.length) { CR.S.presets = pedal; CR.saveCache(); return; }
  var local = CR.S.presets;
  CR.S.presets = pedal;
  var names = list.map(function (p) { return "ABC"[p]; }).join(", ");
  CR.dialog("green", "Ajustes feitos sem a pedaleira", "Preset" + (list.length > 1 ? "s " : " ") + names,
    "<p>Você mexeu " + (list.length > 1 ? "nos presets " : "no preset ") + names + " enquanto a pedaleira estava desconectada. O que fazer?</p>" +
    '<div class="dialog-actions"><button class="btn big" type="button" data-keep>Usar os da pedaleira</button>' +
    '<button class="btn primary big" type="button" data-send>' + CR.icon("send") + "<span>Enviar para ela</span></button></div>");
  var d = document.getElementById("dialog");
  d.querySelector("[data-keep]").onclick = function () { d.hidden = true; CR.S.dirty = {}; CR.saveCache(); CR.emit("preset", CR.S.preset); };
  d.querySelector("[data-send]").onclick = async function () {
    d.hidden = true;
    CR.busy(true, "Enviando para a pedaleira");
    try {
      for (var i = 0; i < list.length; i++) CR.S.presets = await CR.native("sendPreset", { preset: list[i], values: local[list[i]] });
      CR.S.dirty = {};
      CR.toast("Ajustes enviados para a pedaleira");
    } catch (e) { CR.toast(e.message, true); }
    finally { CR.busy(false); CR.saveCache(); CR.emit("preset", CR.S.preset); }
  };
  d.querySelectorAll("[data-close]").forEach(function (b) { b.onclick = d.querySelector("[data-keep]").onclick; });
};

CR.val = function (c) {
  if (!CR.S.presets) return c.zero;
  var v = CR.S.presets[CR.S.preset][c.off];
  return c.off === 9 && CR.EQ ? CR.EQ.cabFor(CR.S.preset, v) : v;      // EQ por preset: mostra o gabinete base
};
CR.isActive = function (c) { return CR.val(c) !== c.zero; };
CR.moduleOn = function (m) { return CR.S.presets ? !!CR.S.presets[CR.S.preset][m.off] : true; };

/* Texto do valor como o músico entende (posição do knob, slot, efeito). */
CR.format = function (c, v) {
  if (v === undefined) v = CR.val(c);
  if (c.list) {
    var item = CR[c.list][v];
    return { short: String(v + 1), long: item ? item.name : "", unit: c.list === "TYPES" ? "slot" : "slot" };
  }
  if (c.bipolar) {
    if (v === c.zero) return { short: "OFF", long: "Desligado (centro)", unit: "" };
    return v < c.zero ? { short: "CH " + (c.zero - v), long: "Chorus, intensidade " + (c.zero - v) + " de " + c.zero, unit: "" }
                      : { short: "PH " + (v - c.zero), long: "Phaser, intensidade " + (v - c.zero) + " de " + (c.max - c.zero), unit: "" };
  }
  /* Cada controle tem um número fixo de posições na pedaleira (GAIN 0 a 7, TONE 0 a 15, VOLUME 0 a 127...).
     No modo "passos" (padrão) o app mostra a posição real, que anda de 1 em 1 sem pular.
     No modo "porcentagem" mostra o mesmo valor em %, que pula quando o controle tem poucas posições. */
  var pct = Math.round(v / c.max * 100);
  if (CR.prefs.display === "percent") return { short: pct + "%", long: "Passo " + v + " de " + c.max, unit: "%" };
  return { short: String(v), long: v + " de " + c.max + " (" + pct + "%)", unit: "" };
};

/* ---------------------------------------------------------------- envio sem engasgo
   No máximo 1 envio em andamento por byte; o último valor sempre chega. */
(function () {
  var sending = new Map();
  CR.sendByte = function (preset, offset, value) {
    CR.saveCache();
    if (!CR.S.connected) { CR.markDirty(preset); return; }     // sem a pedaleira: fica no app
    var k = preset + ":" + offset, s = sending.get(k);
    if (!s) { s = { running: false, next: null }; sending.set(k, s); }
    s.next = value;
    if (s.running) return;
    s.running = true;
    (async function () {
      while (s.next !== null) {
        var v = s.next; s.next = null;
        try { await CR.native("param", { preset: preset, offset: offset, value: v }); }
        catch (e) { CR.toast("Falha ao enviar: " + e.message, true); s.next = null; }
      }
      s.running = false;
    })();
  };
})();

/* Muda um byte do preset em edição: atualiza tela, guarda desfazer e envia. */
CR.set = function (offset, value, opts) {
  if (!CR.S.presets || CR.S.locked) return false;
  // EQ por preset ligado: o IR CAB da pedaleira aponta para o slot do EQ; mudar o gabinete muda a base
  if (offset === 9 && CR.EQ && CR.EQ.routed(CR.S.preset)) return CR.EQ.setBase(CR.S.preset, value);
  var p = CR.S.presets[CR.S.preset], prev = p[offset];
  if (prev === value) return false;
  if (!(opts && opts.noUndo)) {
    var last = CR.S.undo[CR.S.undo.length - 1];
    // arrastar o slider ou segurar o + gera muitos valores: junta tudo num único "desfazer"
    if (last && last.preset === CR.S.preset && last.offset === offset && Date.now() - last.t < 1200) { last.t = Date.now(); }
    else CR.S.undo.push({ preset: CR.S.preset, offset: offset, prev: prev, t: Date.now() });
    if (CR.S.undo.length > 60) CR.S.undo.shift();
  }
  p[offset] = value;
  CR.sendByte(CR.S.preset, offset, value);
  CR.emit("changed", { offset: offset, value: value });
  return true;
};

/* Carrega um som inteiro (memória ou fábrica) num preset A, B ou C da pedaleira.
   Grava os bytes 0 a 12 (controles e módulos); os bytes 13 a 15 do preset ficam como estão.
   O preset anterior vai para o desfazer, então o botão Desfazer do topo volta tudo de uma vez. */
CR.applyValues = async function (preset, values, opts) {
  if (!CR.S.presets) throw new Error("Pedaleira não conectada");
  if (CR.S.locked && !(opts && opts.force)) throw new Error("Controles travados");
  var cur = CR.S.presets[preset].slice(), next = cur.slice();
  for (var i = 0; i <= 12; i++) next[i] = values[i];
  if (CR.EQ && CR.EQ.routeValues) next = CR.EQ.routeValues(preset, next);    // EQ por preset: gabinete base
  if (CR.S.connected) CR.S.presets = await CR.native("sendPreset", { preset: preset, values: next });
  else { CR.S.presets[preset] = next; CR.markDirty(preset); }
  CR.saveCache();
  if (!(opts && opts.noUndo)) {
    CR.S.undo.push({ preset: preset, values: cur, t: Date.now() });
    if (CR.S.undo.length > 60) CR.S.undo.shift();
  }
  CR.S.preset = preset;
  CR.emit("preset", preset);
  return true;
};

/* Muda um byte de um preset qualquer (A=0, B=1, C=2) sem entrar no desfazer.
   Usado pelas ações ao vivo (Boost, Mudo, Swell, Fade), que agem nos 3 presets.
   opts.force: funciona mesmo com a trava ligada (pedal Bluetooth). */
CR.setAt = function (preset, offset, value, opts) {
  if (!CR.S.presets || (CR.S.locked && !(opts && opts.force))) return false;
  var p = CR.S.presets[preset];
  if (p[offset] === value) return false;
  p[offset] = value;
  CR.sendByte(preset, offset, value);
  CR.emit("changed", { offset: offset, value: value, preset: preset, live: true });
  return true;
};

CR.undo = function () {
  var u = CR.S.undo.pop();
  if (!u) { CR.toast("Nada para desfazer"); return; }
  if (u.values) {
    CR.busy(true, "Desfazendo");
    CR.applyValues(u.preset, u.values, { noUndo: true })
      .then(function () { CR.toast("Preset " + "ABC"[u.preset] + " voltou ao som anterior"); })
      .catch(function (e) { CR.toast(e.message, true); })
      .finally(function () { CR.busy(false); });
    return;
  }
  CR.S.preset = u.preset;
  CR.set(u.offset, u.prev, { noUndo: true });
  CR.emit("preset", CR.S.preset);
  CR.toast("Alteração desfeita");
};

/* Chave "ativo/zerado": guarda o valor anterior para devolver depois. */
CR.toggleZero = function (c) {
  var key = "cr.restore." + CR.S.preset + "." + c.off;
  if (CR.isActive(c)) {
    CR.store.set(key, CR.val(c));
    CR.set(c.off, c.zero);
  } else {
    var back = CR.store.get(key, null);
    if (back === null || back === c.zero) back = c.bipolar ? c.zero - 3 : Math.max(1, Math.round(c.max / 2));
    CR.set(c.off, back);
  }
  CR.haptic();
};

/* ---------------------------------------------------------------- preferências */
CR.store = {
  get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (_) { return d; } },
  set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
};
CR.prefs = Object.assign({ display: "steps", tuning: "std", tunerView: "needle", orientation: "auto", haptics: true, tunerSource: "mic", a4: 440 },
                         CR.store.get("cr.prefs", {}));
CR.savePrefs = function () { CR.store.set("cr.prefs", CR.prefs); };

/* Vibração: "tap" (toque comum), "tick" (cada passo de um slider ou knob), "detent" (marca: 0 dB, ligar/desligar).
   No máximo uma a cada 25 ms, para não embolar quando o dedo corre rápido. */
CR.haptic = (function () {
  var last = 0;
  return function (kind) {
    if (!CR.prefs.haptics) return;
    var now = Date.now();
    if (now - last < 25 && kind !== "detent") return;
    last = now;
    CR.native("haptic", { kind: kind || "tap" }).catch(function () {});
  };
})();

/* ---------------------------------------------------------------- avisos */
(function () {
  var timer;
  CR.toast = function (msg, err) {
    var t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.className = "toast" + (err ? " err" : "");
    t.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(function () { t.hidden = true; }, err ? 5000 : 2600);
  };
  CR.busy = function (on, text) {
    var b = document.getElementById("busy");
    b.hidden = !on;
    document.getElementById("busyText").textContent = text || "Aguarde";
  };
})();

CR.esc = function (s) {
  return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
};

/* Guarda a cópia dos presets no app sempre que algo muda. */
CR.on("changed", function () { CR.saveCache(); });
CR.on("preset", function () { CR.saveCache(); });
