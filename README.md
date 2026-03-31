# Portál institucí – opravdu finální verze

## Co je v této verzi

- plné UI portálu
- načítání kontaktů z `data/default-core.json` a `data/default-exekutori.json`
- kompaktní levý i pravý panel
- detail kontaktu s telefonem, datovou schránkou a otevírací dobou
- splátkový kalendář s dopočtem splátek
- formulář **Návrh na zastavení exekuce**
- automatické předvyplnění formuláře zastavení exekuce z PDF
- schování nerelevantních polí podle role navrhovatele
- generování listiny přes Gemini API

## Co vložit do složky `data`

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
