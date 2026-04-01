import { Document, Packer, Paragraph, TextRun, AlignmentType } from "docx";
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
  console.error("Chybí GEMINI_API_KEY v .env");
  process.exit(1);
}

app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
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
        frameAncestors: ["'self'"]
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

  // ✅ KLÍČOVÝ ŘÁDEK PRO RENDER
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

function normalizeText(value) {
  return String(value || "").trim();
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
    nazev: `Exekutorský úřad: ${fullName}`,
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
  const mesto = normalizeText(item.nejblizsi_fyzicka_pobocka) || normalizeText(item.kraj) || normalizeText(item.adresa_pobocky) || "Ústředí";
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

  throw new Error("Nepodporovaný formát JSON.");
}

function loadContactsFromFiles() {
  let loadedFiles = 0;
  for (const filePath of DATA_FILES) {
    if (!fs.existsSync(filePath)) {
      console.log(`Výchozí soubor nebyl nalezen: ${path.basename(filePath)}`);
      continue;
    }

    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      const imported = normalizeContactsFromJson(parsed);
      mergeContacts(imported);
      loadedFiles += 1;
      const importedCount = Object.values(imported).reduce((sum, arr) => sum + arr.length, 0);
      console.log(`Načten soubor ${path.basename(filePath)}: ${importedCount} záznamů`);
    } catch (error) {
      console.error(`Chyba při načítání ${path.basename(filePath)}: ${error.message}`);
    }
  }
  console.log(`Výchozí soubory načteny: ${loadedFiles}/${DATA_FILES.length}`);
  console.log(`Celkem kontaktů po startu: ${countAllContacts()}`);
}

async function postToGemini(body) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "Neznámá chyba AI služby.");
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("AI nevrátila žádný obsah.");
  return safeJsonParse(text);
}


async function callGemini({ prompt, aiContext, recipient, pdfBase64 }) {
  const systemPrompt = [
    "Jsi přesný právní asistent.",
    "Vytvoř formální úřední listinu v češtině.",
    "Použij údaje o odesílateli z přiloženého PDF, pokud jsou čitelné.",
    `Příjemce: ${recipient.nazev}, adresa nebo město: ${recipient.adresa || recipient.mesto}, datová schránka: ${recipient.ds}.`,
    "Vrať pouze validní JSON bez markdownu.",
    'Použij schéma: {"senderName":"","senderAddress":"","refData":"","title":"","body":""}'
  ].join(" ");

  const userQuery = [
    `Účel listiny: ${prompt}`,
    `Doplňující kontext: ${aiContext || "Bez dalšího kontextu."}`,
    "Tón: formální, věcný, úřední.",
    "Název listiny dej VELKÝMI PÍSMENY."
  ].join("\\n");

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
      temperature: 0.2
    }
  });

  return {
    senderName: normalizeText(parsed.senderName) || "Neuvedeno",
    senderAddress: normalizeText(parsed.senderAddress) || "Neuvedeno",
    refData: normalizeText(parsed.refData) || "---",
    title: normalizeText(parsed.title) || "ÚŘEDNÍ LISTINA",
    body: normalizeText(parsed.body) || ""
  };
}


async function extractDebtAmountFromPdf(pdfBase64) {
  const parsed = await postToGemini({
    systemInstruction: {
      parts: [{
        text: [
          "Jsi přesný extraktor údajů z právních dokumentů.",
          "Najdi v PDF dlužnou částku nebo vymáhanou částku.",
          "Vrať pouze validní JSON bez markdownu.",
          'Použij schéma: {"debtAmount":""}'
        ].join(" ")
      }]
    },
    contents: [{ parts: [{ text: "Vyhledej v PDF dlužnou částku. Vrať ji jako číslo bez měny, ideálně ve formátu 12500.50. Pokud ji nenajdeš, vrať prázdný řetězec." }, { inlineData: { mimeType: "application/pdf", data: pdfBase64 } }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.1 }
  });
  return normalizeText(parsed.debtAmount);
}

async function extractStopExecutionFromPdf(pdfBase64) {
  return await postToGemini({
    systemInstruction: {
      parts: [{
        text: [
          "Jsi extraktor údajů z exekučních dokumentů.",
          "Najdi klíčové údaje pro návrh na zastavení exekuce.",
          "Vrať pouze validní JSON bez markdownu.",
          "Použij schéma:",
          '{"exekutor":"","exekutorskyUrad":"","adresaUradu":"","spisovaZnacka":"","opravneny":"","povinny":"","exekucniTitul":"","datumVyzvy":""}'
        ].join(" ")
      }]
    },
    contents: [{ parts: [{ text: "Vytěž uvedené údaje z PDF. Pokud údaj nenajdeš, vrať prázdný řetězec." }, { inlineData: { mimeType: "application/pdf", data: pdfBase64 } }] }],
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
    if (!req.file) return res.status(400).json({ ok: false, error: "Chybí JSON soubor." });
    if (!["application/json", "text/plain", ""].includes(req.file.mimetype)) {
      return res.status(400).json({ ok: false, error: "Soubor musí být JSON." });
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


app.post("/api/generate", upload.single("pdf"), async (req, res) => {
  try {
    const prompt = normalizeText(req.body.prompt);
    const aiContext = normalizeText(req.body.aiContext);
    const recipientRaw = req.body.recipient;

    if (!prompt || prompt.length < 3) {
      return res.status(400).json({ ok: false, error: "Prompt je příliš krátký." });
    }

    let recipient = {
      nazev: "Příjemce neuveden",
      adresa: "",
      mesto: "",
      ds: ""
    };

    if (recipientRaw) {
      try {
        const parsedRecipient = JSON.parse(recipientRaw);
        recipient = {
          nazev: parsedRecipient?.nazev || "Příjemce neuveden",
          adresa: parsedRecipient?.adresa || "",
          mesto: parsedRecipient?.mesto || "",
          ds: parsedRecipient?.ds || ""
        };
      } catch {
        return res.status(400).json({ ok: false, error: "Příjemce není validní JSON." });
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
      error: error.message || "Generování selhalo."
    });
  }
});


app.post("/api/export-docx", async (req, res) => {
  try {
    const {
      senderName,
      senderAddress,
      recipientName,
      recipientAddress,
      refData,
      dateText,
      title,
      body
    } = req.body || {};

    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: "ODESÍLATEL:", bold: true }),
                new TextRun({ text: ` ${senderName || "---"}` })
              ]
            }),
            new Paragraph(senderAddress || "---"),
            new Paragraph(""),
            new Paragraph({
              children: [
                new TextRun({ text: "PŘÍJEMCE:", bold: true }),
                new TextRun({ text: ` ${recipientName || "---"}` })
              ]
            }),
            new Paragraph(recipientAddress || "---"),
            new Paragraph(""),
            new Paragraph({
              children: [
                new TextRun({ text: "NAŠE Č.J.: ", bold: true }),
                new TextRun(refData || "---")
              ]
            }),
            new Paragraph({
              children: [
                new TextRun({ text: "DATUM A MÍSTO: ", bold: true }),
                new TextRun(dateText || "---")
              ]
            }),
            new Paragraph(""),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: title || "ÚŘEDNÍ LISTINA",
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
            new Paragraph("Vlastnoruční podpis")
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
app.listen(PORT, () => console.log(`Server běží na http://localhost:${PORT}`));
