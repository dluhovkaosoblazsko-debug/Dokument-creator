# Portál institucí – upravená lokální verze

## Co je upravené

- lokální CSS bez Tailwind CDN
- kontakty se automaticky načítají ze serveru po refreshi
- trvalé JSON soubory:
  - `data/default-core.json`
  - `data/default-exekutori.json`
- horní lišta bez importu JSON
- tlačítko **Kontext a údaje** vedle PDF
- kompaktní levý panel
- detail kontaktu pod seznamem
- zobrazení datové schránky, telefonu a otevírací doby
- pole pro splátkový kalendář
- dopočet počtu měsíců / měsíční splátky
- možnost načíst dlužnou částku z PDF přes AI

## Důležité

Do složky `data/` vlož své dva soubory:

- `default-core.json`
- `default-exekutori.json`

## Spuštění

```bash
npm install
```

Zkopíruj `.env.example` na `.env` a doplň klíč.

```bash
npm run dev
```

Pak otevři:

```text
http://localhost:3000
```
