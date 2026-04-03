import { Document, Packer, Paragraph, TextRun, AlignmentType, Header } from "docx";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import multer from "multer";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
app.set("trust proxy", 1);
const PORT = Number(process.env.PORT || 3000);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB || 10);
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!GEMINI_API_KEY) {
  console.error("ChybÄ‚Â­ GEMINI_API_KEY v .env");
  process.exit(1);
}

app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    frameguard: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: [
          "'self'",
          "http://localhost:3000",
          "https://portal-040d.onrender.com"
        ]  
      }
    }
  })
);

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));


const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,

  // Ă˘Ĺ›â€¦ KLÄ‚Ĺ¤Ă„ĹšOVÄ‚ĹĄ ÄąÂÄ‚ÂDEK PRO RENDER
  keyGenerator: (req) => req.ip
});

app.use("/api", limiter);

app.use(express.static(path.join(__dirname, "public")));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE }
});

const contactStore = {
  exekutori: [],
  banky: [],
  ossz: [],
  pojistovny: [],
  soudy: []
};

const DATA_FILES = [
  path.join(__dirname, "data", "default-core.json"),
  path.join(__dirname, "data", "default-exekutori.json")
];

const PDF_RELEVANCE_RULES = `
### OBECNÄ‚â€° PRAVIDLO PRO Ă„ĹšTENÄ‚Ĺ¤ PDF A POSOUZENÄ‚Ĺ¤ RELEVANCE DAT

VÄąÄľdy nejprve pÄąâ„˘eĂ„Ĺ¤ti celÄ‚Â© PDF, ne pouze prvnÄ‚Â­ strÄ‚Ë‡nku, prvnÄ‚Â­ blok textu nebo prvnÄ‚Â­ rozpoznanou sekci.

Nejprve urĂ„Ĺ¤ete typ dokumentu podle jeho obsahu, napÄąâ„˘Ä‚Â­klad:
- exekuĂ„Ĺ¤nÄ‚Â­ nÄ‚Ë‡vrh
- usnesenÄ‚Â­
- rozsudek
- vÄ‚Ëťzva
- formulÄ‚Ë‡Äąâ„˘
- insolvenĂ„Ĺ¤nÄ‚Â­ nÄ‚Ë‡vrh
- nÄ‚Ë‡vrh na oddluÄąÄľenÄ‚Â­
- ÄąÄľaloba
- vyjÄ‚Ë‡dÄąâ„˘enÄ‚Â­
- jinÄ‚Â© procesnÄ‚Â­ podÄ‚Ë‡nÄ‚Â­

Teprve po urĂ„Ĺ¤enÄ‚Â­ typu dokumentu posuĂ„Ĺą, kterÄ‚Â© Ä‚Ĺźdaje jsou pro danÄ‚Ëť typ dokumentu relevantnÄ‚Â­.

PÄąâ„˘i extrakci nikdy neignoruj identifikaĂ„Ĺ¤nÄ‚Â­ Ä‚Ĺźdaje Ä‚ĹźĂ„Ĺ¤astnÄ‚Â­kÄąĹ» jen proto, ÄąÄľe nejsou v zÄ‚Ë‡hlavÄ‚Â­ nebo na prvnÄ‚Â­ strÄ‚Ë‡nce. RelevantnÄ‚Â­ Ä‚Ĺźdaje mohou bÄ‚Ëťt uvedeny takÄ‚Â©:
- v oznaĂ„Ĺ¤enÄ‚Â­ Ä‚ĹźĂ„Ĺ¤astnÄ‚Â­kÄąĹ»
- v odÄąĹ»vodnĂ„â€şnÄ‚Â­
- ve vÄ‚Ëťroku
- v tabulkÄ‚Ë‡ch
- v pÄąâ„˘Ä‚Â­lohÄ‚Ë‡ch
- v poznÄ‚Ë‡mkÄ‚Ë‡ch
- v dalÄąË‡Ä‚Â­ch blocÄ‚Â­ch dokumentu

U kaÄąÄľdÄ‚Â©ho Ä‚ĹźĂ„Ĺ¤astnÄ‚Â­ka vÄąÄľdy aktivnĂ„â€ş hledej a vyuÄąÄľij vÄąË‡echny relevantnÄ‚Â­ identifikaĂ„Ĺ¤nÄ‚Â­ Ä‚Ĺźdaje, zejmÄ‚Â©na:
- jmÄ‚Â©no a pÄąâ„˘Ä‚Â­jmenÄ‚Â­ / nÄ‚Ë‡zev subjektu
- adresa bydliÄąË‡tĂ„â€ş / sÄ‚Â­dla / doruĂ„Ĺ¤ovacÄ‚Â­ adresa
- datum narozenÄ‚Â­
- rodnÄ‚Â© Ă„Ĺ¤Ä‚Â­slo
- IĂ„ĹšO
- datovÄ‚Ë‡ schrÄ‚Ë‡nka
- e-mail
- telefon
- dalÄąË‡Ä‚Â­ identifikÄ‚Ë‡tory, pokud jsou zjevnĂ„â€ş souĂ„Ĺ¤Ä‚Ë‡stÄ‚Â­ identifikace Ä‚ĹźĂ„Ĺ¤astnÄ‚Â­ka

Pokud dokument nepouÄąÄľÄ‚Â­vÄ‚Ë‡ vÄ‚Ëťrazy Ă˘â‚¬ĹľpovinnÄ‚ËťĂ˘â‚¬Ĺ› a Ă˘â‚¬ĹľoprÄ‚Ë‡vnĂ„â€şnÄ‚ËťĂ˘â‚¬Ĺ›, mapuj role podle vÄ‚Ëťznamu a typu dokumentu:
- exekuce: oprÄ‚Ë‡vnĂ„â€şnÄ‚Ëť / povinnÄ‚Ëť
- insolvence a oddluÄąÄľenÄ‚Â­: vĂ„â€şÄąâ„˘itel / dluÄąÄľnÄ‚Â­k
- civilnÄ‚Â­ Äąâ„˘Ä‚Â­zenÄ‚Â­: ÄąÄľalobce / ÄąÄľalovanÄ‚Ëť
- nÄ‚Ë‡vrhovÄ‚Ë‡ Äąâ„˘Ä‚Â­zenÄ‚Â­: navrhovatel / odpÄąĹ»rce
- obecnĂ„â€ş: Ä‚ĹźĂ„Ĺ¤astnÄ‚Â­k Äąâ„˘Ä‚Â­zenÄ‚Â­ podle vÄ‚Ëťznamu v textu

PÄąâ„˘i vÄ‚Â­ce vÄ‚Ëťskytech stejnÄ‚Â©ho Ä‚Ĺźdaje pouÄąÄľij tento prioritnÄ‚Â­ princip:
1. Ä‚Ĺźdaj vÄ‚ËťslovnĂ„â€ş pÄąâ„˘iÄąâ„˘azenÄ‚Ëť ke konkrÄ‚Â©tnÄ‚Â­ osobĂ„â€ş nebo subjektu
2. Ä‚Ĺźdaj uvedenÄ‚Ëť v sekci oznaĂ„Ĺ¤enÄ‚Â­ Ä‚ĹźĂ„Ĺ¤astnÄ‚Â­kÄąĹ»
3. Ä‚Ĺźdaj uvedenÄ‚Ëť ve formulÄ‚Ë‡Äąâ„˘ovÄ‚Â©m poli
4. Ä‚Ĺźdaj uvedenÄ‚Ëť jinde v textu, pokud je zjevnĂ„â€ş pÄąâ„˘iÄąâ„˘aditelnÄ‚Ëť ke konkrÄ‚Â©tnÄ‚Â­mu Ä‚ĹźĂ„Ĺ¤astnÄ‚Â­kovi

Pokud existuje vÄ‚Â­ce adres, rozliÄąË‡uj podle vÄ‚Ëťznamu:
- trvalÄ‚Â© bydliÄąË‡tĂ„â€ş
- doruĂ„Ĺ¤ovacÄ‚Â­ adresa
- sÄ‚Â­dlo
- provozovna

Pokud typ adresy nenÄ‚Â­ jasnÄ‚Ëť, pouÄąÄľij ji jako obecnou adresu Ä‚ĹźĂ„Ĺ¤astnÄ‚Â­ka.

NevynechÄ‚Ë‡vej relevantnÄ‚Â­ Ä‚Ĺźdaje jen proto, ÄąÄľe nejsou poÄąÄľadovÄ‚Ë‡ny ve vÄąË‡ech typech dokumentÄąĹ». VÄąÄľdy posuzuj relevanci vzhledem ke konkrÄ‚Â©tnÄ‚Â­mu typu dokumentu.

Pokud je Ä‚Ĺźdaj v PDF uveden jasnĂ„â€ş a je relevantnÄ‚Â­ pro identifikaci Ä‚ĹźĂ„Ĺ¤astnÄ‚Â­ka nebo pro vyplnĂ„â€şnÄ‚Â­ vÄ‚ËťslednÄ‚Â©ho dokumentu, pouÄąÄľij jej.

Pokud je Ä‚Ĺźdaj neĂ„Ĺ¤itelnÄ‚Ëť, neÄ‚ĹźplnÄ‚Ëť nebo nejistÄ‚Ëť:
- nevymÄ‚ËťÄąË‡lej ho
- nedopoĂ„Ĺ¤Ä‚Â­tÄ‚Ë‡vej ho
- nepÄąâ„˘episuj ho odhadem
- ponech odpovÄ‚Â­dajÄ‚Â­cÄ‚Â­ pole prÄ‚Ë‡zdnÄ‚Â©

Pokud je v dokumentu dostatek Ä‚ĹźdajÄąĹ» pro rozpoznÄ‚Ë‡nÄ‚Â­ role osoby, ale role nenÄ‚Â­ pojmenovÄ‚Ë‡na pÄąâ„˘esnĂ„â€ş, urĂ„Ĺ¤ete ji podle kontextu dokumentu.

CÄ‚Â­lem je vÄąÄľdy:
- pÄąâ„˘eĂ„Ĺ¤Ä‚Â­st celÄ‚Â© PDF
- urĂ„Ĺ¤it typ dokumentu
- urĂ„Ĺ¤it role Ä‚ĹźĂ„Ĺ¤astnÄ‚Â­kÄąĹ»
- vyhodnotit relevantnost Ä‚ĹźdajÄąĹ»
- vytĂ„â€şÄąÄľit vÄąË‡echny relevantnÄ‚Â­ identifikaĂ„Ĺ¤nÄ‚Â­ Ä‚Ĺźdaje pro danÄ‚Ëť typ dokumentu
- nic podstatnÄ‚Â©ho nevynechat

### DOPLÄąâ€ˇUJÄ‚Ĺ¤CÄ‚Ĺ¤ PRAVIDLO PRO EXTRAKCI Ä‚ĹˇĂ„ĹšASTNÄ‚Ĺ¤KÄąÂ®

U Ä‚ĹźĂ„Ĺ¤astnÄ‚Â­kÄąĹ» Äąâ„˘Ä‚Â­zenÄ‚Â­ vÄąÄľdy samostatnĂ„â€ş vyhodnocuj:
- kdo je hlavnÄ‚Â­ osoba nebo subjekt
- jakÄ‚Ë‡ je jeho role v dokumentu
- kterÄ‚Â© identifikaĂ„Ĺ¤nÄ‚Â­ Ä‚Ĺźdaje k nĂ„â€şmu patÄąâ„˘Ä‚Â­
- kterÄ‚Â© z tĂ„â€şchto Ä‚ĹźdajÄąĹ» jsou relevantnÄ‚Â­ pro vÄ‚Ëťstup

Neber pouze prvnÄ‚Â­ nalezenÄ‚Ëť Ä‚Ĺźdaj. VÄąÄľdy zkontroluj, zda nejsou v dalÄąË‡Ä‚Â­ch Ă„Ĺ¤Ä‚Ë‡stech PDF uvedeny doplÄąÂujÄ‚Â­cÄ‚Â­ nebo pÄąâ„˘esnĂ„â€şjÄąË‡Ä‚Â­ identifikaĂ„Ĺ¤nÄ‚Â­ Ä‚Ĺźdaje stejnÄ‚Â©ho Ä‚ĹźĂ„Ĺ¤astnÄ‚Â­ka.
`;


const PDF_IDENTITY_SPLIT_RULES = `
### PRAVIDLO PRO ODDĂ„ĹˇLENÄ‚Ĺ¤ IDENTIFIKAĂ„ĹšNÄ‚Ĺ¤CH Ä‚ĹˇDAJÄąÂ® ODESÄ‚Ĺ¤LATELE

Pole senderName smÄ‚Â­ obsahovat pouze:
- jmÄ‚Â©no a pÄąâ„˘Ä‚Â­jmenÄ‚Â­ fyzickÄ‚Â© osoby
- nebo nÄ‚Ë‡zev prÄ‚Ë‡vnickÄ‚Â© osoby

Do pole senderName nikdy nevklÄ‚Ë‡dej:
- adresu
- rodnÄ‚Â© Ă„Ĺ¤Ä‚Â­slo
- datum narozenÄ‚Â­
- IĂ„ĹšO
- datovou schrÄ‚Ë‡nku
- e-mail
- telefon
- vÄ‚Â­ceÄąâ„˘Ä‚Ë‡dkovÄ‚Ëť identifikaĂ„Ĺ¤nÄ‚Â­ blok

Pole senderAddress smÄ‚Â­ obsahovat pouze adresu nebo doruĂ„Ĺ¤ovacÄ‚Â­ adresu odesÄ‚Â­latele.

Pokud PDF obsahuje identifikaĂ„Ĺ¤nÄ‚Â­ Ä‚Ĺźdaje fyzickÄ‚Â© osoby, rozdĂ„â€şl je takto:
- jmÄ‚Â©no a pÄąâ„˘Ä‚Â­jmenÄ‚Â­ -> senderName
- adresa -> senderAddress
- datum narozenÄ‚Â­ -> senderBirthDate
- rodnÄ‚Â© Ă„Ĺ¤Ä‚Â­slo -> senderBirthNumber

Pokud PDF obsahuje identifikaĂ„Ĺ¤nÄ‚Â­ Ä‚Ĺźdaje prÄ‚Ë‡vnickÄ‚Â© osoby, rozdĂ„â€şl je takto:
- nÄ‚Ë‡zev subjektu -> senderName
- sÄ‚Â­dlo -> senderAddress
- IĂ„ĹšO -> senderIco

Pokud nĂ„â€şkterÄ‚Ëť z tĂ„â€şchto Ä‚ĹźdajÄąĹ» nenÄ‚Â­ jistÄ‚Ëť, nehÄ‚Ë‡dej ho a vraÄąÄ„ prÄ‚Ë‡zdnÄ‚Ëť Äąâ„˘etĂ„â€şzec.
`;

function normalizeText(value) {
  return String(value || "").trim();
}

function sanitizeSenderName(value) {
  const raw = normalizeText(value);
  if (!raw) return "";

  return raw
    .split(/\n|,/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => {
      const lower = s.toLowerCase();
      if (lower.includes("r. Ă„Ĺ¤")) return false;
      if (lower.includes("rodnÄ‚Â© Ă„Ĺ¤Ä‚Â­slo")) return false;
      if (lower.includes("nar.")) return false;
      if (lower.includes("narozen")) return false;
      if (lower.includes("datum narozenÄ‚Â­")) return false;
      if (lower.includes("iĂ„Ĺ¤o")) return false;
      if (/\d{6}\/?\d{3,4}/.test(s)) return false;
      if (/\d/.test(s) && /\d{3}\s?\d{2}/.test(s) && /[A-Za-z]/.test(s)) return false;
      return true;
    })
    .join(" ")
    .trim();
}

function sanitizeSenderAddress(value) {
  const raw = normalizeText(value);
  if (!raw) return "";

  return raw
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => {
      const lower = s.toLowerCase();
      if (lower.includes("r. Ă„Ĺ¤")) return false;
      if (lower.includes("rodnÄ‚Â© Ă„Ĺ¤Ä‚Â­slo")) return false;
      if (lower.includes("nar.")) return false;
      if (lower.includes("narozen")) return false;
      if (lower.includes("datum narozenÄ‚Â­")) return false;
      if (lower.includes("iĂ„Ĺ¤o")) return false;
      if (lower.includes("datovÄ‚Ë‡ schrÄ‚Ë‡nka")) return false;
      if (lower.includes("e-mail")) return false;
      if (lower.includes("telefon")) return false;
      if (/\d{6}\/?\d{3,4}/.test(s)) return false;
      if (/^iĂ„Ĺ¤o[:\s]/i.test(s)) return false;
      return true;
    })
    .join(", ")
    .trim();
}


function buildSearchText(...parts) {
  return parts.map((p) => normalizeText(p).toLowerCase()).filter(Boolean).join(" ");
}

function dedupeById(list) {
  const seen = new Map();
  for (const item of list) seen.set(item.id, item);
  return [...seen.values()];
}

function countAllContacts() {
  return Object.values(contactStore).reduce((sum, arr) => sum + arr.length, 0);
}

function mergeContacts(imported) {
  for (const key of Object.keys(contactStore)) {
    contactStore[key] = dedupeById([...(contactStore[key] || []), ...(imported[key] || [])]);
  }
}

function getAllContacts(category = "all", q = "") {
  const cats = category === "all" ? Object.keys(contactStore) : [category];
  const query = normalizeText(q).toLowerCase();
  const result = [];

  for (const cat of cats) {
    for (const item of contactStore[cat] || []) {
      if (!query || item.search.includes(query)) result.push(item);
    }
  }

  return result;
}

function safeJsonParse(text) {
  const cleaned = String(text || "").replace(/```json/gi, "").replace(/```/g, "").trim();
  return JSON.parse(cleaned);
}

function normalizeExekutorRecord(ex, idx) {
  const fullName = normalizeText(ex.jmeno_plne) || [ex.titul_pred, ex.jmeno, ex.prijmeni].filter(Boolean).join(" ").trim() || "Neuvedeno";
  const street = normalizeText(ex.adresa?.ulice);
  const city = normalizeText(ex.adresa?.mesto);
  const psc = normalizeText(ex.adresa?.psc);
  const fullAddress = [street, city, psc].filter(Boolean).join(", ");
  const mesto = city || normalizeText(ex.urad) || "Neuvedeno";
  const ds = normalizeText(ex.datova_schranka) || "---";
  const tel = normalizeText(ex.telefon_display?.[0]) || normalizeText(ex.telefon?.[0]) || "---";
  const email = normalizeText(ex.email) || "---";
  const web = normalizeText(ex.web_display) || normalizeText(ex.web) || "---";

  return {
    id: `ex_${normalizeText(ex.cislo) || idx}`,
    nazev: `Exekutorsk\u00fd \u00fa\u0159ad: ${fullName}`, 
    mesto,
    adresa: fullAddress || mesto,
    ds,
    tel,
    email,
    web,
    
oteviraciDoba:
  normalizeText(ex.oteviraci_doba_text) ||
  normalizeText(ex.uredni_hodiny_osobni_text) ||
  "---",

    category: "exekutori",
    source: normalizeText(ex.zdroj) || "default-exekutori",
    search: buildSearchText(fullName, fullAddress, mesto, ds, tel, email, web)
  };
}

function normalizeUnifiedRecord(item, idx) {
  const type = normalizeText(item.typ_subjektu);
  let targetCat = null;
  if (type === "banka") targetCat = "banky";
  if (type === "pojistovna" || type === "zdravotni_pojistovna") targetCat = "pojistovny";
  if (type === "socialni_zabezpeceni") targetCat = "ossz";
  if (type === "soud") targetCat = "soudy";
  if (!targetCat) return null;

  const nazev = normalizeText(item.nazev_subjektu) || "Neuvedeno";
  const mesto = normalizeText(item.nejblizsi_fyzicka_pobocka) || normalizeText(item.kraj) || normalizeText(item.adresa_pobocky) || "Ä‚ĹˇstÄąâ„˘edÄ‚Â­";
  const adresa = normalizeText(item.adresa_pobocky) || normalizeText(item.nejblizsi_fyzicka_pobocka) || normalizeText(item.kraj) || "Neuvedeno";
  const ds = normalizeText(item.datova_schranka) || "---";
  const tel = normalizeText(item.telefon) || "---";
  const email = normalizeText(item.email) || "---";
  const web = normalizeText(item.web_kontakt) || "---";
  const oteviraciDoba = normalizeText(item.oteviraci_doba) || "---";
  const code = normalizeText(item.kod_subjektu);

  return {
    id: `imp_${targetCat}_${code || idx}_${nazev}`,
    nazev: code ? `${nazev} (${code})` : nazev,
    mesto,
    adresa,
    ds,
    tel,
    email,
    web,
    oteviraciDoba,
    category: targetCat,
    source: normalizeText(item.zdroj) || "default-core",
    search: buildSearchText(nazev, code, mesto, adresa, ds, tel, email, web, item.kraj, oteviraciDoba)
  };
}

function normalizeContactsFromJson(parsed) {
  const out = { exekutori: [], banky: [], ossz: [], pojistovny: [], soudy: [] };

  if (Array.isArray(parsed) && (parsed[0]?.jmeno_plne || parsed[0]?.prijmeni)) {
    parsed.forEach((ex, idx) => out.exekutori.push(normalizeExekutorRecord(ex, idx)));
    return out;
  }

  if (parsed?.data && Array.isArray(parsed.data)) {
    parsed.data.forEach((item, idx) => {
      const normalized = normalizeUnifiedRecord(item, idx);
      if (!normalized) return;
      out[normalized.category].push(normalized);
    });
    return out;
  }

  throw new Error("NepodporovanÄ‚Ëť formÄ‚Ë‡t JSON.");
}

function loadContactsFromFiles() {
  let loadedFiles = 0;
  for (const filePath of DATA_FILES) {
    if (!fs.existsSync(filePath)) {
      console.log(`VÄ‚ËťchozÄ‚Â­ soubor nebyl nalezen: ${path.basename(filePath)}`);
      continue;
    }

    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      const imported = normalizeContactsFromJson(parsed);
      mergeContacts(imported);
      loadedFiles += 1;
      const importedCount = Object.values(imported).reduce((sum, arr) => sum + arr.length, 0);
      console.log(`NaĂ„Ĺ¤ten soubor ${path.basename(filePath)}: ${importedCount} zÄ‚Ë‡znamÄąĹ»`);
    } catch (error) {
      console.error(`Chyba pÄąâ„˘i naĂ„Ĺ¤Ä‚Â­tÄ‚Ë‡nÄ‚Â­ ${path.basename(filePath)}: ${error.message}`);
    }
  }
  console.log(`VÄ‚ËťchozÄ‚Â­ soubory naĂ„Ĺ¤teny: ${loadedFiles}/${DATA_FILES.length}`);
  console.log(`Celkem kontaktÄąĹ» po startu: ${countAllContacts()}`);
}

async function postToGemini(body) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "NeznÄ‚Ë‡mÄ‚Ë‡ chyba AI sluÄąÄľby.");
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("AI nevrÄ‚Ë‡tila ÄąÄľÄ‚Ë‡dnÄ‚Ëť obsah.");
  return safeJsonParse(text);
}



function detectDocumentType(prompt = "", aiContext = "") {
  const text = `${normalizeText(prompt)} ${normalizeText(aiContext)}`.toLowerCase();
  if (text.includes("splÄ‚Ë‡tkovÄ‚Ëť kalendÄ‚Ë‡Äąâ„˘") || text.includes("splatkovy kalendar")) return "installment";
  if (text.includes("zastavenÄ‚Â­ exekuce") || text.includes("zastaveni exekuce")) return "stop_execution";
  if (text.includes("odklad exekuce") || text.includes("odklad vÄ‚Ëťkonu") || text.includes("odklad vykonu")) return "postponement";
  if (text.includes("souĂ„Ĺ¤innost") || text.includes("soucinnost")) return "cooperation";
  if (text.includes("vyÄąË‡krtnutÄ‚Â­ ze soupisu") || text.includes("vyÄąË‡krtnuti ze soupisu")) return "exclusion";
  if (text.includes("slouĂ„Ĺ¤enÄ‚Â­ exekucÄ‚Â­") || text.includes("slouceni exekuci")) return "merge_executions";
  if (text.includes("vyluĂ„Ĺ¤ovacÄ‚Â­ ÄąÄľaloba") || text.includes("vylucovaci zaloba")) return "exclusion_lawsuit";
  if (text.includes("pÄąâ„˘eruÄąË‡enÄ‚Â­ oddluÄąÄľenÄ‚Â­") || text.includes("preruseni oddluzeni")) return "debt_relief_pause";
  if (text.includes("odpor proti platebnÄ‚Â­mu rozkazu") || text.includes("odpor proti platebnimu rozkazu")) return "payment_order_opposition";
  return "generic";
}

function getDocumentProfile(type) {
  const profiles = {
    installment: {
      label: "NÄ‚ÂVRH SPLÄ‚ÂTKOVÄ‚â€°HO KALENDÄ‚ÂÄąÂE",
      system: "Jde o nÄ‚Ë‡vrh dobrovolnÄ‚Â©ho splÄ‚Ë‡tkovÄ‚Â©ho kalendÄ‚Ë‡Äąâ„˘e adresovanÄ‚Ëť vĂ„â€şÄąâ„˘iteli nebo instituci. Nejde o soudnÄ‚Â­ ÄąÄľalobu ani procesnÄ‚Â­ nÄ‚Ë‡vrh. PiÄąË‡ smÄ‚Â­rnĂ„â€ş, vĂ„â€şcnĂ„â€ş a prakticky. NenazÄ‚Ëťvej text uznÄ‚Ë‡nÄ‚Â­m dluhu, pokud to vÄ‚ËťslovnĂ„â€ş neplyne z kontextu.",
      user: "UveĂ„Ĺą realistickÄ‚Ëť nÄ‚Ë‡vrh splÄ‚Ë‡cenÄ‚Â­, dÄąĹ»vod ÄąÄľÄ‚Ë‡dosti a zdÄąĹ»razni snahu o dobrovolnÄ‚Â© Äąâ„˘eÄąË‡enÄ‚Â­ zÄ‚Ë‡vazku."
    },
    stop_execution: {
      label: "NÄ‚ÂVRH NA ZASTAVENÄ‚Ĺ¤ EXEKUCE",
      system: "Jde o procesnÄ‚Â­ nÄ‚Ë‡vrh na zastavenÄ‚Â­ exekuce. Text musÄ‚Â­ mÄ‚Â­t styl formÄ‚Ë‡lnÄ‚Â­ho procesnÄ‚Â­ho podÄ‚Ë‡nÄ‚Â­. V zÄ‚Ë‡vĂ„â€şru musÄ‚Â­ bÄ‚Ëťt jasnÄ‚Ëť nÄ‚Ë‡vrh, aby exekuce byla zastavena v uvedenÄ‚Â©m rozsahu. Pracuj pÄąâ„˘esnĂ„â€ş se skutkovÄ‚Ëťmi tvrzenÄ‚Â­mi, dÄąĹ»vody a dÄąĹ»kazy uvedenÄ‚Ëťmi v kontextu.",
      user: "Zachovej procesnÄ‚Â­ styl a oddĂ„â€şl skutkovÄ‚Ëť stav, prÄ‚Ë‡vnÄ‚Â­ dÄąĹ»vody, dÄąĹ»kazy a nÄ‚Ë‡vrh vÄ‚Ëťroku."
    },
    postponement: {
      label: "ÄąËťÄ‚ÂDOST O ODKLAD EXEKUCE",
      system: "Jde o ÄąÄľÄ‚Ë‡dost o odklad exekuce. Nejde o zastavenÄ‚Â­ exekuce ani o ÄąÄľalobu. ZdÄąĹ»razni doĂ„Ĺ¤asnost pÄąâ„˘ekÄ‚Ë‡ÄąÄľek, pÄąâ„˘imĂ„â€şÄąâ„˘enost odkladu a oĂ„Ĺ¤ekÄ‚Ë‡vanÄ‚Â© obnovenÄ‚Â­ plnĂ„â€şnÄ‚Â­ nebo jinÄ‚Â© Äąâ„˘eÄąË‡enÄ‚Â­.",
      user: "PopiÄąË‡ konkrÄ‚Â©tnÄ‚Â­ dÄąĹ»vody odkladu, navrÄąÄľenou dobu a oĂ„Ĺ¤ekÄ‚Ë‡vanÄ‚Ëť dalÄąË‡Ä‚Â­ vÄ‚Ëťvoj."
    },
    cooperation: {
      label: "ÄąËťÄ‚ÂDOST O SOUĂ„ĹšINNOST",
      system: "Jde o ÄąÄľÄ‚Ë‡dost o souĂ„Ĺ¤innost nebo poskytnutÄ‚Â­ informacÄ‚Â­ Ă„Ĺ¤i listin. Nejde o ÄąÄľalobu ani o nÄ‚Ë‡vrh na soudnÄ‚Â­ rozhodnutÄ‚Â­. Text mÄ‚Ë‡ bÄ‚Ëťt struĂ„Ĺ¤nÄ‚Ëť, vĂ„â€şcnÄ‚Ëť a pÄąâ„˘esnĂ„â€ş popsat, jakou souĂ„Ĺ¤innost mÄ‚Ë‡ adresÄ‚Ë‡t poskytnout.",
      user: "UveĂ„Ĺą pÄąâ„˘esnĂ„â€ş, co se ÄąÄľÄ‚Ë‡dÄ‚Ë‡, proĂ„Ĺ¤ je to potÄąâ„˘ebnÄ‚Â© a v jakÄ‚Â© pÄąâ„˘imĂ„â€şÄąâ„˘enÄ‚Â© lhÄąĹ»tĂ„â€ş mÄ‚Ë‡ bÄ‚Ëťt souĂ„Ĺ¤innost poskytnuta."
    },
    exclusion: {
      label: "NÄ‚ÂVRH NA VYÄąÂ KRTNUTÄ‚Ĺ¤ VĂ„ĹˇCI ZE SOUPISU EXEKUCE",
      system: "Jde o nÄ‚Ë‡vrh na vyÄąË‡krtnutÄ‚Â­ vĂ„â€şci ze soupisu exekuce. DÄąĹ»raz dej na tvrzenÄ‚Â­ o vlastnictvÄ‚Â­ tÄąâ„˘etÄ‚Â­ osoby nebo jinÄ‚Â©m prÄ‚Ë‡vu vyluĂ„Ĺ¤ujÄ‚Â­cÄ‚Â­m soupis. UveĂ„Ĺą popis vĂ„â€şci, dÄąĹ»vody, dÄąĹ»kazy a jasnÄ‚Ëť nÄ‚Ë‡vrh na vyÄąË‡krtnutÄ‚Â­.",
      user: "ZdÄąĹ»razni vlastnickÄ‚Â© prÄ‚Ë‡vo, identifikaci vĂ„â€şci a dÄąĹ»kazy, kterÄ‚Â© vlastnictvÄ‚Â­ podporujÄ‚Â­."
    },
    merge_executions: {
      label: "NÄ‚ÂVRH NA SLOUĂ„ĹšENÄ‚Ĺ¤ EXEKUCÄ‚Ĺ¤",
      system: "Jde o nÄ‚Ë‡vrh na spojenÄ‚Â­ nebo slouĂ„Ĺ¤enÄ‚Â­ exekuĂ„Ĺ¤nÄ‚Â­ch Äąâ„˘Ä‚Â­zenÄ‚Â­. Text mÄ‚Ë‡ bÄ‚Ëťt procesnÄ‚Â­, pÄąâ„˘ehlednÄ‚Ëť a musÄ‚Â­ vysvĂ„â€ştlit, proĂ„Ĺ¤ je spojenÄ‚Â­ Ä‚ĹźĂ„Ĺ¤elnÄ‚Â© a hospodÄ‚Ë‡rnÄ‚Â©. V zÄ‚Ë‡vĂ„â€şru formuluj jasnÄ‚Ëť nÄ‚Ë‡vrh na spojenÄ‚Â­ Äąâ„˘Ä‚Â­zenÄ‚Â­.",
      user: "ZvÄ‚Ëťrazni spoleĂ„Ĺ¤nÄ‚Â©ho oprÄ‚Ë‡vnĂ„â€şnÄ‚Â©ho, totoÄąÄľnost Ä‚ĹźĂ„Ĺ¤astnÄ‚Â­kÄąĹ», pÄąâ„˘ehled Äąâ„˘Ä‚Â­zenÄ‚Â­ a dÄąĹ»vody hospodÄ‚Ë‡rnosti."
    },
    exclusion_lawsuit: {
      label: "VYLUĂ„ĹšOVACÄ‚Ĺ¤ ÄąËťALOBA",
      system: "Jde o vyluĂ„Ĺ¤ovacÄ‚Â­ ÄąÄľalobu podÄ‚Ë‡vanou k soudu. Text musÄ‚Â­ mÄ‚Â­t procesnÄ‚Â­ soudnÄ‚Â­ styl a zÄąâ„˘etelnĂ„â€ş oddĂ„â€şlenÄ‚Â© Ä‚ĹźĂ„Ĺ¤astnÄ‚Â­ky, skutkovÄ‚Ëť stav, dÄąĹ»kazy a ÄąÄľalobnÄ‚Â­ nÄ‚Ë‡vrh. Nejde o pouhou ÄąÄľÄ‚Ë‡dost ani dopis exekutorovi.",
      user: "V zÄ‚Ë‡vĂ„â€şru uveĂ„Ĺą ÄąÄľalobnÄ‚Â­ petit smĂ„â€şÄąâ„˘ujÄ‚Â­cÄ‚Â­ k vylouĂ„Ĺ¤enÄ‚Â­ vĂ„â€şci z exekuce a pÄąâ„˘Ä‚Â­padnĂ„â€ş i nÄ‚Ë‡vrh na nÄ‚Ë‡hradu nÄ‚Ë‡kladÄąĹ»."
    },
    debt_relief_pause: {
      label: "ÄąËťÄ‚ÂDOST O PÄąÂERUÄąÂ ENÄ‚Ĺ¤ ODDLUÄąËťENÄ‚Ĺ¤",
      system: "Jde o ÄąÄľÄ‚Ë‡dost v insolvenĂ„Ĺ¤nÄ‚Â­ vĂ„â€şci o pÄąâ„˘eruÄąË‡enÄ‚Â­ oddluÄąÄľenÄ‚Â­. Nejde o exekuĂ„Ĺ¤nÄ‚Â­ podÄ‚Ë‡nÄ‚Â­. Text mÄ‚Ë‡ zdÄąĹ»raznit doĂ„Ĺ¤asnÄ‚Â© pÄąâ„˘ekÄ‚Ë‡ÄąÄľky plnĂ„â€şnÄ‚Â­, jejich zÄ‚Ë‡vaÄąÄľnost a oĂ„Ĺ¤ekÄ‚Ë‡vanÄ‚Â© obnovenÄ‚Â­ Äąâ„˘Ä‚Ë‡dnÄ‚Â©ho plnĂ„â€şnÄ‚Â­.",
      user: "UveĂ„Ĺą dÄąĹ»vody pÄąâ„˘eruÄąË‡enÄ‚Â­, navrÄąÄľenou dobu a informaci, jak a kdy se mÄ‚Ë‡ obnovit plnĂ„â€şnÄ‚Â­ povinnostÄ‚Â­."
    },
    payment_order_opposition: {
      label: "ODPOR PROTI PLATEBNÄ‚Ĺ¤MU ROZKAZU",
      system: "Jde o procesnÄ‚Â­ odpor proti platebnÄ‚Â­mu rozkazu. Text mÄ‚Ë‡ mÄ‚Â­t procesnÄ‚Â­ charakter a musÄ‚Â­ jasnĂ„â€ş uvÄ‚Â©st, ÄąÄľe je podÄ‚Ë‡vÄ‚Ë‡n v zÄ‚Ë‡konnÄ‚Â© lhÄąĹ»tĂ„â€ş. Nejde o odvolÄ‚Ë‡nÄ‚Â­ ani obecnou nÄ‚Ë‡mitku.",
      user: "ZdÄąĹ»razni, ÄąÄľe jde o odpor, uveĂ„Ĺą identifikaci rozhodnutÄ‚Â­ a struĂ„Ĺ¤nÄ‚Â©, ale konkrÄ‚Â©tnÄ‚Â­ odÄąĹ»vodnĂ„â€şnÄ‚Â­, pokud je v kontextu k dispozici."
    },
    generic: {
      label: "Ä‚ĹˇÄąÂEDNÄ‚Ĺ¤ LISTINA",
      system: "Jde o obecnou formÄ‚Ë‡lnÄ‚Â­ Ä‚ĹźÄąâ„˘ednÄ‚Â­ listinu. PiÄąË‡ vĂ„â€şcnĂ„â€ş, pÄąâ„˘ehlednĂ„â€ş a bez vymÄ‚ËťÄąË‡lenÄ‚Â­ skuteĂ„Ĺ¤nostÄ‚Â­.",
      user: "PouÄąÄľij poskytnutÄ‚Ëť kontext a vytvoÄąâ„˘ logicky strukturovanÄ‚Â© podÄ‚Ë‡nÄ‚Â­ nebo dopis podle jeho obsahu."
    }
  };
  return profiles[type] || profiles.generic;
}

async function callGemini({ prompt, aiContext, recipient, pdfBase64 }) {
  const documentType = detectDocumentType(prompt, aiContext);
  const profile = getDocumentProfile(documentType);

  const systemPrompt = [
    "Jsi pÄąâ„˘esnÄ‚Ëť prÄ‚Ë‡vnÄ‚Â­ asistent.",
    `Typ dokumentu: ${profile.label}.`,
    profile.system,
    PDF_RELEVANCE_RULES,
    PDF_IDENTITY_SPLIT_RULES,
    "VytvoÄąâ„˘ formÄ‚Ë‡lnÄ‚Â­ Ä‚ĹźÄąâ„˘ednÄ‚Â­ listinu v Ă„Ĺ¤eÄąË‡tinĂ„â€ş odpovÄ‚Â­dajÄ‚Â­cÄ‚Â­ typu dokumentu.",
    "PouÄąÄľij Ä‚Ĺźdaje o odesÄ‚Â­lateli z pÄąâ„˘iloÄąÄľenÄ‚Â©ho PDF, pokud jsou Ă„Ĺ¤itelnÄ‚Â©.",
    `PÄąâ„˘Ä‚Â­jemce: ${recipient.nazev}, adresa nebo mĂ„â€şsto: ${recipient.adresa || recipient.mesto}, datovÄ‚Ë‡ schrÄ‚Ë‡nka: ${recipient.ds}.`,
    "NevymÄ‚ËťÄąË‡lej skutkovÄ‚Ë‡ tvrzenÄ‚Â­, data ani prÄ‚Ë‡vnÄ‚Â­ dÄąĹ»vody, kterÄ‚Â© nejsou v promptu, kontextu nebo PDF.",
    "Pokud nĂ„â€şkterÄ‚Ëť Ä‚Ĺźdaj chybÄ‚Â­, napiÄąË‡ text neutrÄ‚Ë‡lnĂ„â€ş a bez doplÄąÂovÄ‚Ë‡nÄ‚Â­ smyÄąË‡lenÄ‚Ëťch detailÄąĹ».",
    "TĂ„â€şlo listiny musÄ‚Â­ bÄ‚Ëťt vĂ„â€şcnÄ‚Â©, pÄąâ„˘ehlednÄ‚Â© a pÄąâ„˘izpÄąĹ»sobenÄ‚Â© konkrÄ‚Â©tnÄ‚Â­mu typu podÄ‚Ë‡nÄ‚Â­.",
    "VraÄąÄ„ pouze validnÄ‚Â­ JSON bez markdownu.",
    'PouÄąÄľij schÄ‚Â©ma: {"senderName":"","senderAddress":"","senderBirthDate":"","senderBirthNumber":"","senderIco":"","refData":"","title":"","body":""}'
  ].join(" ");

  const userQuery = [
    `Ä‚ĹˇĂ„Ĺ¤el listiny: ${prompt}`,
    `RozpoznanÄ‚Ëť typ listiny: ${profile.label}`,
    `DoplÄąÂujÄ‚Â­cÄ‚Â­ pokyn pro tento typ: ${profile.user}`,
    `DoplÄąÂujÄ‚Â­cÄ‚Â­ kontext: ${aiContext || "Bez dalÄąË‡Ä‚Â­ho kontextu."}`,
    "TÄ‚Ĺ‚n: formÄ‚Ë‡lnÄ‚Â­, vĂ„â€şcnÄ‚Ëť, Ä‚ĹźÄąâ„˘ednÄ‚Â­.",
    "NÄ‚Ë‡zev listiny dej VELKÄ‚ĹĄMI PÄ‚Ĺ¤SMENY.",
    "Pokud jde o procesnÄ‚Â­ podÄ‚Ë‡nÄ‚Â­, zakonĂ„Ĺ¤i text jasnÄ‚Ëťm nÄ‚Ë‡vrhem nebo petitem odpovÄ‚Â­dajÄ‚Â­cÄ‚Â­m danÄ‚Â©mu typu listiny."
  ].join("\n");

  const parts = [{ text: userQuery }];

  if (pdfBase64) {
    parts.push({
      inlineData: {
        mimeType: "application/pdf",
        data: pdfBase64
      }
    });
  }

  const parsed = await postToGemini({
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ parts }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.15
    }
  });

  return {
    senderName: sanitizeSenderName(parsed.senderName) || "Neuvedeno",
    senderAddress: sanitizeSenderAddress(parsed.senderAddress) || "Neuvedeno",
    senderBirthDate: normalizeText(parsed.senderBirthDate) || "",
    senderBirthNumber: normalizeText(parsed.senderBirthNumber) || "",
    senderIco: normalizeText(parsed.senderIco) || "",
    refData: normalizeText(parsed.refData) || "---",
    title: normalizeText(parsed.title) || profile.label,
    body: normalizeText(parsed.body) || ""
  };
}

async function extractDebtAmountFromPdf(pdfBase64) {
  const parsed = await postToGemini({
    systemInstruction: {
      parts: [{
        text: [
          "Jsi pÄąâ„˘esnÄ‚Ëť extraktor Ä‚ĹźdajÄąĹ» z prÄ‚Ë‡vnÄ‚Â­ch dokumentÄąĹ».",
          PDF_RELEVANCE_RULES,
          "Najdi v PDF dluÄąÄľnou Ă„Ĺ¤Ä‚Ë‡stku nebo vymÄ‚Ë‡hanou Ă„Ĺ¤Ä‚Ë‡stku.",
          "VraÄąÄ„ pouze validnÄ‚Â­ JSON bez markdownu.",
          'PouÄąÄľij schÄ‚Â©ma: {"debtAmount":""}'
        ].join(" ")
      }]
    },
    contents: [{ parts: [{ text: "Vyhledej v PDF dluÄąÄľnou Ă„Ĺ¤Ä‚Ë‡stku. VraÄąÄ„ ji jako Ă„Ĺ¤Ä‚Â­slo bez mĂ„â€şny, ideÄ‚Ë‡lnĂ„â€ş ve formÄ‚Ë‡tu 12500.50. Pokud ji nenajdeÄąË‡, vraÄąÄ„ prÄ‚Ë‡zdnÄ‚Ëť Äąâ„˘etĂ„â€şzec." }, { inlineData: { mimeType: "application/pdf", data: pdfBase64 } }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.1 }
  });
  return normalizeText(parsed.debtAmount);
}

async function extractStopExecutionFromPdf(pdfBase64) {
  return await postToGemini({
    systemInstruction: {
      parts: [{
        text: [
          "Jsi extraktor Ä‚ĹźdajÄąĹ» z exekuĂ„Ĺ¤nÄ‚Â­ch dokumentÄąĹ».",
          PDF_RELEVANCE_RULES,
          "Najdi klÄ‚Â­Ă„Ĺ¤ovÄ‚Â© Ä‚Ĺźdaje pro nÄ‚Ë‡vrh na zastavenÄ‚Â­ exekuce.",
          "VraÄąÄ„ pouze validnÄ‚Â­ JSON bez markdownu.",
          "PouÄąÄľij schÄ‚Â©ma:",
          '{"exekutor":"","exekutorskyUrad":"","adresaUradu":"","spisovaZnacka":"","opravneny":"","povinny":"","exekucniTitul":"","datumVyzvy":""}'
        ].join(" ")
      }]
    },
    contents: [{ parts: [{ text: "VytĂ„â€şÄąÄľ uvedenÄ‚Â© Ä‚Ĺźdaje z PDF. Pokud Ä‚Ĺźdaj nenajdeÄąË‡, vraÄąÄ„ prÄ‚Ë‡zdnÄ‚Ëť Äąâ„˘etĂ„â€şzec." }, { inlineData: { mimeType: "application/pdf", data: pdfBase64 } }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.1 }
  });
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "portal-instituci-local-json", contacts: countAllContacts(), defaultFiles: DATA_FILES.map((p) => path.basename(p)) });
});

app.get("/api/contacts", (req, res) => {
  try {
    const category = req.query.category || "all";
    const q = req.query.q || "";
    const items = getAllContacts(category, q);
    res.json({ ok: true, count: items.length, items });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/api/import-json", upload.single("jsonDb"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: "ChybÄ‚Â­ JSON soubor." });
    if (!["application/json", "text/plain", ""].includes(req.file.mimetype)) {
      return res.status(400).json({ ok: false, error: "Soubor musÄ‚Â­ bÄ‚Ëťt JSON." });
    }
    const parsed = JSON.parse(req.file.buffer.toString("utf-8"));
    const imported = normalizeContactsFromJson(parsed);
    mergeContacts(imported);
    const importedCount = Object.values(imported).reduce((sum, arr) => sum + arr.length, 0);
    res.json({ ok: true, importedCount, totalCount: countAllContacts(), data: contactStore });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});


app.post("/api/extract-debt", upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: "ChybÄ‚Â­ PDF soubor." });
    const debtAmount = await extractDebtAmountFromPdf(req.file.buffer.toString("base64"));
    res.json({ ok: true, debtAmount });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || "NepodaÄąâ„˘ilo se naĂ„Ĺ¤Ä‚Â­st dluÄąÄľnou Ă„Ĺ¤Ä‚Ë‡stku z PDF." });
  }
});

app.post("/api/extract-stop-execution", upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: "ChybÄ‚Â­ PDF soubor." });
    const data = await extractStopExecutionFromPdf(req.file.buffer.toString("base64"));
    res.json({ ok: true, data });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || "Extrakce Ä‚ĹźdajÄąĹ» z PDF selhala." });
  }
});

app.post("/api/generate", upload.single("pdf"), async (req, res) => {
  try {
    const prompt = normalizeText(req.body.prompt);
    const aiContext = normalizeText(req.body.aiContext);
    const recipientRaw = req.body.recipient;

    if (!prompt || prompt.length < 3) {
      return res.status(400).json({ ok: false, error: "Prompt je pÄąâ„˘Ä‚Â­liÄąË‡ krÄ‚Ë‡tkÄ‚Ëť." });
    }

    let recipient = {
      nazev: "PÄąâ„˘Ä‚Â­jemce neuveden",
      adresa: "",
      mesto: "",
      ds: ""
    };

    if (recipientRaw) {
      try {
        const parsedRecipient = JSON.parse(recipientRaw);
        recipient = {
          nazev: parsedRecipient?.nazev || "PÄąâ„˘Ä‚Â­jemce neuveden",
          adresa: parsedRecipient?.adresa || "",
          mesto: parsedRecipient?.mesto || "",
          ds: parsedRecipient?.ds || ""
        };
      } catch {
        return res.status(400).json({ ok: false, error: "PÄąâ„˘Ä‚Â­jemce nenÄ‚Â­ validnÄ‚Â­ JSON." });
      }
    }

    const result = await callGemini({
      prompt,
      aiContext,
      recipient,
      pdfBase64: req.file ? req.file.buffer.toString("base64") : null
    });

    res.json({ ok: true, document: result });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message || "GenerovÄ‚Ë‡nÄ‚Â­ selhalo."
    });
  }
});


app.post("/api/export-docx", async (req, res) => {
  try {
    const {
      senderName,
      senderAddress,
      senderBirthDate,
      senderBirthNumber,
      senderIco,
      recipientName,
      recipientAddress,
      refData,
      dateText,
      title,
      body
    } = req.body || {};

    const letterheadTitle = "Osobla\u017esk\u00fd cech, z. \u00fa. - Dluhov\u00e9 a pracovn\u00ed poradenstv\u00ed na Osobla\u017esku";
    const letterheadSubtitle = "Hlinka 25, 793 99 Hlinka | I\u010cO 01937324 | www.osoblazskycech.cz | info@osoblazskycech.cz";

    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: 1700,
                right: 1440,
                bottom: 1440,
                left: 1440
              }
            }
          },
          headers: {
            default: new Header({
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 80 },
                  children: [new TextRun({ text: letterheadTitle, bold: true, size: 20 })]
                }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 240 },
                  children: [new TextRun({ text: letterheadSubtitle, size: 18 })]
                })
              ]
            })
          },
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: "ODES\u00cdLATEL:", bold: true }),
                new TextRun({ text: ` ${senderName || "---"}` })
              ]
            }),
            new Paragraph(senderAddress || "---"),
            ...(senderBirthDate ? [new Paragraph({ children: [new TextRun({ text: "DATUM NAROZEN\u00cd: ", bold: true }), new TextRun(senderBirthDate)] })] : []),
            ...(senderBirthNumber ? [new Paragraph({ children: [new TextRun({ text: "RODN\u00c9 \u010c\u00cdSLO: ", bold: true }), new TextRun(senderBirthNumber)] })] : []),
            ...(senderIco ? [new Paragraph({ children: [new TextRun({ text: "I\u010cO: ", bold: true }), new TextRun(senderIco)] })] : []),
            new Paragraph(""),
            new Paragraph({
              children: [
                new TextRun({ text: "P\u0158\u00cdJEMCE:", bold: true }),
                new TextRun({ text: ` ${recipientName || "---"}` })
              ]
            }),
            new Paragraph(recipientAddress || "---"),
            new Paragraph(""),
            new Paragraph({
              children: [
                new TextRun({ text: "NA\u0160E \u010c.J.: ", bold: true }),
                new TextRun(refData || "---")
              ]
            }),
            new Paragraph({
              children: [
                new TextRun({ text: "DATUM A M\u00cdSTO: ", bold: true }),
                new TextRun(dateText || "---")
              ]
            }),
            new Paragraph(""),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: title || "\u00da\u0158EDN\u00cd LISTINA",
                  bold: true,
                  allCaps: true,
                  size: 28
                })
              ]
            }),
            new Paragraph(""),
            ...(String(body || "")
              .split("\n")
              .map((line) => new Paragraph(line))),
            new Paragraph(""),
            new Paragraph(""),
            new Paragraph("______________________________"),
            new Paragraph("Vlastnoru\u010dn\u00ed podpis")
          ]
        }
      ]
    });

    const buffer = await Packer.toBuffer(doc);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename=\"listina.docx\"'
    );

    res.send(buffer);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message || "Export do DOCX selhal."
    });
  }
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

loadContactsFromFiles();
app.listen(PORT, () => console.log(`Server bĂ„â€şÄąÄľÄ‚Â­ na http://localhost:${PORT}`));

// debt_statement profile already injected in previous step
