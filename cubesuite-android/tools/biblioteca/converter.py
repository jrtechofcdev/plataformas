# Converte os presets coletados de cube-baby-presets.vercel.app para o formato do Cube Remote.
# Cada preset vira um .json com os 16 bytes que a pedaleira guarda (mesma escala do site, conferida),
# separado em pastas por categoria, mais um índice .csv e um LEIA-ME.txt, tudo num .zip.
import json, re, sys, unicodedata, zipfile, io, csv, datetime

SRC, OUT = sys.argv[1], sys.argv[2]
db = json.load(open(SRC, encoding="utf-8"))
SITE = "https://cube-baby-presets.vercel.app"
ORDER = [("TYPE", 0, 8), ("GAIN", 1, 7), ("TONE", 2, 15), ("REVERB", 3, 15), ("FB", 4, 127),
         ("VOLUME", 5, 127), ("TIME", 6, 31), ("MIX", 7, 118), ("MOD", 8, 15), ("IR CAB", 9, 8)]
CATS = {"worship": "Worship e igreja", "clean": "Limpo", "drive": "Crunch e overdrive", "dist": "Distorcao e peso",
        "solo": "Solo", "ambient": "Ambiente e efeitos", "acoustic": "Violao"}
FOLDER = {"worship": "01 Worship e igreja", "clean": "02 Limpo", "drive": "03 Crunch e overdrive", "dist": "04 Distorcao e peso",
          "solo": "05 Solo", "ambient": "06 Ambiente e efeitos", "acoustic": "07 Violao"}
TYPES = ["Power-Zone Clean", "US Gold 100 Clean", "Two Stone Coral OD", "Doctor3 B", "Cali JP A", "Day Tripper OD",
         "Shittcow Dist", "Wo Stone Coral OD", "Mr Smith Dist"]
CABS = ["IR desligado", "Line 6 Vetta 1x12", "Marshall 1960AV 4x12", "Marshall 1960A T75 La610 4x12", "VHT Deliverance 2x12",
        "Soldano 2x12", "Peavey 5150 + Mesa Oversized 4x12", "JSX KT77 + Mesa Stiletto AKG C1000 4x12", "Diezel V30 SM57 4x12"]


def plain(s):
    return unicodedata.normalize("NFD", (s or "").lower()).encode("ascii", "ignore").decode()


# mesma regra do app (assets/www/js/library.js, função categorize)
def categorize(name, desc, v):
    t = plain(name + " " + desc)
    if re.search(r"violao|acoustic|acustic|martin|taylor|\bnylon\b", t): return "acoustic"
    if re.search(r"worship|louvor|adora|gospel|igreja|harpa|hillsong|bethel|elevation|ministra|culto|\bhino|crist|church|praise|jesus|deus|senhor|oracao", t): return "worship"
    if re.search(r"\bsolo|\blead\b|lead ", t): return "solo"
    if re.search(r"ambien|\bpad\b|fundo|swell|shimmer|freeze|atmosf|reverse|tremolo|vibrato|phaser|flanger|\becho\b", t): return "ambient"
    if re.search(r"clean|limpo|clen\b|\bclear\b", t): return "clean"
    if re.search(r"metal|distor|\bdist\b|heavy|pesad|thrash|djent|grunge|punk|hard ?rock|high gain|hi-gain", t): return "dist"
    if re.search(r"crunch|overdrive|\bdrive|\bod\b|blues|rock|timmy|klon|screamer", t): return "drive"
    if v[0] <= 1 and v[1] <= 4: return "clean"
    if v[0] >= 5 and v[1] >= 4: return "dist"
    return "drive"


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^A-Za-z0-9 ._()-]+", "", s).strip()
    return re.sub(r"\s+", " ", s)[:60] or "preset"


presets, skipped = [], []
for sid, card in db["list"].items():
    det = db["detail"].get(sid)
    if not det:
        skipped.append((sid, "página não lida")); continue
    if det.get("notFound"):
        skipped.append((sid, "preset apagado no site")); continue
    lines = [l.strip() for l in det["text"].split("\n") if l.strip()]
    model = lines[0] if lines else ""
    if model != "Cube Baby":
        skipped.append((sid, "modelo " + model)); continue
    cl = [l for l in (card or "").split("\n") if l.strip()]
    likes = dislikes = 0
    if len(cl) >= 5 and cl[-1] == "Ir":
        try: likes, dislikes = int(cl[-4]), int(cl[-3])
        except ValueError: pass
    name = det.get("title") or (cl[0] if cl else "Sem nome")
    author = det.get("author") or (cl[-5] if len(cl) >= 5 else "")
    # descrição: entre "Entrar para votar" e o primeiro rótulo do desenho da pedaleira
    desc = ""
    if "Entrar para votar" in lines and "VOLUME" in lines:
        a = lines.index("Entrar para votar") + 1
        b = lines.index("VOLUME")
        desc = " ".join(lines[a:b]).strip()
    k = det.get("knobs") or {}
    v = [0] * 16
    notes, bad = [], False
    for lbl, i, mx in ORDER:
        try:
            x = int(str(k.get(lbl, "")).strip())
        except ValueError:
            bad = True; break
        if x < 0 or x > mx:
            notes.append(f"{lbl} veio {x} no site; ajustado para a faixa da pedaleira (0 a {mx}).")
            x = max(0, min(mx, x))
        v[i] = x
    if bad:
        skipped.append((sid, "valores incompletos")); continue
    v[10] = v[11] = v[12] = 1          # módulos 1, 2 e 3 ligados (o site não informa)
    if v[8] == 0:
        notes.append("MOD em 0 = chorus no máximo na pedaleira. Se o autor quis sem modulação, deixe o MOD no centro (OFF).")
    if v[9] == 0:
        notes.append("IR CAB em 0 = sem gabinete simulado (bom para usar com amplificador de guitarra).")
    cat = categorize(name, desc, v)
    presets.append({
        "format": "cube-remote-preset", "version": 1,
        "name": name, "author": author, "description": desc, "category": cat, "category_name": CATS[cat],
        "model": "Cube Baby",
        "knobs": {lbl: v[i] for lbl, i, _ in ORDER},
        "values": v,
        "bytes_hex": " ".join(f"{x:02X}" for x in v),
        "amp": f"{v[0] + 1} {TYPES[v[0]]}", "cab": f"{v[9] + 1} {CABS[v[9]]}",
        "notes": notes,
        "source": {"site": "cube-baby-presets.vercel.app", "id": int(sid), "url": f"{SITE}/pt/presets/{sid}",
                   "likes": likes, "dislikes": dislikes},
    })

presets.sort(key=lambda p: -p["source"]["id"])
from collections import Counter
cnt = Counter(p["category"] for p in presets)
today = datetime.date.today().strftime("%d/%m/%Y")

leia = f"""CUBE REMOTE · BIBLIOTECA DE PRESETS CUBE BABY
by Jr_Tech_OFC · gerado em {today}

O QUE TEM AQUI
{len(presets)} presets da Cube Baby publicados pela comunidade em {SITE}
(somente o modelo Cube Baby; Cube Baby Bass e Cube Baby AC ficaram de fora).
Cada arquivo .json é um preset, com os 16 bytes que a pedaleira guarda (campo "values"),
os valores dos knobs, o autor, a descrição e o link do preset original.

COMO USAR NO APP (versão 2.5.0 ou mais nova)
1. Abra Memórias > Biblioteca > Subir presets.
2. Escolha este arquivo .zip inteiro (ou alguns .json de dentro dele).
3. Filtre por categoria, toque em A, B ou C para testar na pedaleira.
4. Gostou? Toque em "Aprovar e guardar" e escolha uma memória (nova ou existente).

CATEGORIAS (pastas)
""" + "\n".join(f"- {FOLDER[c]}: {cnt.get(c, 0)} presets" for c in FOLDER) + f"""

A categoria foi escolhida pelo nome e pela descrição do preset (e, se não diziam nada, pelo tipo
de amp e pelo ganho). Dá para mudar a categoria de qualquer preset dentro do app.

ESCALA DOS VALORES
O site usa a mesma escala da pedaleira: TYPE 0-8 (posição = valor + 1), GAIN 0-7, TONE 0-15,
REVERB 0-15, FB 0-127, VOLUME 0-127, TIME 0-31, MIX 0-118, MOD 0-15 (7 = desligado, abaixo chorus,
acima phaser), IR CAB 0-8 (0 = sem gabinete). Os módulos 1, 2 e 3 vêm ligados (o site não informa).

ATENÇÃO
- Os presets foram feitos por outras pessoas, com outras guitarras e outros IRs. Ajuste o VOLUME de
  cada um antes de usar no culto.
- Presets com MOD em 0 ficam com chorus no máximo. Muitos autores colocam 0 querendo dizer "sem
  modulação": se soar estranho, deixe o MOD no centro (OFF). Isso está anotado em cada arquivo.
- Alguns autores usam IRs próprios nos slots. Aqui vale o gabinete que estiver no slot da sua pedaleira.
- Créditos de cada preset: ao autor indicado no arquivo. Uso pessoal.

ÍNDICE
indice.csv tem todos os presets numa tabela (abre no Excel ou Google Planilhas).
"""

with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    z.writestr("LEIA-ME.txt", leia.replace("\n", "\r\n").encode("utf-8"))
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["id", "nome", "autor", "categoria"] + [l for l, _, _ in ORDER] + ["curtidas", "notas", "link"])
    used = set()
    for p in presets:
        w.writerow([p["source"]["id"], p["name"], p["author"], p["category_name"]] + [p["knobs"][l] for l, _, _ in ORDER] +
                   [p["source"]["likes"], " | ".join(p["notes"]), p["source"]["url"]])
        fn = f'{FOLDER[p["category"]]}/{p["source"]["id"]:04d} - {slug(p["name"])}.json'
        assert fn not in used
        used.add(fn)
        z.writestr(fn, json.dumps(p, ensure_ascii=False, indent=1).encode("utf-8"))
    z.writestr("indice.csv", ("﻿" + buf.getvalue()).encode("utf-8"))

print("presets:", len(presets), "| ignorados:", len(skipped))
print("categorias:", dict(cnt))
print("motivos ignorados:", Counter(r for _, r in skipped))
print("com notas:", sum(1 for p in presets if p["notes"]), "| MOD 0:", sum(1 for p in presets if p["values"][8] == 0))
