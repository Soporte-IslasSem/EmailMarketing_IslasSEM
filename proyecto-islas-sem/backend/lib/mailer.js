// Transporte SMTP con nodemailer, usando el correo de Loading.
// Config por variables de entorno (se ponen en Plesk, nunca en el código):
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM
const nodemailer = require("nodemailer");

let transporter;
function getTransporter() {
  if (transporter) return transporter;
  const port = Number(process.env.SMTP_PORT) || 587;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465 = SSL; 587/25 = STARTTLS
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });
  return transporter;
}

// Dominio para construir Message-IDs (del correo emisor).
function mailDomain() {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "islassem.com";
  const m = from.match(/@([^>\s]+)/);
  return m ? m[1] : "islassem.com";
}

// Envía un correo. Devuelve { messageId } para poder emparejar respuestas por hilo.
// opts: { to, subject, html, text, attachments, messageId, replyTo, references, unsubscribeUrl }
async function sendMail(opts) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const messageId = opts.messageId || `<${Date.now()}.${Math.random().toString(36).slice(2)}@${mailDomain()}>`;
  await getTransporter().sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    attachments: opts.attachments,
    messageId,
    replyTo: opts.replyTo || process.env.REPLY_TO || undefined,
    references: opts.references || undefined,
    // Baja en un clic (RFC 8058): Gmail/Yahoo la exigen a los envíos masivos.
    ...(opts.unsubscribeUrl ? {
      list: { unsubscribe: { url: opts.unsubscribeUrl, comment: "Darse de baja" } },
      headers: { "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    } : {}),
  });
  return { messageId };
}

module.exports = { sendMail, getTransporter, mailDomain };
