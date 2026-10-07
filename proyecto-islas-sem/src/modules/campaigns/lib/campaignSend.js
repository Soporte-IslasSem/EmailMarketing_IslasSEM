// Envío de campañas por la MISMA cola outbox (escalable, multi-tenant).
// La app NO envía: encola un correo por destinatario; el backend de Loading los manda
// con throttle (respetando el límite diario). Incluye baja (unsubscribe) y pixel de apertura.
import { db } from "../../../config/firebaseConfig";
import { collection, doc, writeBatch, updateDoc, serverTimestamp } from "firebase/firestore";
import { absolutizeUrls } from "../../../utils/emailHtml";

// Base pública del backend (para links de baja y pixel de tracking). Se configura por entorno.
const API_BASE = (import.meta.env && import.meta.env.VITE_API_BASE) || "https://email-marketing.islassem.com/api";
const BATCH = 400; // Firestore admite 500 escrituras/lote; dejamos margen.

// ¿Este suscriptor puede recibir? (no dado de baja, no rebotado, con email)
const emailable = (s) => {
  const st = String(s.status || "").toLowerCase();
  return !!s.email && !["unsubscribed", "baja", "bounced", "rebotado", "blocked"].includes(st);
};

// Enlaces http(s) de la campaña → pasan por /api/c para contar el clic y luego redirigen.
// No se tocan mailto:, tel:, anclas (#) ni el enlace de baja.
function trackLinks(html, campaignId, sid) {
  return html.replace(/\bhref=(["'])(https?:\/\/[^"']+)\1/gi, (m, q, url) => {
    const plain = url.replace(/&amp;/g, "&");
    if (plain.startsWith(`${API_BASE}/`)) return m;
    return `href=${q}${API_BASE}/c/${campaignId}/${sid}?u=${encodeURIComponent(plain)}${q}`;
  });
}

// Personaliza + seguimiento de clics + pixel de apertura y pie de baja.
function personalize(html, { campaignId, sub }) {
  let out = absolutizeUrls(html || "");
  out = out
    .replace(/{{\s*(nombre|name)\s*}}/gi, sub.name || sub.firstName || "")
    .replace(/{{\s*email\s*}}/gi, sub.email || "");
  out = trackLinks(out, campaignId, sub.id);
  const pixel = `<img src="${API_BASE}/o/${campaignId}/${sub.id}.png" width="1" height="1" alt="" style="display:none" />`;
  const unsub = `<div style="text-align:center;font-size:11px;color:#9aa8a8;margin-top:24px">
    ISLAS SEM SLU · Si no deseas recibir más correos, <a href="${API_BASE}/u/${sub.id}" style="color:#9aa8a8">date de baja aquí</a>.
  </div>`;
  return out + unsub + pixel;
}

// Encola toda la campaña. Con sendAt (Date) futura, los correos quedan "scheduled" y el
// backend los libera cuando llega la hora. Devuelve { enqueued, skipped, scheduled }.
export async function enqueueCampaign(orgId, campaignId, campaign, subscribers, { sendAt } = {}) {
  const scheduled = sendAt instanceof Date && sendAt.getTime() > Date.now() + 60e3;
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
        status: scheduled ? "scheduled" : "pending",
        ...(scheduled ? { sendAfter: sendAt.getTime() } : {}),
        unsubscribeUrl: `${API_BASE}/u/${sub.id}`,
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
    status: scheduled ? "scheduled" : "sending",
    send: scheduled
      ? { scheduleType: "scheduled", scheduledAt: sendAt.getTime(), status: "scheduled" }
      : { scheduleType: "now", scheduledAt: null, status: "queued" },
    recipientsCount: enqueued,
    skippedCount: skipped,
    queuedAt: serverTimestamp(),
    step: 5,
    updatedAt: serverTimestamp(),
  });

  return { enqueued, skipped, scheduled };
}

// Encola un único correo de prueba (se envía en el siguiente ciclo del backend, ~1 min).
export async function enqueueTest(orgId, campaign, toEmail) {
  await writeBatch(db)
    .set(doc(collection(db, "outbox")), {
      orgId,
      to: toEmail,
      toName: "Prueba",
      subject: `[PRUEBA] ${campaign.config?.subject || ""}`,
      html: absolutizeUrls(campaign.template?.html || ""),
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
