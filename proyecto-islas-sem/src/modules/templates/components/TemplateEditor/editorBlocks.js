// Bloques del editor de plantillas: "Contenido" (piezas que se sueltan dentro de una fila)
// y "Filas" (estructuras de columnas). Todo maquetado con tablas para Gmail/Outlook.
import { SANS, BLACK, btnHTML, row, wrap, logoImg } from "../../../../data/systemTemplates";

// Iconos de línea (24px) para las fichas del panel.
const svg = (d) =>
  `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

const ICONS = {
  title: svg('<path d="M4 6V4h16v2M12 4v16M9 20h6"/>'),
  paragraph: svg('<path d="M4 6h16M4 10h16M4 14h16M4 18h10"/>'),
  list: svg('<circle cx="5" cy="6" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="5" cy="18" r="1"/><path d="M9 6h11M9 12h11M9 18h11"/>'),
  image: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/>'),
  button: svg('<rect x="2" y="7" width="20" height="10" rx="5"/><path d="M8 12h8"/>'),
  logo: svg('<rect x="3" y="6" width="18" height="12" rx="3"/><circle cx="8.5" cy="12" r="2"/><path d="M13 11h5M13 14h3"/>'),
  divider: svg('<path d="M3 12h18M7 7h10M7 17h10"/>'),
  spacer: svg('<path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"/>'),
  social: svg('<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>'),
  html: svg('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M10 13l-2 2 2 2M14 13l2 2-2 2"/>'),
  video: svg('<rect x="2" y="5" width="20" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/>'),
  icons: svg('<path d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>'),
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  gif: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 10H7a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h1v-2M11 10v4M14 14v-4h3M14 12h2"/>'),
  sticker: svg('<path d="M15 3H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h7l8-8V6a3 3 0 0 0-3-3z"/><path d="M13 21v-5a3 3 0 0 1 3-3h5M9 10h.01M15 10h.01M9 15c1 1 2 1.5 3 1.5"/>'),
  survey: svg('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v2h6V3M9 10h6M9 14h6M9 18h3"/>'),
  coupon: svg('<path d="M3 8a2 2 0 0 0 0 4v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4a2 2 0 0 0 0-4V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z"/><path d="M13 4v16" stroke-dasharray="2 2"/>'),
  product: svg('<path d="M6 7h12l-1 13H7z"/><path d="M9 7a3 3 0 0 1 6 0"/>'),
};

// Miniaturas de columnas para la pestaña Filas.
const colsIcon = (parts) => {
  const total = parts.reduce((a, b) => a + b, 0);
  let x = 2;
  const rects = parts
    .map((p) => {
      const w = (60 - 2 * (parts.length + 1)) * (p / total);
      const r = `<rect x="${x}" y="4" width="${w}" height="22" rx="2" fill="currentColor" opacity=".18" stroke="currentColor"/>`;
      x += w + 2;
      return r;
    })
    .join("");
  return `<svg viewBox="0 0 64 30" width="100%" height="34">${rects}</svg>`;
};

const P = `font-family:${SANS};`;
const EMPTY = `<p data-ism-empty style="${P}margin:0;font-size:14px;color:#9aa8ab;text-align:center;padding:18px 0;">Arrastra aquí un bloque de contenido</p>`;

// ---------------------------------------------------------------- CONTENIDO
export const CONTENT_BLOCKS = [
  { id: "c-title", label: "Título", icon: "title",
    content: `<h1 style="${P}margin:0;padding:8px 0;font-size:30px;line-height:36px;font-weight:800;color:#14262b;">Escribe aquí tu titular</h1>` },
  { id: "c-paragraph", label: "Párrafo", icon: "paragraph",
    content: `<p style="${P}margin:0;padding:6px 0;font-size:16px;line-height:1.6;color:#4a5a60;">Escribe aquí tu texto. Haz doble clic para editarlo y usa la barra para poner negritas, cursivas o enlaces.</p>` },
  { id: "c-list", label: "Lista", icon: "list",
    content: `<ul style="${P}margin:0;padding:6px 0 6px 22px;font-size:16px;line-height:1.8;color:#4a5a60;"><li>Primer punto de la lista</li><li>Segundo punto de la lista</li><li>Tercer punto de la lista</li></ul>` },
  { id: "c-image", label: "Imagen", icon: "image", activate: true,
    content: { type: "image", src: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&h=640&fit=crop&auto=format&q=80",
      attributes: { alt: "Imagen", width: "536" }, style: { display: "block", width: "100%", height: "auto", border: "0", "border-radius": "8px" } } },
  { id: "c-logo", label: "Logo", icon: "logo",
    content: `<div style="text-align:center;padding:10px 0;">${logoImg("dark")}</div>` },
  { id: "c-button", label: "Botón", icon: "button",
    content: `<div style="padding:10px 0;">${btnHTML("Llamada a la acción")}</div>` },
  { id: "c-divider", label: "Separador", icon: "divider",
    content: `<div style="padding:12px 0;"><div style="border-top:1px solid #e3e8ea;font-size:1px;line-height:1px;">&nbsp;</div></div>` },
  { id: "c-spacer", label: "Espaciador", icon: "spacer",
    content: `<div style="height:32px;line-height:32px;font-size:1px;">&nbsp;</div>` },
  { id: "c-social", label: "Social", icon: "social",
    content: `<div style="text-align:center;padding:10px 0;">${["f", "in", "ig", "X", "▶"].map((l) => `<a href="#" style="display:inline-block;width:36px;height:36px;line-height:36px;border-radius:50%;background:#14262b;color:#ffffff;${P}font-size:13px;font-weight:700;text-decoration:none;margin:0 4px;">${l}</a>`).join("")}</div>` },
  { id: "c-html", label: "HTML", icon: "html",
    content: `<div data-ism-html style="${P}padding:14px;border:1px dashed #b9c6c9;color:#6c7a7f;font-size:13px;text-align:center;">Bloque HTML · selecciónalo y pulsa «Editar HTML» en Ajustes</div>` },
  { id: "c-video", label: "Vídeo", icon: "video",
    content: `<a href="https://www.youtube.com/" style="display:block;text-decoration:none;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#14262b" style="background:#14262b;border-radius:10px;"><tr><td align="center" style="padding:70px 20px;"><span style="display:inline-block;width:64px;height:64px;line-height:64px;border-radius:50%;background:#ffffff;color:#14262b;font-size:26px;">▶</span><div style="${P}color:#ffffff;font-size:14px;padding-top:12px;">Ver el vídeo</div></td></tr></table></a>` },
  { id: "c-icons", label: "Iconos", icon: "icons",
    content: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${[["🚚", "Envío gratis"], ["🔒", "Pago seguro"], ["↩️", "Devolución fácil"]].map(([i, t]) => `<td align="center" width="33%" style="${P}padding:10px 4px;"><div style="font-size:28px;line-height:1;">${i}</div><div style="font-size:13px;font-weight:700;color:#14262b;padding-top:8px;">${t}</div></td>`).join("")}</tr></table>` },
  { id: "c-menu", label: "Menú", icon: "menu",
    content: `<div style="text-align:center;padding:10px 0;${P}">${["Inicio", "Tienda", "Ofertas", "Contacto"].map((m) => `<a href="#" style="color:#14262b;text-decoration:none;font-size:14px;font-weight:600;margin:0 12px;">${m}</a>`).join("")}</div>` },
  { id: "c-gif", label: "GIFs", icon: "gif", activate: true,
    content: { type: "image", src: `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="220"><rect width="400" height="220" rx="12" fill="#eef3f4"/><text x="200" y="105" text-anchor="middle" font-family="Arial" font-size="40" font-weight="700" fill="#1A9190">GIF</text><text x="200" y="145" text-anchor="middle" font-family="Arial" font-size="15" fill="#6c7a7f">Doble clic para subir o pegar tu GIF</text></svg>')}`,
      attributes: { alt: "GIF", width: "400" }, style: { display: "block", margin: "0 auto", width: "100%", "max-width": "400px", height: "auto" } } },
  { id: "c-sticker", label: "Stickers", icon: "sticker",
    content: `<div style="text-align:center;font-size:72px;line-height:1;padding:10px 0;">🎉</div>` },
  { id: "c-survey", label: "Encuesta", icon: "survey",
    content: `<div style="text-align:center;${P}padding:10px 0;"><div style="font-size:16px;font-weight:700;color:#14262b;padding-bottom:12px;">¿Qué te ha parecido?</div>${[["😡", "1"], ["🙁", "2"], ["😐", "3"], ["🙂", "4"], ["😍", "5"]].map(([e, v]) => `<a href="#voto-${v}" style="display:inline-block;font-size:34px;text-decoration:none;margin:0 6px;">${e}</a>`).join("")}</div>` },
  { id: "c-coupon", label: "Cupón", icon: "coupon",
    content: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f3fbfa" style="background:#f3fbfa;border:2px dashed #1A9190;border-radius:14px;"><tr><td align="center" style="padding:20px;${P}"><div style="font-size:12px;letter-spacing:2px;color:#6c7a7f;">TU CÓDIGO</div><div style="font-family:${BLACK};font-size:32px;letter-spacing:4px;color:#14262b;padding:6px 0;">CODIGO10</div><div style="font-size:13px;color:#6c7a7f;">Válido hasta el 31/12</div></td></tr></table>` },
  { id: "c-product", label: "Producto", icon: "product",
    content: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f6f8f9" style="background:#f6f8f9;border-radius:12px;"><tr><td><img src="https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=520&h=420&fit=crop&auto=format&q=80" width="260" style="display:block;width:100%;height:auto;border-radius:12px 12px 0 0;" alt="Producto" /></td></tr><tr><td style="${P}padding:14px 14px 4px;font-size:15px;font-weight:700;color:#14262b;">Nombre del producto</td></tr><tr><td style="${P}padding:0 14px 12px;font-size:15px;font-weight:800;color:#1A9190;">49,90 €</td></tr><tr><td style="padding:0 14px 16px;">${btnHTML("Comprar", { size: 13, padding: "10px 20px" })}</td></tr></table>` },
].map((b) => ({ ...b, media: ICONS[b.icon] }));

// ---------------------------------------------------------------- FILAS
const colRow = (parts) => {
  const total = parts.reduce((a, b) => a + b, 0);
  const tds = parts
    .map((p) => {
      const w = Math.round((p / total) * 100);
      return `<td class="ism-col" width="${w}%" valign="top" style="width:${w}%;padding:10px;vertical-align:top;">${EMPTY}</td>`;
    })
    .join("");
  return `<table role="presentation" data-ism-row width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr><td class="ism-pad" style="padding:12px 22px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${tds}</tr></table></td></tr></table>`;
};

export const ROW_BLOCKS = [
  { id: "r-1", label: "1 columna", parts: [1] },
  { id: "r-2", label: "2 columnas", parts: [1, 1] },
  { id: "r-3", label: "3 columnas", parts: [1, 1, 1] },
  { id: "r-4", label: "4 columnas", parts: [1, 1, 1, 1] },
  { id: "r-13", label: "1/3 + 2/3", parts: [1, 2] },
  { id: "r-31", label: "2/3 + 1/3", parts: [2, 1] },
  { id: "r-14", label: "1/4 + 3/4", parts: [1, 3] },
  { id: "r-41", label: "3/4 + 1/4", parts: [3, 1] },
].map((r) => ({
  ...r,
  media: colsIcon(r.parts),
  content: r.parts.length === 1 ? row(EMPTY, { pad: "16px 32px" }) : colRow(r.parts),
}));

// Plantilla vacía con estructura de filas lista para editar.
export const BLANK_TEMPLATE = wrap([
  row(logoImg("dark"), { pad: "20px 32px", align: "center" }),
  row(EMPTY, { pad: "16px 32px" }),
]);
