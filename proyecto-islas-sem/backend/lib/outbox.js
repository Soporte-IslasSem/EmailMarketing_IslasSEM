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
        try { await db.collection("campaigns").doc(item.campaignId).update({ sentCount: admin.firestore.FieldValue.increment(1) }); } catch (_) {}
      }
      sent++;
    } catch (e) {
      const attempts = (item.attempts || 0) + 1;
      await d.ref.update({ status: attempts >= 3 ? "failed" : "pending", attempts, error: String(e.message || e) });
      failed++;
    }
  }
  // Actualiza el contador diario con lo enviado en esta pasada.
  if (sent > 0) await cRef.set({ count: admin.firestore.FieldValue.increment(sent), updatedAt: Date.now() }, { merge: true });
  return { sent, failed, scanned: snap.size, today };
}

module.exports = { drainOutbox };
