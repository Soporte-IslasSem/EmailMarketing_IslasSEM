// Transporte SMTP con nodemailer.
// - Cuenta de la plataforma (variables de entorno en Plesk, nunca en el código):
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, REPLY_TO.
// - Cada empresa puede tener su propio servidor de correo (Ajustes › Correo), guardado en
//   organizations/{orgId}/private/mail.smtp. Si no lo tiene, sus correos salen por la cuenta de
//   la plataforma con el NOMBRE de la empresa y las respuestas van a su email (replyTo).
const nodemailer = require("nodemailer");

const transporters = new Map(); // clave de cuenta -> transporter
function getTransporter(account) {
  const a = account || platformAccount();
  if (transporters.has(a.key)) return transporters.get(a.key);
  const port = Number(a.port) || 587;
  const t = nodemailer.createTransport({
    host: a.host,
    port,
    secure: port === 465, // 465 = SSL; 587/25 = STARTTLS
    auth: { user: a.user, pass: a.pass },
  });
  transporters.set(a.key, t);
  return t;
}
// Al cambiar los datos de una cuenta hay que olvidar su conexión.
const forgetAccount = (key) => { const t = transporters.get(key); if (t) t.close?.(); transporters.delete(key); };

function platformAccount() {
  return {
    key: `platform:${process.env.SMTP_USER || "default"}`, platform: true,
    host: process.env.SMTP_HOST, port: process.env.SMTP_PORT, user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD,
    from: process.env.SMTP_FROM || process.env.SMTP_USER, replyTo: process.env.REPLY_TO || "",
  };
}

const addressOf = (from) => (String(from || "").match(/<([^>]+)>/) || [])[1] || String(from || "").trim();

// Dominio para construir Message-IDs (del correo emisor).
function mailDomain(account) {
  const from = account?.from || process.env.SMTP_FROM || process.env.SMTP_USER || "islassem.com";
  const m = String(from).match(/@([^>\s]+)/);
  return m ? m[1] : "islassem.com";
}

// Envía un correo. Devuelve { messageId } para poder emparejar respuestas por hilo.
// opts: { to, fromName, subject, html, text, attachments, messageId, replyTo, references, unsubscribeUrl }
// account: cuenta de la empresa (accountFor en outbox) o, si falta, la de la plataforma.
async function sendMail(opts, account) {
  const a = account || platformAccount();
  // Nombre visible por correo (p. ej. el de la campaña); la dirección siempre es la de la cuenta.
  const base = a.from || a.user;
  const address = addressOf(base);
  const name = String(opts.fromName || a.fromName || "").replace(/["<>]/g, "").replace(/\s+/g, " ").trim();
  const from = name ? { name, address } : base;
  const messageId = opts.messageId || `<${Date.now()}.${Math.random().toString(36).slice(2)}@${mailDomain(a)}>`;
  await getTransporter(a).sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    attachments: opts.attachments,
    messageId,
    replyTo: opts.replyTo || a.replyTo || undefined,
    references: opts.references || undefined,
    // Baja en un clic (RFC 8058): Gmail/Yahoo la exigen a los envíos masivos.
    ...(opts.unsubscribeUrl ? {
      list: { unsubscribe: { url: opts.unsubscribeUrl, comment: "Darse de baja" } },
      headers: { "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    } : {}),
  });
  return { messageId };
}

module.exports = { sendMail, getTransporter, mailDomain, platformAccount, forgetAccount, addressOf };
