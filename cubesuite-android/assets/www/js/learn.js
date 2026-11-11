/* Cube Remote · Copyright (c) 2026 José Renato · Jr_Tech_OFC. Todos os direitos reservados.
   Aba Aprender: controles, módulos, modelos (TYPE), gabinetes (IR CAB), modos e receitas. */
"use strict";
var CR = window.CR || (window.CR = {});

CR.Learn = (function () {
  var L = CR.LEARN;
  var SECTIONS = [["l-controls", "Controles"], ["l-modules", "Módulos 1 2 3"], ["l-types", "TYPE"],
                  ["l-cabs", "IR CAB"], ["l-recipes", "Receitas"], ["l-modes", "Modos"]];

  function controlsHtml() {
    return CR.CONTROLS.map(function (c) {
      var t = L.controls[c.key];
      return '<article class="l-card" id="c-' + c.key + '" style="--led:var(--led-' + c.color + ')">' +
        '<header><span class="led-dot on"></span><div><h3>' + c.label + "</h3><p>" + c.name + "</p></div>" +
        '<span class="l-mod">' + (c.module ? "Módulo " + c.module : "Saída") + "</span></header>" +
        "<p>" + t.what + "</p><h4>Como usar</h4><p>" + t.use + "</p><h4>Combina com</h4><p>" + t.combo + "</p></article>";
    }).join("");
  }

  function modulesHtml() {
    var chain = L.chain.map(function (s, i) {
      return '<span class="ch-step">' + s + "</span>" + (i < L.chain.length - 1 ? CR.icon("chevron", "ch-arrow") : "");
    }).join("");
    var mods = L.modules.map(function (m) {
      return '<article class="l-card" style="--led:var(--led-' + m.color + ')"><header><span class="led-dot on"></span><div><h3>' +
        m.title + "</h3><p>Footswitch " + m.fs + " · " + m.parts + "</p></div></header><p>" + m.text + "</p></article>";
    }).join("");
    var sets = L.bestSets.map(function (s) {
      return "<tr><th>" + s.style + "</th><td>" + s.modules + "</td><td>" + s.how + "</td></tr>";
    }).join("");
    return '<p class="l-lead">O som passa pelos blocos sempre nesta ordem. Cada módulo pode ser ligado ou desligado por preset, nos botões Módulo 1, 2 e 3 da tela Palco.</p>' +
      '<div class="chain">' + chain + "</div>" + mods +
      '<h3 class="l-sub">Qual o melhor conjunto?</h3><p class="l-lead">Depende da música. Pontos de partida:</p>' +
      '<div class="table-wrap"><table class="l-table"><thead><tr><th>Estilo</th><th>Módulos</th><th>Como</th></tr></thead><tbody>' + sets + "</tbody></table></div>";
  }

  function typesHtml() {
    var kinds = ["Clean", "Overdrive", "Distortion"];
    return '<p class="l-lead">Os 9 modelos de pré-amplificador do knob TYPE, com o número da posição na pedaleira e o nome do manual do fabricante. Escolha o TYPE primeiro, depois ajuste GAIN e TONE.</p>' +
      kinds.map(function (k) {
        var items = CR.TYPES.map(function (t, i) { return [t, i]; }).filter(function (x) { return x[0].kind === k; });
        return '<article class="l-card" style="--led:var(--led-red)"><header><span class="led-dot on"></span><div><h3>' + k + "</h3><p>" +
          items.length + " modelos</p></div></header><p>" + L.types[k] + "</p><ol class='slot-list'>" +
          items.map(function (x) {
            return '<li><span class="slot-n">' + x[0].slot + "</span><div><b>" + x[0].name + "</b><span>" + L.typeUse[x[1]] + "</span></div></li>";
          }).join("") + "</ol></article>";
      }).join("") +
      '<p class="l-note">Como comparar: grave a mesma frase passando por cada slot com GAIN e TONE iguais. O fabricante não informa em quais amplificadores reais cada modelo foi baseado além do nome.</p>';
  }

  function cabsHtml() {
    return '<p class="l-lead">As 9 posições do knob IR CAB. A posição 1 desliga o gabinete; as posições 2 a 9 são os gabinetes de fábrica (podem ser trocados pelos seus IRs em Ferramentas).</p>' +
      '<article class="l-card" style="--led:var(--led-green)"><ol class="slot-list">' +
      CR.CABS.map(function (c, i) {
        return '<li><span class="slot-n">' + c.slot + "</span><div><b>" + c.name + " <em>" + c.kind + "</em></b><span>" + L.cabs[i] + "</span></div></li>";
      }).join("") + "</ol></article>" +
      '<p class="l-note">Falantes: 1x12 soa mais focado; 4x12 tem mais grave e impacto; 2x12 fica no meio. Tendências gerais, o ouvido decide.</p>';
  }

  function recipesHtml() {
    return '<p class="l-lead">Pontos de partida para cada estilo. "Aplicar" grava os valores no preset em edição; depois ajuste a gosto e use Desfazer se não gostar.</p>' +
      L.recipes.map(function (r, i) {
        var v = r.v, type = CR.TYPES[v.type - 1], cab = CR.CABS[v.irCab - 1];
        var mod = v.mod === 0 ? "desligado" : (v.mod < 0 ? "Chorus " + (-v.mod) : "Phaser " + v.mod);
        return '<article class="l-card recipe"><header><div><h3>' + r.name + "</h3><p>" + r.desc + "</p></div></header>" +
          '<dl class="rv"><div><dt>TYPE</dt><dd>' + v.type + " · " + type.name + "</dd></div>" +
          "<div><dt>GAIN</dt><dd>" + v.gain + "%</dd></div><div><dt>TONE</dt><dd>" + v.tone + "%</dd></div>" +
          "<div><dt>MOD</dt><dd>" + mod + "</dd></div>" +
          "<div><dt>Delay</dt><dd>" + (v.mix ? "MIX " + v.mix + "%, FB " + v.fb + "%, TIME " + v.time + "%" : "desligado") + "</dd></div>" +
          "<div><dt>REVERB</dt><dd>" + v.reverb + "%</dd></div><div><dt>IR CAB</dt><dd>" + v.irCab + " · " + cab.name + "</dd></div></dl>" +
          '<button class="btn primary wide" type="button" data-recipe="' + i + '">' + CR.icon("send") + "<span>Aplicar no preset em edição</span></button></article>";
      }).join("");
  }

  function modesHtml() {
    return '<p class="l-lead">A pedaleira tem estes modos (manual do fabricante).</p>' +
      L.modes.map(function (m) { return '<article class="l-card"><header><div><h3>' + m.name + "</h3></div></header><p>" + m.how + "</p></article>"; }).join("");
  }

  function render() {
    var v = document.getElementById("view-learn");
    var chips = SECTIONS.map(function (s) { return '<button class="chip-btn" type="button" data-to="' + s[0] + '">' + s[1] + "</button>"; }).join("");
    var body = {
      "l-controls": controlsHtml(), "l-modules": modulesHtml(), "l-types": typesHtml(),
      "l-cabs": cabsHtml(), "l-recipes": recipesHtml(), "l-modes": modesHtml(),
    };
    v.innerHTML = '<div class="page"><h1 class="page-title">Aprender</h1><div class="chips" role="navigation" aria-label="Tópicos">' + chips + "</div>" +
      SECTIONS.map(function (s) { return '<section class="l-section" id="' + s[0] + '"><h2>' + s[1] + "</h2>" + body[s[0]] + "</section>"; }).join("") +
      "</div>";
    v.querySelectorAll("[data-to]").forEach(function (b) { b.onclick = function () { scrollTo(b.dataset.to); }; });
    v.querySelectorAll("[data-recipe]").forEach(function (b) { b.onclick = function () { applyRecipe(L.recipes[Number(b.dataset.recipe)]); }; });
  }

  function scrollTo(id) {
    var el = document.getElementById(id), v = document.getElementById("view-learn");
    if (el) v.scrollTo({ top: el.offsetTop - 8, behavior: "smooth" });
  }

  async function applyRecipe(r) {
    if (!CR.S.presets) { CR.toast("Conecte a pedaleira para aplicar", true); return; }
    if (CR.S.locked) { CR.toast("Destrave os controles primeiro", true); return; }
    var name = CR.MODULES[CR.S.preset].fs;
    var prev = CR.S.presets[CR.S.preset].slice();
    var bytes = CR.recipeBytes(r);
    CR.busy(true, "Aplicando no preset " + name);
    try {
      CR.S.presets = await CR.native("sendPreset", { preset: CR.S.preset, values: bytes });
      for (var i = 0; i < 13; i++) if (prev[i] !== bytes[i]) CR.S.undo.push({ preset: CR.S.preset, offset: i, prev: prev[i], t: 0 });
      CR.emit("preset", CR.S.preset);
      CR.toast(r.name + " aplicado no preset " + name);
    } catch (e) { CR.toast(e.message, true); }
    finally { CR.busy(false); }
  }

  return { render: render, scrollTo: scrollTo };
})();
