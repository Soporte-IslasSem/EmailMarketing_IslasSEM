// Vacía la cola de correos: lee "outbox" pendientes, envía por SMTP y marca el estado.
// Respeta un límite diario de envíos (throttle) por cuenta remitente — clave para el
// límite de Gmail (~2000/día) y para escalar con muchos clientes.
const { admin, db } = require("./firebase");
const { sendMail, mailDomain } = require("./mailer");
const { renderDocPDF } = require("./pdf");

const MAX_PER_RUN = Number(process.env.MAX_PER_RUN) || 30;      // por ejecución (cada minuto)
const DAILY_LIMIT = Number(process.env.SMTP_DAILY_LIMIT) || 1800; // margen bajo el tope de Gmail

// Contador diario por cuenta remitente (multi-cuenta listo para el SaaS).
function counterRef() {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const acct = (process.env.SMTP_USER || "default").replace(/[^\w.@-]/g, "_");
  return db.collection("counters").doc(`sends-${day}-${acct}`);
}

async function buildAttachments(item) {
  const att = item.attachment;
  if (!att || att.type !== "quotePdf" || !att.quoteId) return [];
  try {
    // La cotización puede estar en quotes o invoices.
    let snap = await db.collection("quotes").doc(att.quoteId).get();
    let isInvoice = false;
    if (!snap.exists) { snap = await db.collection("invoices").doc(att.quoteId).get(); isInvoice = true; }
    if (!snap.exists) return [];
    const doc = { id: snap.id, ...snap.data() };
    const pdf = await renderDocPDF(doc, { isInvoice });
    return [{ filename: `${isInvoice ? "Factura" : "Presupuesto"}-${doc.number || "SN"}.pdf`, content: pdf }];
  } catch (e) {
    console.warn("[outbox] no se pudo generar el PDF adjunto:", e.message);
    return [];
  }
}

// Cuando todos los correos de una campaña se han procesado (enviados o fallidos
// definitivamente), la campaña pasa a "sent" para que la app la muestre como Enviada.
async function settleCampaign(campaignId, field) {
  const ref = db.collection("campaigns").doc(campaignId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const c = snap.data();
    const sentCount = (c.sentCount || 0) + (field === "sentCount" ? 1 : 0);
    const failedCount = (c.failedCount || 0) + (field === "failedCount" ? 1 : 0);
    const patch = { [field]: admin.firestore.FieldValue.increment(1) };
    const total = Number(c.recipientsCount) || 0;
    if (total > 0 && sentCount + failedCount >= total && c.status !== "sent") {
      patch.status = "sent";
      patch.sentAt = Date.now();
      patch.send = { ...(c.send || {}), status: "sent" };
    }
    tx.update(ref, patch);
  });
}

// Red de seguridad: campañas en "sending" que ya no tienen correos pendientes en cola
// (p. ej. enviadas antes de existir settleCampaign) se marcan como enviadas.
async function sweepCampaigns() {
  const snap = await db.collection("campaigns").where("status", "==", "sending").limit(20).get();
  let closed = 0;
  for (const c of snap.docs) {
    const pending = await db.collection("outbox").where("campaignId", "==", c.id).where("status", "==", "pending").limit(1).get();
    if (pending.empty) {
      await c.ref.update({ status: "sent", sentAt: c.data().sentAt || Date.now(), send: { ...(c.data().send || {}), status: "sent" } });
      closed++;
    }
  }
  return closed;
}

async function drainOutbox() {
  // Cuánto se ha enviado hoy (throttle).
  const cRef = counterRef();
  const cSnap = await cRef.get();
  let today = (cSnap.exists && cSnap.data().count) || 0;
  if (today >= DAILY_LIMIT) return { sent: 0, failed: 0, scanned: 0, throttled: true, today };

  const room = Math.min(MAX_PER_RUN, DAILY_LIMIT - today);
  const snap = await db.collection("outbox").where("status", "==", "pending").limit(room).get();
  let sent = 0, failed = 0;
  for (const d of snap.docs) {
    const item = d.data();
    if (!item.to) { await d.ref.update({ status: "skipped", error: "Sin email del destinatario" }); continue; }
    try {
      const attachments = await buildAttachments(item);
      // Message-ID determinista por envío: permite emparejar la respuesta por hilo.
      const messageId = `<obx-${d.id}@${mailDomain()}>`;
      const { messageId: sentId } = await sendMail({ to: item.to, subject: item.subject, html: item.html, text: item.text, attachments, messageId });
      await d.ref.update({ status: "sent", sentAt: Date.now(), attempts: (item.attempts || 0) + 1, error: "", messageId: sentId });
      today++;
      // En ofertas, guarda el messageId en la negociación (respaldo para emparejar respuestas).
      if (item.kind === "offer" && item.dealId) {
        try {
          const dealRef = db.collection("deals").doc(item.dealId);
          const dealSnap = await dealRef.get();
          if (dealSnap.exists) await dealRef.update({ offer: { ...(dealSnap.data().offer || {}), messageId: sentId } });
        } catch (_) { /* no crítico */ }
      }
      // En campañas, cuenta enviados en la campaña.
      if (item.kind === "campaign" && item.campaignId && !item.isTest) {
        try { await settleCampaign(item.campaignId, "sentCount"); } catch (e) { console.warn("[outbox] campaña:", e.message); }
      }
      sent++;
    } catch (e) {
      const attempts = (item.attempts || 0) + 1;
      await d.ref.update({ status: attempts >= 3 ? "failed" : "pending", attempts, error: String(e.message || e) });
      if (attempts >= 3 && item.kind === "campaign" && item.campaignId && !item.isTest) {
        try { await settleCampaign(item.campaignId, "failedCount"); } catch (_) { /* no crítico */ }
      }
      failed++;
    }
  }
  // Actualiza el contador diario con lo enviado en esta pasada.
  if (sent > 0) await cRef.set({ count: admin.firestore.FieldValue.increment(sent), updatedAt: Date.now() }, { merge: true });
  const closed = await sweepCampaigns();
  return { sent, failed, scanned: snap.size, today, closed };
}

module.exports = { drainOutbox };
