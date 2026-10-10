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
const { runStageFlow } = require("./lib/stageflow");
const { submitForm, formDefinition, publicForms, processFormSubmissions } = require("./lib/forms");
const { recordOpen, recordClick } = require("./lib/reports");
const { processAutomations } = require("./lib/automations");
const { checkDomains } = require("./lib/domains");
const { subscribe, confirm, unsubscribePage, doUnsubscribe } = require("./lib/subscriptions");
const { testWebhook } = require("./lib/webhooks");
const gcal = require("./lib/gcal");

const app = express();
app.set("trust proxy", true); // Plesk/nginx delante: IP real para reCAPTCHA
const api = express.Router();
api.use(express.json({ limit: "100kb" }));
api.use(express.urlencoded({ extended: false, limit: "20kb" })); // formulario de baja y one-click de Gmail

// CORS solo para los orígenes de la app (formularios públicos llaman desde el navegador).
const ORIGINS = (process.env.ALLOWED_ORIGINS || "https://email-marketing.islassem.com,http://localhost:5173")
  .split(",").map((s) => s.trim()).filter(Boolean);
api.use("/forms", (req, res, next) => {
  const origin = req.headers.origin;
  // El alta (/forms/subscribe) se llama desde formularios incrustados en cualquier web.
  if (req.path === "/subscribe") {
    res.set({ "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" });
  } else if (origin && ORIGINS.includes(origin)) {
    res.set({ "Access-Control-Allow-Origin": origin, "Vary": "Origin",
      "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" });
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// --- Listas: comprobar dominios de email (Depurar), solo con sesión de la app ---
api.post("/lists/check-domains", checkDomains);
api.post("/lists/:id/webhook-test", testWebhook);

// --- Email marketing: alta desde formularios incrustados + doble opt-in ---
api.post("/forms/subscribe", subscribe);
api.get("/forms/confirm/:sid", confirm);

// --- Formularios públicos (SEPA / Datos Jurídicos / creados en CRM) con reCAPTCHA v3 ---
api.get("/forms/def/:id", formDefinition);
api.get("/forms/public", publicForms);
api.post("/forms/submit", submitForm);

// --- Google Calendar (grupo@) ⇄ Tareas ---
api.post("/google/connect", gcal.connect);
api.get("/google/callback", gcal.callback);
api.get("/google/status", gcal.status);
api.post("/google/settings", gcal.settings);
api.post("/google/disconnect", gcal.disconnect);
api.post("/google/events", gcal.pushEvent);

api.get("/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

// --- Email marketing: baja (unsubscribe) ---
// GET muestra la página de baja (configurable en Listas › Notificaciones); no da de baja,
// porque antivirus y gestores de correo abren los enlaces. POST da de baja (botón de la
// página o "List-Unsubscribe=One-Click" de Gmail/Yahoo).
api.get("/u/:subscriberId", (req, res) => unsubscribePage(req, res, false).catch(() => res.sendStatus(500)));
api.post("/u/:subscriberId", doUnsubscribe);

async function subscriberEmail(sid) {
  if (!sid) return "";
  const snap = await db.collection("subscribers").doc(String(sid).slice(0, 64)).get().catch(() => null);
  return snap && snap.exists ? String(snap.data().email || "").toLowerCase() : "";
}

// --- Email marketing: pixel de apertura (1x1 transparente) ---
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
api.get("/o/:campaignId/:sid", async (req, res) => {
  res.set({ "Content-Type": "image/gif", "Cache-Control": "no-store" }).send(PIXEL);
  try {
    const campaignId = String(req.params.campaignId).slice(0, 64);
    const subscriberId = String(req.params.sid).replace(/\.png$/i, "");
    const camp = await db.collection("campaigns").doc(campaignId).get();
    if (!camp.exists) return;
    await camp.ref.update({ openCount: admin.firestore.FieldValue.increment(1) });
    const email = await subscriberEmail(subscriberId);
    if (email) {
      await db.collection("subscribers").doc(subscriberId).update({ lastOpenAt: Date.now(), opened: true });
      await recordOpen(campaignId, email);
    }
  } catch (e) { console.warn("[open]", e.message); }
});

// --- Email marketing: seguimiento de clics ---
// /api/c/:campaignId/:sid?u=<url> registra el clic y redirige. Para no ser un
// "redirector abierto", solo redirige a URLs http(s) que aparecen en la propia campaña.
api.get("/c/:campaignId/:sid", async (req, res) => {
  const url = String(req.query.u || "");
  const fallback = "https://email-marketing.islassem.com/";
  try {
    if (!/^https?:\/\//i.test(url)) return res.redirect(302, fallback);
    const campaignId = String(req.params.campaignId).slice(0, 64);
    const camp = await db.collection("campaigns").doc(campaignId).get();
    const html = camp.exists ? String(camp.data().template?.html || "") : "";
    let path = url;
    try { const u = new URL(url); path = u.pathname + u.search; } catch (_) { return res.redirect(302, fallback); }
    const known = html.includes(url) || html.includes(url.replace(/&/g, "&amp;")) ||
      (url.startsWith("https://email-marketing.islassem.com/") && html.includes(`"${path}"`));
    if (!known) return res.redirect(302, fallback);
    res.redirect(302, url);
    await camp.ref.update({ clickCount: admin.firestore.FieldValue.increment(1) });
    const email = await subscriberEmail(req.params.sid);
    await recordClick(campaignId, email, url);
  } catch (e) {
    console.warn("[click]", e.message);
    if (!res.headersSent) res.redirect(302, fallback);
  }
});

async function runAll() {
  // Correos primero; luego respuestas (IMAP); luego SLA (por si una respuesta ya libró la oferta).
  const mail = await drainOutbox();
  const replies = await processReplies();
  const forms = await processFormSubmissions();
  const automations = await processAutomations();
  const sla = await runSLA();
  // Flujo de etapas: reglas al entrar en etapa y negociaciones sin respuesta → negativo.
  const flow = await runStageFlow().catch((e) => ({ error: String(e.message || e).slice(0, 200) }));
  // Un fallo de Google Calendar no debe frenar el resto de tareas del cron.
  const calendar = await gcal.syncCalendar().catch((e) => ({ error: String(e.message || e).slice(0, 200) }));
  return { mail, replies, forms, automations, sla, flow, calendar };
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
