/* ==========================================================================
   CubeSuite Linux — lógica da interface
   --------------------------------------------------------------------------
   Este arquivo só cuida da TELA. Quem fala com a pedaleira é o servidor
   Python (server.py). A comunicação é feita pela função api() abaixo.
   ========================================================================== */
"use strict";

const TOKEN = new URLSearchParams(location.search).get("t") || "";
const $ = (sel) => document.querySelector(sel);

// Estado da tela
const S = {
  state: null,        // última resposta de /api/state
  preset: 0,          // preset selecionado (0=A, 1=B, 2=C)
  presets: null,      // valores dos 3 presets
  busy: false,
};

/* ---------------- comunicação com o servidor ---------------- */
async function api(route, body, opts = {}) {
  const headers = { "X-Token": TOKEN, ...(opts.headers || {}) };
  let payload = body;
  if (!(body instanceof ArrayBuffer) && !(body instanceof Blob)) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body || {});
  } else {
    headers["Content-Type"] = "application/octet-stream";
  }
  const res = await fetch("/api/" + route, { method: "POST", headers, body: payload });
  const data = await res.json().catch(() => ({ error: "resposta inválida do servidor" }));
  if (data.disconnected) { setDisconnected(); }
  if (!res.ok || data.error) throw new Error(data.error || ("HTTP " + res.status));
  return data;
}

/* ---------------- avisos ---------------- */
function toast(msg, isErr = false) {
  const el = document.createElement("div");
  el.className = "toast" + (isErr ? " err" : "");
  el.textContent = msg;
  $("#toasts").appendChild(el);
  setTimeout(() => el.remove(), isErr ? 7000 : 3500);
}

function confirmBox(title, text) {
  return new Promise((resolve) => {
    const dlg = $("#confirmDlg");
    $("#confirmTitle").textContent = title;
    $("#confirmText").textContent = text;
    const done = (v) => { dlg.close(); resolve(v); };
    $("#confirmYes").onclick = () => done(true);
    $("#confirmNo").onclick = () => done(false);
    dlg.showModal();
  });
}

/* ---------------- conexão ---------------- */
function fillPorts(ports) {
  const sel = $("#portSelect");
  const cur = sel.value;
  sel.innerHTML = '<option value="">Procurar automaticamente</option>' +
    ports.map((p) => `<option value="${p.path}">${p.name} — ${p.path}</option>`).join("");
  sel.value = ports.some((p) => p.path === cur) ? cur : "";
}

function renderLog(lines) {
  const html = (lines || []).map((l) => `<li>${escapeHtml(l)}</li>`).join("");
  $("#connLog").innerHTML = html;
  $("#sysLog").innerHTML = html || "<li>—</li>";
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function setDisconnected() {
  if (S.state) S.state.connected = false;
  applyState(S.state || { connected: false, ports: [] });
}

function applyState(st) {
  S.state = st;
  $("#appVer").textContent = st.version ? "v" + st.version : "";
  fillPorts(st.ports || []);
  renderLog(st.log);
  const on = !!st.connected;
  const pill = $("#status");
  pill.className = "pill " + (on ? (st.simulate ? "pill-sim" : "pill-on") : "pill-off");
  pill.querySelector("b").textContent = on ? (st.simulate ? "Simulação" : "Conectada") : "Desconectada";
  $("#btnConnect").textContent = on ? "Reconectar" : "Conectar";
  $("#deviceCard").classList.toggle("hidden", !on);
  $("#emptyState").classList.toggle("hidden", on);
  $("#tabs").classList.toggle("hidden", !on);
  if (!on) { document.querySelectorAll(".tab-panel").forEach((p) => p.classList.add("hidden")); return; }

  const i = st.info;
  $("#devModel").textContent = i.model + (i.generation === 2 ? " (geração nova)" : i.generation === 1 ? " (geração antiga)" : "");
  $("#devName").textContent = i.name || "—";
  $("#devVer").textContent = i.version || "—";
  $("#devPid").textContent = i.productId;
  $("#devPort").textContent = i.portName ? `${i.portName} (${i.port})` : i.port;
  $("#factoryFile").textContent = i.factoryFile;

  // A aba Presets só existe na geração nova
  const hasPresets = i.generation === 2;
  document.querySelector('[data-tab="presets"]').classList.toggle("hidden", !hasPresets);
  document.querySelector('[data-tab="system"]').classList.toggle("hidden", !hasPresets);
  if (hasPresets) {
    S.presets = st.presets;
    buildPedal();
    $("#loopback").checked = !!st.loopback;
    $("#loopbackText").textContent = st.loopback ? "Ligado" : "Desligado";
  }
  const active = document.querySelector(".tab.active:not(.hidden)") ||
                 document.querySelector(".tab:not(.hidden)");
  showTab(active.dataset.tab);
  refreshIrButtons();
}

async function connect() {
  const btn = $("#btnConnect");
  btn.disabled = true; btn.textContent = "Procurando…";
  try {
    const st = await api("connect", { path: $("#portSelect").value });
    applyState(st);
    if (st.connected) toast("✅ " + st.info.model + " conectada!");
    else toast("Pedaleira não encontrada. Veja o registro abaixo.", true);
  } catch (e) { toast(e.message, true); }
  finally { btn.disabled = false; if (!S.state || !S.state.connected) btn.textContent = "Conectar"; }
}

/* ---------------- abas ---------------- */
function showTab(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("hidden", p.id !== "tab-" + name));
}

/* ---------------- knobs (botões giratórios) ---------------- */
const ARC = 270;                    // abertura do knob em graus
const R = 28, CIRC = 2 * Math.PI * R;

function knobSVG() {
  const len = CIRC * ARC / 360;
  return `<svg viewBox="0 0 70 70" aria-hidden="true">
    <defs><radialGradient id="capGrad" cx="35%" cy="30%"><stop offset="0" stop-color="#4a535e"/><stop offset="1" stop-color="#1a1f25"/></radialGradient></defs>
    <circle class="track" cx="35" cy="35" r="${R}" fill="none" stroke-width="5" stroke-linecap="round"
      stroke-dasharray="${len} ${CIRC}" transform="rotate(135 35 35)"/>
    <circle class="value-arc" cx="35" cy="35" r="${R}" fill="none" stroke-width="5" stroke-linecap="round"
      stroke-dasharray="${len} ${CIRC}" stroke-dashoffset="${len}" transform="rotate(135 35 35)"/>
    <circle class="cap" cx="35" cy="35" r="20" stroke-width="1"/>
    <line class="needle" x1="35" y1="35" x2="35" y2="19" stroke-width="3" stroke-linecap="round"/>
  </svg>`;
}

function makeKnob(param, value, onChange) {
  const el = document.createElement("div");
  el.className = "knob";
  el.tabIndex = 0;
  el.setAttribute("role", "slider");
  el.setAttribute("aria-label", param.label);
  el.setAttribute("aria-valuemin", "0");
  el.setAttribute("aria-valuemax", String(param.max));
  el.innerHTML = knobSVG() + `<label>${param.label}</label><output></output>`;
  const arc = el.querySelector(".value-arc"), needle = el.querySelector(".needle"), out = el.querySelector("output");
  const len = CIRC * ARC / 360;
  let v = value;

  function draw() {
    const f = param.max ? v / param.max : 0;
    arc.setAttribute("stroke-dashoffset", String(len * (1 - f)));
    needle.setAttribute("transform", `rotate(${-135 + f * ARC} 35 35)`);
    out.textContent = `${v} / ${param.max}`;
    el.setAttribute("aria-valuenow", String(v));
  }
  function set(nv, send = true) {
    nv = Math.max(0, Math.min(param.max, Math.round(nv)));
    if (nv === v) return;
    v = nv; draw();
    if (send) onChange(v);
  }
  // arrastar com mouse/toque: 160 px = curso completo
  const svg = el.querySelector("svg");
  svg.addEventListener("pointerdown", (e) => {
    svg.setPointerCapture(e.pointerId);
    const y0 = e.clientY, v0 = v;
    const move = (ev) => set(v0 + (y0 - ev.clientY) / 160 * param.max);
    const up = () => { svg.removeEventListener("pointermove", move); svg.removeEventListener("pointerup", up); };
    svg.addEventListener("pointermove", move);
    svg.addEventListener("pointerup", up);
  });
  el.addEventListener("wheel", (e) => { e.preventDefault(); set(v + (e.deltaY < 0 ? 1 : -1)); }, { passive: false });
  el.addEventListener("keydown", (e) => {
    const step = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 5, PageDown: -5 }[e.key];
    if (step) { e.preventDefault(); set(v + step); }
    if (e.key === "Home") set(0);
    if (e.key === "End") set(param.max);
  });
  draw();
  el.setValue = (nv) => { v = nv; draw(); };
  return el;
}

/* Envia um parâmetro para a pedaleira, sem "engasgar" quando o knob gira rápido:
   no máximo 1 envio em andamento por parâmetro; o último valor sempre é enviado. */
const pending = new Map();
function sendParam(preset, key, value) {
  const id = preset + ":" + key;
  const slot = pending.get(id) || { running: false, next: null };
  slot.next = value;
  pending.set(id, slot);
  if (slot.running) return;
  (async function loop() {
    slot.running = true;
    while (slot.next !== null) {
      const val = slot.next; slot.next = null;
      try { await api("param", { preset, key, value: val }); }
      catch (e) { toast("Falha ao enviar " + key + ": " + e.message, true); slot.next = null; }
    }
    slot.running = false;
  })();
}

const GROUPS = [
  { id: "out", title: "Saída" },
  { id: "A", title: "Bloco A · IR Cab / Reverb" },
  { id: "B", title: "Bloco B · Delay / Mod" },
  { id: "C", title: "Bloco C · Tone / Amp" },
];

function buildPedal() {
  const st = S.state, p = S.presets[S.preset];
  // seletor A/B/C
  $("#presetSeg").innerHTML = st.presetNames.map((n, i) =>
    `<button data-p="${i}" class="${i === S.preset ? "active" : ""}">Preset ${n}</button>`).join("");
  $("#presetSeg").querySelectorAll("button").forEach((b) => b.onclick = () => { S.preset = +b.dataset.p; buildPedal(); });

  const pedal = $("#pedal");
  pedal.innerHTML = "";
  for (const g of GROUPS) {
    const box = document.createElement("div");
    box.className = "group";
    const sw = st.switches.find((s) => s.group === g.id);
    box.innerHTML = `<div class="group-head"><h4>${g.title}</h4></div><div class="knobs"></div>`;
    if (sw) {
      const lab = document.createElement("label");
      lab.className = "switch";
      lab.title = "Liga/desliga o bloco " + sw.label;
      lab.innerHTML = `<input type="checkbox" ${p[sw.key] ? "checked" : ""}><span></span>`;
      const input = lab.querySelector("input");
      box.classList.toggle("off", !p[sw.key]);
      input.onchange = () => {
        p[sw.key] = input.checked ? 1 : 0;
        box.classList.toggle("off", !input.checked);
        sendParam(S.preset, sw.key, p[sw.key]);
      };
      box.querySelector(".group-head").appendChild(lab);
    }
    const knobs = box.querySelector(".knobs");
    st.params.filter((x) => x.group === g.id).forEach((par) => {
      knobs.appendChild(makeKnob(par, p[par.key], (val) => { p[par.key] = val; sendParam(S.preset, par.key, val); }));
    });
    pedal.appendChild(box);
  }
}

/* ---------------- IR ---------------- */
function drawWave(samples) {
  const c = $("#irWave"), g = c.getContext("2d");
  const w = c.width, h = c.height, mid = h / 2;
  g.clearRect(0, 0, w, h);
  g.strokeStyle = "#232a32"; g.lineWidth = 1;
  g.beginPath(); g.moveTo(0, mid); g.lineTo(w, mid); g.stroke();
  const peak = Math.max(1e-9, ...samples.map(Math.abs));
  g.strokeStyle = "#33eab8"; g.lineWidth = 2;
  g.beginPath();
  samples.forEach((s, i) => {
    const x = i / (samples.length - 1) * w, y = mid - (s / peak) * (mid - 8);
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  });
  g.stroke();
}

function refreshIrButtons() {
  const has = !!(S.state && S.state.ir);
  const on = !!(S.state && S.state.connected);
  $("#btnSaveIr").disabled = !(has && on) || S.busy;
  $("#btnPreview").disabled = !(has && on) || S.busy;
  $("#btnFactoryIr").disabled = !on || S.busy;
  if (has) {
    const ir = S.state.ir;
    $("#irInfo").classList.remove("hidden");
    $("#irName").textContent = ir.name;
    const m = ir.meta;
    $("#irMeta").textContent = `${m.rate} Hz · ${m.bits} bits${m.float ? " float" : ""} · ${m.channels === 1 ? "mono" : m.channels + " canais"} · ${m.frames} amostras`;
    drawWave(ir.samples);
  }
}

async function loadWav(file) {
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) return toast("Arquivo grande demais para um IR.", true);
  try {
    const buf = await file.arrayBuffer();
    const preview = $("#autoPreview").checked && S.state && S.state.connected;
    const r = await api("ir/load", buf, { headers: {
      "X-File-Name": encodeURIComponent(file.name).slice(0, 200),
      "X-Preview": preview ? "1" : "0", "X-Distance": $("#distance").value } });
    r.ir.name = file.name;
    S.state.ir = r.ir;
    refreshIrButtons();
    toast(preview ? "🎧 IR carregado e tocando na pedaleira (prévia)." : "IR carregado.");
    if (r.ir.meta.rate && ![44100, 48000].includes(r.ir.meta.rate))
      toast(`Atenção: o arquivo está em ${r.ir.meta.rate} Hz. Prefira IRs em 44.1 ou 48 kHz.`, true);
  } catch (e) { toast(e.message, true); }
}

let progTimer = null;
function watchProgress(start) {
  const box = $("#progressBox");
  clearInterval(progTimer);
  if (!start) { box.classList.add("hidden"); return; }
  box.classList.remove("hidden");
  $("#progressBar").style.width = "0%";
  $("#progressText").textContent = "Preparando…";
  progTimer = setInterval(async () => {
    try {
      const p = await api("progress");
      if (!p.active) return;
      const pct = Math.round(100 * p.done / Math.max(1, p.total));
      $("#progressBar").style.width = pct + "%";
      $("#progressText").textContent = `${p.label} — ${pct}%`;
    } catch (_) { /* ignora */ }
  }, 300);
}

async function longJob(fn) {
  S.busy = true; refreshIrButtons(); watchProgress(true);
  try { await fn(); }
  catch (e) { toast(e.message, true); }
  finally { S.busy = false; watchProgress(false); refreshIrButtons(); }
}

async function saveIr() {
  const slot = +$("#slotSelect").value;
  const ok = await confirmBox("Salvar IR", `Gravar "${S.state.ir.name}" no slot ${slot + 1}? O IR que estava nesse slot será substituído.`);
  if (!ok) return;
  await longJob(async () => {
    await api("ir/save", { slot, distance: +$("#distance").value });
    toast(`✅ IR salvo no slot ${slot + 1}!`);
  });
}

async function factoryIr(fileData) {
  if (!fileData) {
    const ok = await confirmBox("Restaurar IRs de fábrica", "Os 8 slots de IR serão regravados com os IRs originais. Continuar?");
    if (!ok) return;
  }
  await longJob(async () => {
    try {
      await api("ir/factory", fileData || {});
      toast("✅ IRs de fábrica restaurados!");
    } catch (e) {
      if (e.message.startsWith("NEED_FACTORY_FILE:")) {
        const name = e.message.split(":")[1];
        toast(`Escolha o arquivo ${name} (pasta bin/ do CubeSuite para Windows).`);
        $("#factoryInput").click();
      } else throw e;
    }
  });
}

/* ---------------- eventos ---------------- */
function init() {
  $("#btnConnect").onclick = connect;
  document.querySelectorAll(".tab").forEach((t) => t.onclick = () => showTab(t.dataset.tab));

  $("#btnReload").onclick = async () => {
    try { S.presets = (await api("presets")).presets; buildPedal(); toast("Presets lidos da pedaleira."); }
    catch (e) { toast(e.message, true); }
  };
  $("#btnFactoryPresets").onclick = async () => {
    if (!await confirmBox("Restaurar presets", "Os presets A, B e C voltarão aos valores de fábrica. Continuar?")) return;
    try { S.presets = (await api("factory-presets")).presets; buildPedal(); toast("✅ Presets de fábrica restaurados."); }
    catch (e) { toast(e.message, true); }
  };
  $("#loopback").onchange = async (e) => {
    try {
      const r = await api("loopback", { on: e.target.checked });
      e.target.checked = r.loopback;
      $("#loopbackText").textContent = r.loopback ? "Ligado" : "Desligado";
    } catch (err) { toast(err.message, true); e.target.checked = !e.target.checked; }
  };

  // IR: arquivo
  $("#wavInput").onchange = (e) => { loadWav(e.target.files[0]); e.target.value = ""; };
  const drop = $("#drop");
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => loadWav(e.dataTransfer.files[0]));

  // IR: distância (envia ao soltar o controle)
  const dist = $("#distance");
  dist.oninput = () => { $("#distVal").textContent = dist.value + "%"; };
  dist.onchange = async () => {
    if (!S.state || !S.state.connected) return;
    try { await api("ir/distance", { distance: +dist.value }); } catch (e) { toast(e.message, true); }
  };
  $("#btnPreview").onclick = async () => {
    try { await api("ir/preview", { distance: +dist.value }); toast("🎧 Prévia enviada."); }
    catch (e) { toast(e.message, true); }
  };
  $("#slotSelect").innerHTML = Array.from({ length: 8 }, (_, i) => `<option value="${i}">Slot ${i + 1}</option>`).join("");
  $("#btnSaveIr").onclick = saveIr;
  $("#btnFactoryIr").onclick = () => factoryIr(null);
  $("#factoryInput").onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = "";
    if (f) factoryIr(await f.arrayBuffer());
  };

  // "ping" para o programa saber que a janela continua aberta
  setInterval(() => api("ping").catch(() => {}), 3000);

  api("state").then((st) => {
    applyState(st);
    if (!st.connected) connect();   // tenta conectar sozinho ao abrir
  }).catch((e) => toast("Não consegui falar com o programa: " + e.message, true));
}

document.addEventListener("DOMContentLoaded", init);
