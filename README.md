# Snorri · Æfingar (web)

Mobile-first Icelandic workout logger. Vanilla HTML/CSS/JS, offline via `localStorage`. No build step.

## Opna

### Fljótlegt (mælt með)

```bash
cd /workspace/snorri-aefingar/web
./start.sh
```

Opnaðu síðan í vafra: **http://127.0.0.1:8765/**

Eða handvirkt:

```bash
python3 -m http.server 8765
```

### Á síma í sama neti

Finndu IP á vélinni (`hostname -I`) og opnaðu `http://<IP>:8765/`.

Ef `PUBLIC_URL.txt` er til staðar inniheldur hún cloudflared/ngrok URL.

## Eiginleikar

- **Skrá æfingu** — A/B dagur, sett (þyngd + reps + ✓), vista í localStorage, forfylla síðustu þyngdir
- **Tölfræði** — besta/síðasta þyngd, volume, þróun ↑/→/↓
- **Saga** — lista, skoða, eyða
- **Áætlun** — mán/mið/fös, A/B til skiptis
- **Export/Import** — JSON og CSV

## Seed

`seed-data.json` er flutt inn sjálfkrafa í tóma localStorage (7 lotur úr Excel, Dead bug → Total Abdominal Technogym).

## Skrár

- `index.html` · `styles.css` · `app.js` · `seed-data.json` · `start.sh`
