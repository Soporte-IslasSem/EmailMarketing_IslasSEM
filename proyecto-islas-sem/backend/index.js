// Servidor del backend ISLAS SEM (Node + Express), alojado en Loading.
// Responsabilidades:
//   1) Vaciar la cola de correos (outbox) y enviar por SMTP de Loading.
//   2) Ejecutar el SLA 24/7 (ofertas sin respuesta -> Kanban Negativo).
// El cron de Plesk llama a /tasks/run?key=CRON_SECRET cada minuto
// (o ejecuta `node tick.js` directamente).
require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const express = require("express");
const { admin, db } = require("./lib/firebase");
const { drainOutbox } = require("./lib/outbox");
const { runSLA } = require("./lib/sla");
const { processReplies } = require("./lib/inbox");

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

// --- Email marketing: baja (unsubscribe) ---
app.get("/u/:subscriberId", async (req, res) => {
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
app.get("/o/:campaignId/:sid", async (req, res) => {
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
  const sla = await runSLA();
  return { mail, replies, sla };
}

// Endpoint protegido por CRON_SECRET (para el cron de Plesk o un cron externo).
app.all("/tasks/run", async (req, res) => {
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[islassem-backend] escuchando en :${PORT}`));
