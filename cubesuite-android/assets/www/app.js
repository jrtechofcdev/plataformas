/* ==========================================================================
   Cube Remote — lógica da tela
   Quem fala com a pedaleira é o Java (MainActivity.java). Aqui só chamamos:
       native("param", {preset, offset, value})
   Fora do celular (abrindo o index.html no PC) roda um SIMULADOR, para testes.
   ========================================================================== */
"use strict";
const $ = (s) => document.querySelector(s);

/* -------- Parâmetros: [chave, nome, byte no preset, valor máximo, bloco] --------
   (descobertos no CubeSuite.exe; a ordem é a do painel da pedaleira) */
const PARAMS = [
  ["volume", "VOLUME", 5, 127, "out"],
  ["irCab",  "IR CAB", 9, 8,   "A"],
  ["reverb", "REVERB", 3, 15,  "A"],
  ["mix",    "MIX",    7, 118, "B"],
  ["fb",     "FB",     4, 127, "B"],
  ["time",   "TIME",   6, 31,  "B"],
  ["mod",    "MOD",    8, 15,  "B"],
  ["tone",   "TONE",   2, 15,  "C"],
  ["gain",   "GAIN",   1, 7,   "C"],
  ["type",   "TYPE",   0, 8,   "C"],
];
// Chaves liga/desliga dos blocos: [bloco, nome curto, descrição, byte]
const BLOCKS = [
  ["A", "IR / REV", "Footswitch A", 10],
  ["B", "DLY / MOD", "Footswitch B", 11],
  ["C", "AMP", "Footswitch C", 12],
];
const GROUP_NAMES = { out: "Saída", A: "Bloco A · IR Cab / Reverb", B: "Bloco B · Delay / Mod", C: "Bloco C · Tone / Amp" };

const S = { st: null, preset: 0, presets: null, ir: null, slot: 0 };

/* ======================= ponte com o Java ======================= */
let nextId = 1;
const waiting = new Map();
window.cubeResolve = (id, ok, data) => {
  const w = waiting.get(id);
  if (!w) return;
  waiting.delete(id);
  ok ? w.resolve(data) : w.reject(new Error(data));
};
window.cubeEvent = (name, data) => { if (name === "status") applyStatus(data); };

function native(method, args = {}) {
  return new Promise((resolve, reject) => {
    const id = "c" + nextId++;
    waiting.set(id, { resolve, reject });
    (window.CubeNative || Mock).call(id, method, JSON.stringify(args));
  });
}

/* ======================= avisos ======================= */
let toastTimer;
function toast(msg, err = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast" + (err ? " err" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), err ? 5000 : 2500);
}
function busy(on, text = "Aguarde…") { $("#busy").classList.toggle("hidden", !on); $("#busyText").textContent = text; }
function vibrate() { try { navigator.vibrate && navigator.vibrate(12); } catch (_) {} }

/* ======================= estado da conexão ======================= */
function applyStatus(st) {
  S.st = st;
  const chip = $("#statusChip");
  chip.className = "chip " + (st.state === "on" ? "on" : st.state === "search" ? "search" : "off");
  chip.querySelector("span").textContent =
    st.state === "on" ? (st.mock ? "Simulação" : "Conectada") : st.state === "search" ? "Procurando…" : "Desconectada";
  const on = st.state === "on";
  $("#screenOff").classList.toggle("hidden", on);
  $("#screenMain").classList.toggle("hidden", !on);
  $("#btnConnect").disabled = st.state === "search";
  if (!on) {
    $("#offTitle").textContent = st.state === "search" ? "Procurando a pedaleira…" : "Conecte a Cube Baby";
    $("#offMsg").textContent = st.message || "";
    return;
  }
  if (st.warning) toast(st.warning, true);
  const gen2 = st.generation === 2;
  document.querySelectorAll(".gen2only").forEach((e) => e.classList.toggle("hidden", !gen2));
  $("#oldGen").classList.toggle("hidden", gen2);
  $("#presetSeg").classList.toggle("hidden", !gen2);
  $("#blocks").classList.toggle("hidden", !gen2);
  $("#params").classList.toggle("hidden", !gen2);
  if (gen2) { S.presets = st.presets; render(); $("#loopback").checked = !!st.loopback; }
  $("#devInfo").innerHTML = `<dl>
    <dt>Modelo</dt><dd>${esc(st.model)}${gen2 ? " (geração nova)" : ""}</dd>
    <dt>Nome interno</dt><dd>${esc(st.name || "—")}</dd>
    <dt>Firmware</dt><dd>${esc(st.version || "—")}</dd>
    <dt>ID</dt><dd>${esc(st.productId)}</dd>
    <dt>USB</dt><dd>${esc(st.device || "—")}</dd></dl>`;
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ======================= controles ao vivo ======================= */
// Envio sem "engasgar": 1 envio por vez para cada byte; o último valor sempre chega.
const sending = new Map();
function sendByte(preset, offset, value) {
  const k = preset + ":" + offset;
  let s = sending.get(k);
  if (!s) { s = { running: false, next: null }; sending.set(k, s); }
  s.next = value;
  if (s.running) return;
  s.running = true;
  (async () => {
    while (s.next !== null) {
      const v = s.next; s.next = null;
      try { await native("param", { preset, offset, value: v }); }
      catch (e) { toast("Falha ao enviar: " + e.message, true); s.next = null; }
    }
    s.running = false;
  })();
}

function render() {
  const p = S.presets[S.preset];
  // A / B / C
  $("#presetSeg").innerHTML = ["A", "B", "C"].map((n, i) =>
    `<button class="${i === S.preset ? "active" : ""}" data-i="${i}">${n}<small>preset</small></button>`).join("");
  $("#presetSeg").querySelectorAll("button").forEach((b) => b.onclick = () => { vibrate(); S.preset = +b.dataset.i; render(); });

  // pads de bloco
  $("#blocks").innerHTML = BLOCKS.map(([g, short, desc, off]) =>
    `<button class="pad ${p[off] ? "on" : ""}" data-off="${off}"><b>${g}</b><small>${short}</small><span class="led"></span></button>`).join("");
  $("#blocks").querySelectorAll(".pad").forEach((b) => b.onclick = () => {
    vibrate();
    const off = +b.dataset.off;
    p[off] = p[off] ? 0 : 1;
    sendByte(S.preset, off, p[off]);
    render();
  });

  // parâmetros agrupados
  const box = $("#params");
  box.innerHTML = "";
  for (const g of ["out", "A", "B", "C"]) {
    const blk = BLOCKS.find((b) => b[0] === g);
    const off = blk && !p[blk[3]];
    const title = document.createElement("div");
    title.className = "group-title" + (off ? " off" : "");
    title.innerHTML = `<span>${GROUP_NAMES[g]}</span><span>${blk ? (off ? "desligado" : "ligado") : ""}</span>`;
    box.appendChild(title);
    PARAMS.filter((x) => x[4] === g).forEach((par) => box.appendChild(paramRow(par, p, off)));
  }
}

function paramRow([key, label, offset, max], p, off) {
  const el = document.createElement("div");
  el.className = "param" + (off ? " off" : "");
  el.innerHTML = `<div class="param-head"><span>${label}</span><b class="val"></b></div>
    <div class="param-ctrl"><button class="step">−</button>
    <input type="range" min="0" max="${max}" step="1" aria-label="${label}"><button class="step">+</button></div>`;
  const range = el.querySelector("input"), val = el.querySelector(".val");
  const [minus, plus] = el.querySelectorAll(".step");
  const show = () => {
    val.innerHTML = `${p[offset]} <small>/ ${max}</small>`;
    range.value = p[offset];
    range.style.setProperty("--p", (100 * p[offset] / max) + "%");
  };
  const set = (v) => {
    v = Math.max(0, Math.min(max, Math.round(v)));
    if (v === p[offset]) return;
    p[offset] = v; show();
    sendByte(S.preset, offset, v);
  };
  range.oninput = () => set(+range.value);
  minus.onclick = () => { vibrate(); set(p[offset] - 1); };
  plus.onclick = () => { vibrate(); set(p[offset] + 1); };
  show();
  return el;
}

/* ======================= IR ======================= */
function readWav(buf) {
  const d = new DataView(buf);
  const tag = (o) => String.fromCharCode(d.getUint8(o), d.getUint8(o + 1), d.getUint8(o + 2), d.getUint8(o + 3));
  if (buf.byteLength < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("Não é um arquivo WAV válido");
  let pos = 12, fmt = null, data = null;
  while (pos + 8 <= buf.byteLength) {
    const id = tag(pos), size = d.getUint32(pos + 4, true);
    if (id === "fmt ") fmt = pos + 8;
    if (id === "data") data = { off: pos + 8, len: Math.min(size, buf.byteLength - pos - 8) };
    pos += 8 + size + (size & 1);
  }
  if (fmt === null || !data) throw new Error("WAV incompleto (sem 'fmt ' ou 'data')");
  let fmtTag = d.getUint16(fmt, true);
  const ch = d.getUint16(fmt + 2, true), rate = d.getUint32(fmt + 4, true);
  const align = d.getUint16(fmt + 12, true), bits = d.getUint16(fmt + 14, true);
  if (fmtTag === 0xFFFE) fmtTag = d.getUint16(fmt + 24, true);
  const w = align / ch, frames = Math.floor(data.len / align), out = [];
  for (let i = 0; i < Math.min(512, frames); i++) {
    const o = data.off + i * align;               // canal esquerdo
    let v;
    if (fmtTag === 3 && w === 4) v = d.getFloat32(o, true);
    else if (fmtTag === 3 && w === 8) v = d.getFloat64(o, true);
    else if (fmtTag === 1 && w === 1) v = (d.getUint8(o) - 128) / 128;
    else if (fmtTag === 1 && w === 2) v = d.getInt16(o, true) / 32767;
    else if (fmtTag === 1 && w === 3) { let x = d.getUint8(o) | (d.getUint8(o + 1) << 8) | (d.getUint8(o + 2) << 16); if (x & 0x800000) x -= 0x1000000; v = x / 8388608; }
    else if (fmtTag === 1 && w === 4) v = d.getInt32(o, true) / 2147483648;
    else throw new Error(`Formato WAV não suportado (${bits} bits)`);
    out.push(Math.round(v * 1e6) / 1e6);
  }
  while (out.length < 512) out.push(0);
  return { samples: out, rate, ch, bits, frames };
}

function drawWave(s) {
  const c = $("#irWave"), g = c.getContext("2d"), w = c.width, h = c.height, mid = h / 2;
  g.clearRect(0, 0, w, h);
  const peak = Math.max(1e-9, ...s.map(Math.abs));
  g.strokeStyle = "#33eab8"; g.lineWidth = 3; g.beginPath();
  s.forEach((v, i) => { const x = i / (s.length - 1) * w, y = mid - v / peak * (mid - 10); i ? g.lineTo(x, y) : g.moveTo(x, y); });
  g.stroke();
}

async function loadWav(file) {
  if (!file) return;
  try {
    const ir = readWav(await file.arrayBuffer());
    ir.name = file.name;
    S.ir = ir;
    $("#irBox").classList.remove("hidden");
    $("#irName").textContent = file.name;
    $("#irMeta").textContent = `${ir.rate} Hz · ${ir.bits} bits`;
    drawWave(ir.samples);
    updateSaveBtn();
    busy(true, "Enviando prévia…");
    await native("irPreview", { samples: ir.samples, distance: +$("#distance").value });
    toast("🎧 IR tocando na pedaleira (prévia)");
    if (![44100, 48000].includes(ir.rate)) toast(`Atenção: arquivo em ${ir.rate} Hz. Prefira 44.1 ou 48 kHz.`, true);
  } catch (e) { toast(e.message, true); }
  finally { busy(false); }
}

function updateSaveBtn() {
  $("#btnSaveIr").disabled = !S.ir;
  $("#btnSaveIr").textContent = `💾 Salvar IR no slot ${S.slot + 1}`;
  $("#slotGrid").querySelectorAll("button").forEach((b) => b.classList.toggle("active", +b.dataset.s === S.slot));
}

/* ======================= início ======================= */
function init() {
  $("#btnConnect").onclick = () => native("connect");
  $("#btnReconnect").onclick = () => native("connect");
  $("#statusChip").onclick = () => { if (!S.st || S.st.state !== "on") native("connect"); };

  document.querySelectorAll(".bottom button").forEach((b) => b.onclick = () => {
    document.querySelectorAll(".bottom button").forEach((x) => x.classList.toggle("active", x === b));
    document.querySelectorAll(".tab-body").forEach((t) => t.classList.toggle("hidden", t.id !== b.dataset.tab));
    window.scrollTo(0, 0);
  });

  // IR
  $("#wavInput").onchange = (e) => { loadWav(e.target.files[0]); e.target.value = ""; };
  const dist = $("#distance");
  const paint = () => { $("#distVal").textContent = dist.value + "%"; dist.style.setProperty("--p", dist.value + "%"); };
  dist.oninput = paint; paint();
  dist.onchange = () => native("irDistance", { distance: +dist.value }).catch((e) => toast(e.message, true));
  $("#slotGrid").innerHTML = Array.from({ length: 8 }, (_, i) => `<button data-s="${i}">${i + 1}</button>`).join("");
  $("#slotGrid").querySelectorAll("button").forEach((b) => b.onclick = () => { S.slot = +b.dataset.s; updateSaveBtn(); });
  updateSaveBtn();
  $("#btnSaveIr").onclick = async () => {
    if (!S.ir || !confirm(`Gravar "${S.ir.name}" no slot ${S.slot + 1}? O IR antigo desse slot será substituído.`)) return;
    busy(true, `Gravando no slot ${S.slot + 1}…`);
    try { await native("irSave", { slot: S.slot, samples: S.ir.samples, distance: +dist.value }); toast(`✅ IR salvo no slot ${S.slot + 1}`); }
    catch (e) { toast(e.message, true); }
    finally { busy(false); }
  };

  // Mais
  $("#loopback").onchange = async (e) => {
    try { e.target.checked = await native("loopback", { on: e.target.checked }); }
    catch (err) { toast(err.message, true); e.target.checked = !e.target.checked; }
  };
  $("#btnReload").onclick = async () => {
    try { S.presets = await native("presets"); render(); toast("Presets lidos da pedaleira"); }
    catch (e) { toast(e.message, true); }
  };
  $("#btnFactory").onclick = async () => {
    if (!confirm("Restaurar os presets A, B e C de fábrica?")) return;
    try { S.presets = await native("factoryPresets"); render(); toast("✅ Presets de fábrica restaurados"); }
    catch (e) { toast(e.message, true); }
  };

  native("state").then((st) => { applyStatus(st); if (st.state !== "on") native("connect"); });
}

/* ======================= simulador (só no PC) ======================= */
const Mock = {
  presets: [[2, 4, 10, 4, 31, 38, 31, 19, 7, 8, 1, 1, 1, 0, 0, 0], [6, 3, 10, 0, 31, 12, 31, 16, 7, 8, 1, 1, 1, 0, 0, 0],
            [0, 5, 11, 0, 31, 32, 31, 19, 7, 8, 1, 1, 1, 0, 0, 0]],
  loop: false, on: false, log: [],
  state() {
    return this.on ? { state: "on", mock: true, model: "Cube Baby", name: "CubeBaby", version: "20240615010",
      productId: "0x4F06", generation: 2, device: "Simulador", presets: JSON.parse(JSON.stringify(this.presets)), loopback: this.loop }
      : { state: "off", message: "Simulador desligado" };
  },
  call(id, m, json) {
    const a = JSON.parse(json);
    setTimeout(() => {
      let r = true;
      if (m === "connect") {
        window.cubeEvent("status", { state: "search", message: "" });
        setTimeout(() => { this.on = true; window.cubeEvent("status", this.state()); }, 500);
      } else if (m === "state") r = this.state();
      else if (m === "param") { this.presets[a.preset][a.offset] = a.value; this.log.push(a); }
      else if (m === "presets") r = this.presets;
      else if (m === "loopback") r = this.loop = a.on;
      window.cubeResolve(id, true, r);
    }, 30);
  },
};

document.addEventListener("DOMContentLoaded", init);
