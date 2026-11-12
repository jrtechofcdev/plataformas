// Coleta educada dos presets Cube Baby publicados em cube-baby-presets.vercel.app.
// Abre as páginas públicas num navegador, uma por vez, com pausa entre elas, e lê o que aparece na tela.
// Salva o progresso em data.json (pode ser retomado).
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.argv[2];
const BASE = 'https://cube-baby-presets.vercel.app';
const PAUSE = 600;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  let db = { list: {}, detail: {}, pages: 0 };
  if (fs.existsSync(OUT)) db = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const save = () => fs.writeFileSync(OUT, JSON.stringify(db, null, 1));
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR' })).newPage();

  // 1) listas (15 páginas)
  let total = 99;
  for (let pg = 1; pg <= total; pg++) {
    if (db.pages >= pg) continue;
    for (let tries = 0; tries < 3; tries++) {
      try {
        await p.goto(`${BASE}/pt/presets?modelId=cube-baby&page=${pg}`, { waitUntil: 'networkidle', timeout: 60000 });
        await p.waitForFunction(() => /Página \d+ de \d+/.test(document.body.innerText), null, { timeout: 30000 });
        const r = await p.evaluate(() => {
          const m = document.body.innerText.match(/Página (\d+) de (\d+) \((\d+) presets\)/);
          const cards = [];
          document.querySelectorAll('a[href*="/presets/"]').forEach(a => {
            const id = (a.getAttribute('href').match(/\/presets\/(\d+)$/) || [])[1];
            if (!id) return;
            let el = a;
            for (let k = 0; k < 6 && el && el.innerText.split('\n').filter(Boolean).length < 5; k++) el = el.parentElement;
            cards.push({ id: Number(id), text: el ? el.innerText : '' });
          });
          return { page: m ? +m[1] : 0, pages: m ? +m[2] : 0, count: m ? +m[3] : 0, cards };
        });
        total = r.pages;
        db.count = r.count;
        r.cards.forEach(c => { if (!db.list[c.id]) db.list[c.id] = c.text; });
        db.pages = pg;
        save();
        console.log(`lista ${pg}/${total}: ${r.cards.length} cards (total ${Object.keys(db.list).length})`);
        break;
      } catch (e) { console.log('erro lista', pg, e.message); await sleep(3000); }
    }
    await sleep(PAUSE);
  }

  // 2) detalhes
  const ids = Object.keys(db.list).map(Number).sort((a, b) => b - a);
  let n = 0;
  for (const id of ids) {
    n++;
    if (db.detail[id]) continue;
    for (let tries = 0; tries < 3; tries++) {
      try {
        await p.goto(`${BASE}/pt/presets/${id}`, { waitUntil: 'networkidle', timeout: 60000 });
        await p.waitForFunction(() => /Valores dos knobs|Preset não encontrado/.test(document.body.innerText), null, { timeout: 30000 });
        const d = await p.evaluate(() => {
          const main = document.querySelector('main') || document.body;
          const text = main.innerText;
          const h1 = document.querySelector('h1');
          const prof = main.querySelector('a[href*="/profile/"]');
          const i = text.indexOf('Valores dos knobs');
          const knobs = {};
          if (i >= 0) {
            const lines = text.slice(i).split('\n').map(s => s.trim()).filter(Boolean).slice(1);
            for (let k = 0; k + 1 < lines.length; k += 2) knobs[lines[k]] = lines[k + 1];
          }
          return { title: h1 ? h1.innerText.trim() : '', author: prof ? prof.innerText.trim() : '', text, knobs, notFound: /Preset não encontrado/.test(text) };
        });
        db.detail[id] = d;
        break;
      } catch (e) { console.log('erro detalhe', id, e.message); await sleep(3000); }
    }
    if (n % 10 === 0) { save(); console.log(`detalhes ${n}/${ids.length}`); }
    await sleep(PAUSE);
  }
  save();
  console.log('FIM', Object.keys(db.detail).length, 'detalhes');
  await b.close();
})();
