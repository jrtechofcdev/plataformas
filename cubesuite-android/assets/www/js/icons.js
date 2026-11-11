/* Cube Remote · Copyright (c) 2026 José Renato · Jr_Tech_OFC. Todos os direitos reservados.
   Ícones próprios do app (grade 24 x 24, traço de 2 px, cantos retos). Uso: CR.icon("pedal"). */
"use strict";
var CR = window.CR || (window.CR = {});

CR.ICONS = {
  // pedaleira vista de cima: corpo, dois knobs e um footswitch
  pedal: '<rect x="5" y="2.5" width="14" height="19" rx="1.5"/><circle cx="9.5" cy="7.5" r="2"/><circle cx="14.5" cy="7.5" r="2"/><circle cx="12" cy="15.5" r="3"/>',
  // livro aberto
  learn: '<path d="M12 6.5c-2-1.6-4.8-2.2-8-2v13c3.2-.2 6 .4 8 2"/><path d="M12 6.5c2-1.6 4.8-2.2 8-2v13c-3.2-.2-6 .4-8 2z"/><path d="M12 6.5v13"/>',
  // metrônomo
  tools: '<path d="M8.5 3h7l4 18h-15z"/><path d="M12 17 17 6.5"/><path d="M6.5 14h11"/>',
  // faders de mesa de som
  settings: '<path d="M6 3v18M12 3v18M18 3v18"/><rect x="3.5" y="6" width="5" height="3"/><rect x="9.5" y="13" width="5" height="3"/><rect x="15.5" y="8.5" width="5" height="3"/>',
  // diapasão
  tuner: '<path d="M8 2.5v8a4 4 0 0 0 8 0v-8"/><path d="M12 14.5v7"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10.5" rx="1"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/><path d="M12 14.5v2.5"/>',
  unlock: '<rect x="4.5" y="10.5" width="15" height="10.5" rx="1"/><path d="M8 10.5V7a4 4 0 0 1 7.6-1.8"/>',
  undo: '<path d="M8.5 5 4 9.5 8.5 14"/><path d="M4.5 9.5h9a6 6 0 0 1 0 12H9"/>',
  send: '<path d="M12 15V3.5"/><path d="M7 8.5 12 3.5l5 5"/><path d="M4 14v6.5h16V14"/>',
  info: '<circle cx="12" cy="12" r="9.5"/><path d="M12 6.5v7"/><path d="M12 16.5v1.5"/>',
  close: '<path d="m5.5 5.5 13 13M18.5 5.5l-13 13"/>',
  plug: '<path d="M9 2.5v5M15 2.5v5"/><path d="M6 7.5h12v3a6 6 0 0 1-12 0z"/><path d="M12 16.5v5"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  stop: '<rect x="6" y="6" width="12" height="12"/>',
  tap: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/>',
  knob: '<circle cx="12" cy="12" r="7"/><path d="M12 12 8.5 7.5"/><path d="M4 19.5 2.5 21M20 19.5l1.5 1.5"/>',
  slider: '<path d="M3 8h18M3 16h18"/><rect x="13" y="5.5" width="4" height="5"/><rect x="6" y="13.5" width="4" height="5"/>',
  list: '<path d="M8 6.5h12M8 12h12M8 17.5h12"/><path d="M4 6.5h1M4 12h1M4 17.5h1"/>',
  share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="5.5" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="m8.2 10.8 7.6-4M8.2 13.2l7.6 4"/>',
  copy: '<rect x="8" y="8" width="12" height="12"/><path d="M16 8V4H4v12h4"/>',
  trash: '<path d="M4 6.5h16M9 6.5V3.5h6v3"/><path d="M6 6.5 7 21h10l1-14.5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
  wave: '<path d="M2.5 12h3l2-6 3 12 3-14 3 12 2-4h3"/>',
  file: '<path d="M6 2.5h8l4.5 4.5v14.5H6z"/><path d="M14 2.5V7h4.5"/>',
  rotate: '<rect x="7" y="3" width="10" height="18" rx="1.5"/><path d="M3 9.5v5M21 9.5v5"/>',
  vibrate: '<rect x="8" y="3.5" width="8" height="17" rx="1.5"/><path d="M4.5 8v8M19.5 8v8"/>',
  usb: '<path d="M12 2.5v15"/><path d="M9 5.5 12 2.5l3 3"/><path d="M12 13 7.5 10.5V8M12 15.5l4.5-2.5V11"/><circle cx="12" cy="19.5" r="2"/>',
  check: '<path d="m4.5 12.5 5 5 10-11"/>',
  chevron: '<path d="m9 5.5 6.5 6.5L9 18.5"/>',
  // memórias: cartões empilhados com linhas
  memory: '<rect x="3.5" y="7" width="13" height="14" rx="1"/><path d="M7.5 3.5h13v13.5"/><path d="M7 12h6M7 16h4"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  save: '<path d="M12 3.5V15"/><path d="m7 10 5 5 5-5"/><path d="M4 14v6.5h16V14"/>',
  edit: '<path d="M4 20h4L19.5 8.5l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  up: '<path d="m5.5 15 6.5-6.5 6.5 6.5"/>',
  // setlist: linhas de música com uma nota
  headphones: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3.5" y="14" width="4" height="6.5" rx="1"/><rect x="16.5" y="14" width="4" height="6.5" rx="1"/>',
  strobe: '<rect x="2.5" y="7" width="19" height="10" rx="1"/><path d="M6 7v10M10 7v10M14 7v10M18 7v10"/>',
  search2: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5M8 10.5h5M10.5 8v5"/>',
  culto: '<path d="M3.5 6h11M3.5 11h11M3.5 16h6"/><path d="M19.5 4v12"/><circle cx="17" cy="17" r="2.5"/>',
  boost: '<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z"/>',
  mute: '<path d="M3.5 9h4l5-4v14l-5-4h-4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
  swell: '<path d="M3 19.5h18V5z"/>',
  fade: '<path d="M3 5v14.5h18z"/>',
  next: '<path d="M5 5v14l10-7z"/><path d="M19 5v14"/>',
  prev: '<path d="M19 5v14L9 12z"/><path d="M5 5v14"/>',
  // pedal visto de lado com ondas de Bluetooth
  pedalbt: '<path d="M2.5 20h19l-2-5h-15z"/><path d="M7 15l1.5-3.5h7L17 15"/><path d="M15 3.5a5 5 0 0 1 0 5M17.5 2a8 8 0 0 1 0 8"/>',
  down: '<path d="m5.5 9 6.5 6.5L18.5 9"/>',
};

CR.icon = function (name, cls) {
  var p = CR.ICONS[name] || "";
  return '<svg class="ico' + (cls ? " " + cls : "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true" focusable="false">' + p + "</svg>";
};
