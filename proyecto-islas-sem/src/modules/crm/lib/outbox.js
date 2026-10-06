// Bandeja de salida (outbox) de correos.
// La app NO envía: solo ENCOLA en Firestore (colección "outbox").
// El backend de Loading (cron) leerá los "pending", enviará por SMTP y marcará "sent".
// Así el envío queda desacoplado, auditado y listo para el SaaS.
import { crmCreate, crmUpdate } from "./crm";

export const OUTBOX_STATUS = {
  pending: { label: "En cola", cls: "warn" },
  sent: { label: "Enviado", cls: "ok" },
  failed: { label: "Falló", cls: "bad" },
  skipped: { label: "Omitido", cls: "info" }, // p. ej. sin email del destinatario
};

// Encola un correo. Devuelve la referencia del doc creado (o null si falla).
// payload: { to, toName, subject, html, text, kind, dealId, contactId, attachment }
export async function queueEmail(orgId, payload = {}) {
  const to = (payload.to || "").trim();
  const doc = {
    to,
    toName: payload.toName || "",
    subject: payload.subject || "(sin asunto)",
    html: payload.html || "",
    text: payload.text || "",
    kind: payload.kind || "notification", // offer | sepa | contract | campaign | notification
    status: to ? "pending" : "skipped", // sin email -> omitido (no se puede enviar)
    dealId: payload.dealId || "",
    contactId: payload.contactId || "",
    attachment: payload.attachment || null, // { type:"quotePdf", quoteId } -> lo genera el backend
    attempts: 0,
    error: to ? "" : "Sin email del destinatario",
    sentAt: null,
  };
  try {
    return await crmCreate("outbox", orgId, doc);
  } catch (e) {
    console.warn("[outbox] no se pudo encolar el correo:", e);
    return null;
  }
}

// Reintenta manualmente un correo fallido/omitido (lo vuelve a poner "pending").
export async function requeueEmail(id) {
  return crmUpdate("outbox", id, { status: "pending", error: "", attempts: 0 });
}

// Plantilla simple de correo (se reemplazará por plantillas ricas más adelante).
export function basicEmail({ title, body, cta, ctaUrl }) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#2a3a3a;max-width:560px;margin:auto">
    <div style="background:#136B68;color:#fff;padding:16px 20px;font-size:18px;font-weight:bold">ISLAS SEM</div>
    <div style="padding:20px;border:1px solid #e3eaea;border-top:none">
      <h2 style="color:#136B68;margin:0 0 12px">${title || ""}</h2>
      <div style="font-size:14px;line-height:1.6">${body || ""}</div>
      ${cta && ctaUrl ? `<p style="margin-top:20px"><a href="${ctaUrl}" style="background:#E2B83C;color:#1f2d2d;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:bold">${cta}</a></p>` : ""}
    </div>
    <div style="padding:12px 20px;font-size:11px;color:#9aa8a8">ISLAS SEM SLU · Canarias · www.islassem.com</div>
  </div>`;
}
