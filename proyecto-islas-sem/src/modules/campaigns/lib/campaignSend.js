// Envío de campañas por la MISMA cola outbox (escalable, multi-tenant).
// La app NO envía: encola un correo por destinatario; el backend de Loading los manda
// con throttle (respetando el límite diario). Incluye baja (unsubscribe) y pixel de apertura.
import { db } from "../../../config/firebaseConfig";
import { collection, doc, writeBatch, updateDoc, serverTimestamp, getDocs, query, where } from "firebase/firestore";
import { cleanEmailHtml } from "../../../utils/emailHtml";
import { getBrand } from "../../../shared/brand";

// Base pública del backend (para links de baja y pixel de tracking). Se configura por entorno.
const API_BASE = (import.meta.env && import.meta.env.VITE_API_BASE) || "https://email-marketing.islassem.com/api";
const BATCH = 400; // Firestore admite 500 escrituras/lote; dejamos margen.

// ¿Este suscriptor puede recibir? (no dado de baja, no rebotado, con un email bien escrito;
// uno mal escrito se salta en vez de fallar al enviarlo)
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const emailable = (s) => {
  const st = String(s.status || "").toLowerCase();
  return EMAIL_OK.test(String(s.email || "").trim()) && !["unsubscribed", "baja", "bounced", "rebotado", "blocked", "invalid", "pending"].includes(st);
};

// Destinatarios finales de una campaña: solo los que pueden recibir, UNA vez por email
// aunque estén en varias listas elegidas, y sin los que se quitaron a mano en el paso
// "Listas" (campaign.lists.excludedEmails).
// `suppressed`: emails de la lista "Bajas" (nunca reciben, estén en la lista que estén).
export function finalRecipients(subscribers, campaign, suppressed) {
  const excluded = new Set((campaign?.lists?.excludedEmails || []).map((e) => String(e).toLowerCase()));
  for (const e of suppressed || []) excluded.add(e);
  const seen = new Set();
  return subscribers.filter((s) => {
    const e = String(s.email || "").trim().toLowerCase();
    if (!emailable(s) || excluded.has(e) || seen.has(e)) return false;
    seen.add(e);
    return true;
  });
}

// Emails de la lista "Bajas" del usuario (se dieron de baja: no reciben ninguna campaña).
export async function loadSuppressed(uid) {
  if (!uid) return new Set();
  const lists = await getDocs(query(collection(db, "lists"), where("userId", "==", uid), where("bajas", "==", true)));
  const out = new Set();
  for (const l of lists.docs) {
    const subs = await getDocs(query(collection(db, "subscribers"), where("listId", "==", l.id), where("userId", "==", uid)));
    subs.docs.forEach((d) => d.data().email && out.add(String(d.data().email).trim().toLowerCase()));
  }
  return out;
}

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
  let out = cleanEmailHtml(html || "");
  out = out
    .replace(/{{\s*(nombre|name)\s*}}/gi, sub.name || sub.firstName || "")
    .replace(/{{\s*email\s*}}/gi, sub.email || "");
  out = trackLinks(out, campaignId, sub.id);
  const pixel = `<img src="${API_BASE}/o/${campaignId}/${sub.id}.png" width="1" height="1" alt="" style="display:none" />`;
  const who = String(getBrand().legalName || getBrand().name || "").replace(/[<>&"]/g, "");
  const unsub = `<div style="text-align:center;font-size:11px;color:#9aa8a8;margin-top:24px">
    ${who} · Si no deseas recibir más correos, <a href="${API_BASE}/u/${sub.id}" style="color:#9aa8a8">date de baja aquí</a>.
  </div>`;
  return out + unsub + pixel;
}

// Encola toda la campaña. Con sendAt (Date) futura, los correos quedan "scheduled" y el
// backend los libera cuando llega la hora. Devuelve { enqueued, skipped, scheduled }.
export async function enqueueCampaign(orgId, campaignId, campaign, subscribers, { sendAt, suppressed } = {}) {
  const scheduled = sendAt instanceof Date && sendAt.getTime() > Date.now() + 60e3;
  const recipients = finalRecipients(subscribers, campaign, suppressed);
  const skipped = subscribers.length - recipients.length;
  const subject = campaign.config?.subject || "(sin asunto)";
  // La dirección la fija el servidor (cuenta SMTP); el nombre visible sí es de cada campaña.
  const fromName = String(campaign.config?.senderName || "").trim().slice(0, 80);
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
        fromName,
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
      fromName: String(campaign.config?.senderName || "").trim().slice(0, 80),
      html: cleanEmailHtml(campaign.template?.html || ""),
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
