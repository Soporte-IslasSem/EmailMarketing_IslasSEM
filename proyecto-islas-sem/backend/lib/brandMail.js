// Plantilla de los correos automáticos (flujo de etapas, contratos…) con la imagen de cada
// empresa: cabecera con su nombre y color, botón con su color de acento y pie con sus datos.
const { footerText } = require("./tenant");

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// body ya viene en HTML (escapado por quien lo construye).
function brandMailHtml(brand, { title, body, cta, ctaUrl }) {
  const b = brand || {};
  const color = b.color || "#136B68";
  const head = b.logoUrl
    ? `<img src="${esc(b.logoUrl)}" alt="${esc(b.name)}" style="max-height:40px;max-width:200px">`
    : esc(b.name || "");
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#2a3a3a;max-width:560px;margin:auto">
    <div style="background:${color};color:#fff;padding:16px 20px;font-size:18px;font-weight:bold">${head}</div>
    <div style="padding:20px;border:1px solid #e3eaea;border-top:none">
      <h2 style="color:${color};margin:0 0 12px">${esc(title)}</h2>
      <div style="font-size:14px;line-height:1.6">${body}</div>
      ${cta && ctaUrl ? `<p style="margin-top:20px"><a href="${ctaUrl}" style="background:${b.accent || "#E2B83C"};color:#1f2d2d;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:bold">${esc(cta)}</a></p>` : ""}
    </div>
    <div style="padding:12px 20px;font-size:11px;color:#9aa8a8">${esc(footerText(b))}</div>
  </div>`;
}

module.exports = { brandMailHtml, esc };
