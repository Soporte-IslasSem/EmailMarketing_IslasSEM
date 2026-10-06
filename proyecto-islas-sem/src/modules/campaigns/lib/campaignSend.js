// Envío de campañas por la MISMA cola outbox (escalable, multi-tenant).
// La app NO envía: encola un correo por destinatario; el backend de Loading los manda
// con throttle (respetando el límite diario). Incluye baja (unsubscribe) y pixel de apertura.
import { db } from "../../../config/firebaseConfig";
import { collection, doc, writeBatch, updateDoc, serverTimestamp } from "firebase/firestore";

// Base pública del backend (para links de baja y pixel de tracking). Se configura por entorno.
const API_BASE = (import.meta.env && import.meta.env.VITE_API_BASE) || "https://api.islassem.com";
const BATCH = 400; // Firestore admite 500 escrituras/lote; dejamos margen.

// ¿Este suscriptor puede recibir? (no dado de baja, no rebotado, con email)
const emailable = (s) => {
  const st = String(s.status || "").toLowerCase();
  return !!s.email && !["unsubscribed", "baja", "bounced", "rebotado", "blocked"].includes(st);
};

// Personaliza + añade pixel de apertura y pie de baja al HTML de la campaña.
function personalize(html, { campaignId, sub }) {
  let out = html || "";
  out = out
    .replace(/{{\s*(nombre|name)\s*}}/gi, sub.name || sub.firstName || "")
    .replace(/{{\s*email\s*}}/gi, sub.email || "");
  const pixel = `<img src="${API_BASE}/o/${campaignId}/${sub.id}.png" width="1" height="1" alt="" style="display:none" />`;
  const unsub = `<div style="text-align:center;font-size:11px;color:#9aa8a8;margin-top:24px">
    ISLAS SEM SLU · Si no deseas recibir más correos, <a href="${API_BASE}/u/${sub.id}" style="color:#9aa8a8">date de baja aquí</a>.
  </div>`;
  return out + unsub + pixel;
}

// Encola toda la campaña. Devuelve { enqueued, skipped }.
export async function enqueueCampaign(orgId, campaignId, campaign, subscribers) {
  const recipients = subscribers.filter(emailable);
  const skipped = subscribers.length - recipients.length;
  const subject = campaign.config?.subject || "(sin asunto)";
  const baseHtml = campaign.template?.html || "";

  let enqueued = 0;
  for (let i = 0; i < recipients.length; i += BATCH) {
    const batch = writeBatch(db);
    for (const sub of recipients.slice(i, i + BATCH)) {
      const ref = doc(collection(db, "outbox"));
      batch.set(ref, {
        orgId,
        to: sub.email,
        toName: sub.name || "",
        subject,
        html: personalize(baseHtml, { campaignId, sub }),
        kind: "campaign",
        status: "pending",
        campaignId,
        subscriberId: sub.id,
        listId: sub.listId || "",
        attempts: 0,
        error: "",
        sentAt: null,
        createdAt: serverTimestamp(),
      });
      enqueued++;
    }
    await batch.commit();
  }

  await updateDoc(doc(db, "campaigns", campaignId), {
    status: "sending",
    send: { scheduleType: "now", scheduledAt: null, status: "queued" },
    recipientsCount: enqueued,
    skippedCount: skipped,
    queuedAt: serverTimestamp(),
    step: 5,
    updatedAt: serverTimestamp(),
  });

  return { enqueued, skipped };
}

// Encola un único correo de prueba (se envía en el siguiente ciclo del backend, ~1 min).
export async function enqueueTest(orgId, campaign, toEmail) {
  await writeBatch(db)
    .set(doc(collection(db, "outbox")), {
      orgId,
      to: toEmail,
      toName: "Prueba",
      subject: `[PRUEBA] ${campaign.config?.subject || ""}`,
      html: campaign.template?.html || "",
      kind: "campaign",
      status: "pending",
      isTest: true,
      attempts: 0,
      error: "",
      sentAt: null,
      createdAt: serverTimestamp(),
    })
    .commit();
}
