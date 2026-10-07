// HTML de las notificaciones de lista (correo de confirmación, página de confirmación y
// página de baja) con el estilo de Listas › Notificaciones › General (logo y colores).
// El frontend tiene una copia en src/utils/notificationHtml.js para "Previsualizar":
// si se cambia el diseño aquí, hay que cambiarlo allí también.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nl2br = (s) => esc(s).replace(/\n/g, "<br>");

const DEFAULT_GENERAL = { logoUrl: "", contentColor: "#FFFFFF", backgroundColor: "#EEF3F3", buttonColor: "#1A9190" };

function shell(general, inner) {
  const g = { ...DEFAULT_GENERAL, ...Object.fromEntries(Object.entries(general || {}).filter(([, v]) => v)) };
  const logo = g.logoUrl ? `<img src="${esc(g.logoUrl)}" alt="" style="max-width:180px;max-height:70px;margin-bottom:18px">` : "";
  return `<div style="background:${esc(g.backgroundColor)};padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#2a3a3a">
  <div style="max-width:520px;margin:0 auto;background:${esc(g.contentColor)};border-radius:12px;padding:32px 28px;text-align:center">
    ${logo}${inner(g)}
  </div>
</div>`;
}

const button = (g, text, href) =>
  `<a href="${esc(href)}" style="display:inline-block;background:${esc(g.buttonColor)};color:#fff;text-decoration:none;padding:12px 26px;border-radius:8px;font-weight:bold">${esc(text)}</a>`;

// Correo de doble opt-in
function confirmEmailHtml(general, s, confirmUrl) {
  return shell(general, (g) => `
    <h2 style="margin:0 0 12px">${esc(s.title || "Confirma tu suscripción")}</h2>
    <p style="margin:0 0 22px;line-height:1.5">${nl2br(s.description || "Pulsa el botón para confirmar que quieres recibir nuestros correos.")}</p>
    ${button(g, s.buttonText || "Confirmar suscripción", confirmUrl)}
    ${s.footer ? `<p style="margin:22px 0 0;font-size:12px;color:#7a8a8a">${nl2br(s.footer)}</p>` : ""}`);
}

// Página tras confirmar
function confirmPageHtml(general, s) {
  return shell(general, (g) => `
    <h2 style="margin:0 0 12px">${esc(s.title || "¡Gracias por suscribirte!")}</h2>
    <p style="margin:0;line-height:1.5">${nl2br(s.description || "Te has suscrito correctamente.")}</p>
    ${s.buttonText && s.buttonUrl ? `<p style="margin:22px 0 0">${button(g, s.buttonText, s.buttonUrl)}</p>` : ""}`);
}

const REASONS = ["Recibo demasiados correos", "El contenido no me interesa", "Nunca me suscribí", "Otro motivo"];

// Página de baja (paso 1: confirmar con botón; paso 2: hecho)
function unsubscribePageHtml(general, s, actionUrl, done) {
  if (done) {
    return shell(general, () => `<h2 style="margin:0 0 12px">Baja confirmada</h2>
      <p style="margin:0;line-height:1.5">Ya no recibirás más correos de esta lista. Gracias.</p>`);
  }
  const reasons = s.showReasons !== false
    ? `<div style="text-align:left;margin:0 auto 20px;max-width:320px">${REASONS.map((r) =>
      `<label style="display:block;margin:6px 0;cursor:pointer"><input type="radio" name="reason" value="${esc(r)}"> ${esc(r)}</label>`).join("")}</div>`
    : "";
  return shell(general, (g) => `
    <h2 style="margin:0 0 12px">${esc(s.title || "¿Seguro que quieres darte de baja?")}</h2>
    <p style="margin:0 0 18px;line-height:1.5">${nl2br(s.description || "")}</p>
    <form method="POST" action="${esc(actionUrl)}">
      ${reasons}
      <button type="submit" style="border:0;cursor:pointer;background:${esc(g.buttonColor)};color:#fff;padding:12px 26px;border-radius:8px;font-weight:bold;font-size:15px">${esc(s.buttonText || "Darme de baja")}</button>
    </form>`);
}

const page = (title, body) =>
  `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head><body style="margin:0">${body}</body></html>`;

module.exports = { confirmEmailHtml, confirmPageHtml, unsubscribePageHtml, page, REASONS, esc };
