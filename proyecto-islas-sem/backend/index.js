// Servidor ISLAS SEM (Node + Express) en email-marketing.islassem.com (Loading/Plesk).
// Una sola app sirve la web (SPA compilada en ./public) y la API bajo /api.
// Responsabilidades de la API:
//   1) Vaciar la cola de correos (outbox) y enviar por SMTP de Loading.
//   2) Ejecutar el SLA 24/7 (ofertas sin respuesta -> Kanban Negativo).
//   3) Recibir formularios públicos (reCAPTCHA) y vincularlos a la ficha del cliente.
// El cron de Plesk llama a /api/tasks/run?key=CRON_SECRET cada minuto
// (o ejecuta `node tick.js` directamente).
require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const path = require("path");
const express = require("express");
const { admin, db } = require("./lib/firebase");
const { drainOutbox } = require("./lib/outbox");
const { runSLA } = require("./lib/sla");
const { processReplies } = require("./lib/inbox");
const { submitForm, processFormSubmissions } = require("./lib/forms");

const app = express();
app.set("trust proxy", true); // Plesk/nginx delante: IP real para reCAPTCHA
const api = express.Router();
api.use(express.json({ limit: "100kb" }));

// CORS solo para los orígenes de la app (formularios públicos llaman desde el navegador).
const ORIGINS = (process.env.ALLOWED_ORIGINS || "https://email-marketing.islassem.com,http://localhost:5173")
  .split(",").map((s) => s.trim()).filter(Boolean);
api.use("/forms", (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ORIGINS.includes(origin)) {
    res.set({ "Access-Control-Allow-Origin": origin, "Vary": "Origin",
      "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" });
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// --- Formularios públicos (SEPA / Datos Jurídicos) con reCAPTCHA v3 ---
api.post("/forms/submit", submitForm);

api.get("/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

// --- Email marketing: baja (unsubscribe) ---
api.get("/u/:subscriberId", async (req, res) => {
  try {
    await db.collection("subscribers").doc(req.params.subscriberId)
      .set({ status: "unsubscribed", unsubscribedAt: Date.now() }, { merge: true });
  } catch (e) { console.warn("[unsubscribe]", e.message); }
  res.set("Content-Type", "text/html; charset=utf-8").send(
    `<div style="font-family:Arial;max-width:480px;margin:60px auto;text-align:center;color:#2a3a3a">
      <h2 style="color:#136B68">Baja confirmada</h2>
      <p>Ya no recibirás más correos de ISLAS SEM. Gracias.</p>
    </div>`
  );
});

// --- Email marketing: pixel de apertura (1x1 transparente) ---
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
api.get("/o/:campaignId/:sid", async (req, res) => {
  try {
    const subscriberId = String(req.params.sid).replace(/\.png$/i, "");
    await db.collection("campaigns").doc(req.params.campaignId)
      .set({ openCount: admin.firestore.FieldValue.increment(1) }, { merge: true });
    if (subscriberId) await db.collection("subscribers").doc(subscriberId)
      .set({ lastOpenAt: Date.now(), opened: true }, { merge: true });
  } catch (e) { console.warn("[open]", e.message); }
  res.set({ "Content-Type": "image/gif", "Cache-Control": "no-store" }).send(PIXEL);
});

async function runAll() {
  // Correos primero; luego respuestas (IMAP); luego SLA (por si una respuesta ya libró la oferta).
  const mail = await drainOutbox();
  const replies = await processReplies();
  const forms = await processFormSubmissions();
  const sla = await runSLA();
  return { mail, replies, forms, sla };
}

// Endpoint protegido por CRON_SECRET (para el cron de Plesk o un cron externo).
api.all("/tasks/run", async (req, res) => {
  const key = req.query.key || req.headers["x-cron-key"];
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) {
    return res.status(403).json({ error: "forbidden" });
  }
  try {
    const result = await runAll();
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error("[tasks/run] error:", e);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.use("/api", api);
app.use("/api", (_req, res) => res.status(404).json({ error: "not found" }));

// --- Web (SPA): archivos estáticos + cualquier otra ruta devuelve index.html ---
const WEB = path.join(__dirname, "public");
app.use(express.static(WEB, {
  setHeaders: (res, file) => {
    if (file.endsWith("index.html")) res.set("Cache-Control", "no-cache");
    else if (file.includes(`${path.sep}assets${path.sep}`)) res.set("Cache-Control", "public, max-age=31536000, immutable");
  },
}));
app.get(/.*/, (_req, res) => res.sendFile(path.join(WEB, "index.html")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[islassem-backend] escuchando en :${PORT}`));
