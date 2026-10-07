// src/data/systemTemplates.js
// Plantillas de sistema ISLAS SEM — diseños propios, maquetados con tablas (lo único que
// Gmail/Outlook respetan) a 600px, estilos en línea y columnas que se apilan en móvil.
// Las fotos son de Unsplash (licencia libre para uso comercial) y se sustituyen en el editor.

// ---------------------------------------------------------------- categorías (filtro)
export const TEMPLATE_CATEGORIES = [
  "Básicas", "Bienvenida", "Promociones", "Cupones", "Carrito abandonado", "Producto",
  "Moda", "Gastronomía", "Viajes", "Eventos", "Fechas especiales", "Cumpleaños",
  "Agradecimiento", "Reseñas", "Confirmaciones", "Notificaciones", "Newsletter", "Noticias",
  "Negocios", "Marketing", "Internet", "Educación", "Salud y bienestar", "Causas sociales",
  "Servicios", "Entretenimiento", "Personales",
];

// ---------------------------------------------------------------- piezas reutilizables
export const SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif";
export const SERIF = "Georgia,'Times New Roman',serif";
export const BLACK = "'Arial Black','Helvetica Neue',Arial,sans-serif";

const img = (id, w = 1200, h = 0) =>
  `https://images.unsplash.com/photo-${id}?w=${w}${h ? `&h=${h}` : ""}&fit=crop&auto=format&q=80`;

export const RESPONSIVE = `<style>
@media only screen and (max-width:620px){
  .ism-container{width:100%!important}
  .ism-col{display:block!important;width:100%!important;box-sizing:border-box}
  .ism-pad{padding-left:20px!important;padding-right:20px!important}
  .ism-h1{font-size:34px!important;line-height:40px!important}
  .ism-img{width:100%!important;height:auto!important}
}
</style>`;

// Documento completo: fondo exterior + contenedor de 600px. Cada fila es su propia tabla
// (data-ism-row) dentro de la celda data-ism-body: así el editor puede arrastrar filas.
export function wrap(rows, { bg = "#f2f4f5", body = "#ffffff", font = SANS } = {}) {
  return `${RESPONSIVE}
<table role="presentation" data-ism-outer width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${bg}" style="background:${bg};margin:0;padding:0;">
  <tr><td align="center" style="padding:24px 10px;">
    <table role="presentation" class="ism-container" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${body}" style="width:600px;max-width:600px;background:${body};font-family:${font};">
      <tr><td data-ism-body style="padding:0;">
      ${rows.join("\n")}
      </td></tr>
    </table>
  </td></tr>
</table>`;
}

export const row = (inner, { bg = "", pad = "0", align = "left", extra = "" } = {}) =>
  `<table role="presentation" data-ism-row width="100%" cellpadding="0" cellspacing="0" border="0" ${bg ? `bgcolor="${bg}"` : ""} style="width:100%;${bg ? `background:${bg};` : ""}"><tr><td class="ism-pad" align="${align}" style="padding:${pad};text-align:${align};${extra}">${inner}</td></tr></table>`;

// Línea superior "si no ves bien este correo".
const preheader = ({ bg = "", color = "#8a9499", link = "#1A9190" } = {}) =>
  row(
    `<span style="font-size:11px;color:${color};">¿No ves bien este correo? <a href="#" style="color:${link};text-decoration:underline;">Ábrelo en el navegador</a></span>`,
    { bg, pad: "10px 32px", align: "center" }
  );

// Logo como IMAGEN (data-ism-logo): se cambia con un clic en el editor o, para toda la
// plantilla a la vez, desde Ajustes → Logo. "light" = versión blanca para fondos oscuros.
// La ruta relativa se vuelve absoluta al guardar (absolutizeUrls).
export const LOGO_PLACEHOLDER = { dark: "/assets/templates/logo-placeholder.png", light: "/assets/templates/logo-placeholder-light.png" };
export const logoImg = (variant = "dark", width = 160) =>
  `<a href="#" style="display:inline-block;text-decoration:none;"><img data-ism-logo src="${LOGO_PLACEHOLDER[variant]}" alt="Logo" width="${width}" style="display:block;width:${width}px;max-width:100%;height:auto;border:0;" /></a>`;
const isLight = (c) => /^#[ef][0-9a-f]{5}$/i.test(c);

// Cabecera con logo e (opcional) menú.
function logoBar({ bg = "#ffffff", color = "#14262b", align = "center", menu = null, border = "" } = {}) {
  const variant = isLight(color) ? "light" : "dark";
  if (!menu) return row(logoImg(variant), { bg, pad: "20px 32px", align, extra: border ? `border-bottom:${border};` : "" });
  const links = menu.map((m) => `<a href="#" style="color:${color};text-decoration:none;font-size:13px;margin-left:16px;">${m}</a>`).join("");
  return row(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td class="ism-col" valign="middle" style="text-align:left;vertical-align:middle;">${logoImg(variant, 130)}</td>
      <td class="ism-col" valign="middle" style="text-align:right;vertical-align:middle;">${links}</td>
    </tr></table>`,
    { bg, pad: "20px 32px", extra: border ? `border-bottom:${border};` : "" }
  );
}

const image = (src, { alt = "", pad = "0", bg = "", radius = 0, href = "#" } = {}) =>
  row(
    `<a href="${href}"><img class="ism-img" src="${src}" alt="${alt}" width="${pad === "0" ? 600 : 536}" style="display:block;width:100%;max-width:${pad === "0" ? 600 : 536}px;height:auto;border:0;${radius ? `border-radius:${radius}px;` : ""}" /></a>`,
    { pad, bg }
  );

const heading = (txt, { size = 32, color = "#14262b", align = "left", font = SANS, weight = 800, pad = "8px 32px", bg = "", lh = 0, ls = "-0.5px" } = {}) =>
  row(
    `<h1 class="ism-h1" style="margin:0;font-family:${font};font-size:${size}px;line-height:${lh || Math.round(size * 1.15)}px;font-weight:${weight};letter-spacing:${ls};color:${color};">${txt}</h1>`,
    { bg, pad, align }
  );

const eyebrow = (txt, { color = "#1A9190", align = "left", pad = "28px 32px 4px", bg = "" } = {}) =>
  row(`<span style="font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${color};">${txt}</span>`, { bg, pad, align });

const text = (html, { size = 16, color = "#4a5a60", align = "left", pad = "8px 32px", bg = "", lh = 1.6, font = SANS } = {}) =>
  row(`<p style="margin:0;font-family:${font};font-size:${size}px;line-height:${lh};color:${color};">${html}</p>`, { bg, pad, align });

export const btnHTML = (label, { bg = "#1A9190", color = "#ffffff", radius = 999, size = 15, padding = "15px 34px", border = "" } = {}) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table;"><tr><td align="center" bgcolor="${bg}" style="background:${bg};border-radius:${radius}px;${border ? `border:${border};` : ""}">
    <a href="#" style="display:inline-block;padding:${padding};font-family:${SANS};font-size:${size}px;font-weight:700;color:${color};text-decoration:none;border-radius:${radius}px;">${label}</a>
  </td></tr></table>`;

// bg = color del botón · rowBg = fondo de la fila
const button = (label, { align = "left", pad = "20px 32px 28px", rowBg = "", ...b } = {}) =>
  row(btnHTML(label, b), { bg: rowBg, pad, align });

const spacer = (h = 24, bg = "") => row(`<div style="height:${h}px;line-height:${h}px;font-size:1px;">&nbsp;</div>`, { bg });

const divider = ({ color = "#e3e8ea", pad = "8px 32px", bg = "" } = {}) =>
  row(`<div style="border-top:1px solid ${color};font-size:1px;line-height:1px;">&nbsp;</div>`, { bg, pad });

// N columnas que se apilan en móvil. cells = [html, html, ...]
function columns(cells, { pad = "8px 24px", bg = "", gap = 8, valign = "top" } = {}) {
  const w = Math.floor(100 / cells.length);
  const tds = cells
    .map((c) => `<td class="ism-col" width="${w}%" valign="${valign}" style="width:${w}%;padding:${gap}px;vertical-align:${valign};">${c}</td>`)
    .join("");
  return row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${tds}</tr></table>`, { pad, bg });
}

// Tarjeta de producto (para rejillas).
const productCard = ({ src, name, price, old = "", cta = "Comprar", accent = "#1A9190", bg = "#ffffff", color = "#14262b" }) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${bg}" style="background:${bg};border-radius:12px;">
    <tr><td><img class="ism-img" src="${src}" alt="${name}" width="260" style="display:block;width:100%;height:auto;border:0;border-radius:12px 12px 0 0;" /></td></tr>
    <tr><td style="padding:14px 14px 4px;font-family:${SANS};font-size:15px;font-weight:700;color:${color};">${name}</td></tr>
    <tr><td style="padding:0 14px 12px;font-family:${SANS};font-size:15px;color:${accent};font-weight:800;">${price}${old ? ` <span style="color:#9aa5a9;font-weight:400;text-decoration:line-through;font-size:13px;">${old}</span>` : ""}</td></tr>
    <tr><td style="padding:0 14px 16px;">${btnHTML(cta, { bg: accent, size: 13, padding: "10px 20px" })}</td></tr>
  </table>`;

// Icono redondo con emoji (se ve en todos los clientes de correo).
const iconFeature = ({ icon, title, body, tint = "#e6f4f3", color = "#14262b", align = "center" }) =>
  `<div style="text-align:${align};font-family:${SANS};">
    <div style="display:inline-block;width:56px;height:56px;line-height:56px;border-radius:50%;background:${tint};font-size:26px;text-align:center;">${icon}</div>
    <div style="font-size:16px;font-weight:800;color:${color};padding:12px 0 6px;">${title}</div>
    <div style="font-size:14px;line-height:1.5;color:#5d6b70;">${body}</div>
  </div>`;

// Caja de cupón con borde discontinuo.
const coupon = (code, { label = "Tu código", note = "", color = "#14262b", border = "#1A9190", bg = "#f3fbfa", pad = "12px 32px", rowBg = "" } = {}) =>
  row(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${bg}" style="background:${bg};border:2px dashed ${border};border-radius:14px;">
      <tr><td align="center" style="padding:22px;font-family:${SANS};">
        <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${color};opacity:.7;">${label}</div>
        <div style="font-family:${BLACK};font-size:34px;letter-spacing:4px;color:${color};padding:6px 0;">${code}</div>
        ${note ? `<div style="font-size:13px;color:${color};opacity:.7;">${note}</div>` : ""}
      </td></tr>
    </table>`,
    { pad, bg: rowBg }
  );

// Pie con redes, dirección y datos legales (el enlace de baja lo añade el envío).
function footer({ bg = "#14262b", color = "#9fb0b5", accent = "#ffffff", circle = "#24393f" } = {}) {
  const net = (l) =>
    `<a href="#" style="display:inline-block;width:34px;height:34px;line-height:34px;border-radius:50%;background:${circle};color:${accent};font-family:${SANS};font-size:13px;font-weight:700;text-decoration:none;margin:0 4px;">${l}</a>`;
  return row(
    `<div style="padding-bottom:16px;">${net("f")}${net("in")}${net("ig")}${net("X")}</div>
     <div style="font-family:${SANS};font-size:12px;line-height:1.7;color:${color};">
       <strong style="color:${accent};">TU EMPRESA</strong><br/>
       Calle Ejemplo 12 · 35200 Telde, Las Palmas<br/>
       Recibes este correo porque te suscribiste en nuestra web.
     </div>`,
    { bg, pad: "32px 32px 30px", align: "center" }
  );
}

const colImg = (src, r = 10) =>
  `<img class="ism-img" src="${src}" width="260" style="display:block;width:100%;height:auto;border-radius:${r}px;" alt="" />`;

// ---------------------------------------------------------------- plantillas
const T = [];
const add = (id, title, tags, html) => T.push({ id, title, tags, html });

// ============ BÁSICAS ============
add("basic-blank", "Básica · Texto y botón", ["Básicas"], wrap([
  preheader(),
  logoBar({ border: "1px solid #eef1f2" }),
  spacer(20),
  heading("Escribe aquí tu titular"),
  text("Hola {{nombre}}, este es un bloque de texto listo para editar. Cuenta en dos o tres frases lo más importante de tu mensaje y termina con una llamada a la acción clara."),
  button("Llamada a la acción"),
  footer(),
]));

add("basic-image", "Básica · Imagen destacada", ["Básicas"], wrap([
  preheader(),
  logoBar(),
  image(img("1497366216548-37526070297c", 1200, 640), { alt: "Imagen principal" }),
  eyebrow("Novedades"),
  heading("Un titular que invite a seguir leyendo", { size: 30 }),
  text("Usa este espacio para desarrollar la idea principal. Mantén los párrafos cortos: la mayoría de tus lectores abrirán el correo desde el móvil."),
  button("Saber más"),
  footer(),
]));

add("basic-2col", "Básica · Dos columnas", ["Básicas"], wrap([
  preheader(),
  logoBar({ menu: ["Inicio", "Servicios", "Contacto"], border: "1px solid #eef1f2" }),
  spacer(12),
  heading("Dos ideas, un mismo correo", { align: "center" }),
  text("Presenta dos productos, servicios o noticias lado a lado.", { align: "center" }),
  columns([
    `${colImg(img("1519389950473-47ba0277781c", 560, 380))}
     <div style="font-family:${SANS};font-size:18px;font-weight:800;color:#14262b;padding:14px 0 6px;">Primera columna</div>
     <div style="font-family:${SANS};font-size:14px;line-height:1.6;color:#5d6b70;padding-bottom:12px;">Describe aquí el primer elemento en pocas líneas.</div>
     ${btnHTML("Ver más", { size: 13, padding: "10px 22px" })}`,
    `${colImg(img("1556761175-5973dc0f32e7", 560, 380))}
     <div style="font-family:${SANS};font-size:18px;font-weight:800;color:#14262b;padding:14px 0 6px;">Segunda columna</div>
     <div style="font-family:${SANS};font-size:14px;line-height:1.6;color:#5d6b70;padding-bottom:12px;">Describe aquí el segundo elemento en pocas líneas.</div>
     ${btnHTML("Ver más", { size: 13, padding: "10px 22px" })}`,
  ], { pad: "16px 20px 28px" }),
  footer(),
]));

// ============ BIENVENIDA ============
add("welcome-community", "Bienvenida a la comunidad", ["Bienvenida"], wrap([
  preheader({ bg: "#0f3d3c", color: "#8fbfbf", link: "#ffffff" }),
  logoBar({ bg: "#0f3d3c", color: "#ffffff", accent: "#5fd3c9" }),
  row(`<div style="font-size:64px;line-height:1;">👋</div>`, { bg: "#0f3d3c", pad: "30px 32px 0", align: "center" }),
  heading("¡Hola, {{nombre}}!<br/>Ya eres parte del equipo", { color: "#ffffff", align: "center", size: 40, bg: "#0f3d3c", pad: "18px 32px 8px" }),
  text("Gracias por unirte. A partir de ahora recibirás antes que nadie nuestras novedades, guías y ofertas exclusivas.", { color: "#cfe7e5", align: "center", bg: "#0f3d3c", pad: "8px 48px 0" }),
  button("Descubre por dónde empezar", { align: "center", bg: "#5fd3c9", color: "#0f3d3c", rowBg: "#0f3d3c", pad: "26px 32px 44px" }),
  eyebrow("Lo que te espera", { align: "center", pad: "40px 32px 4px" }),
  heading("Tres cosas que puedes hacer hoy", { align: "center", size: 26 }),
  columns([
    iconFeature({ icon: "📘", title: "Lee la guía", body: "Los primeros pasos explicados en cinco minutos." }),
    iconFeature({ icon: "⚙️", title: "Configura tu perfil", body: "Personaliza qué correos quieres recibir." }),
    iconFeature({ icon: "💬", title: "Escríbenos", body: "Responde a este correo y te contestamos." }),
  ], { pad: "18px 20px 40px" }),
  footer({ bg: "#0f3d3c", circle: "#1d5654" }),
], { bg: "#e6f1f0" }));

add("welcome-discount", "Bienvenida con descuento", ["Bienvenida", "Cupones"], wrap([
  preheader(),
  logoBar(),
  image(img("1483985988355-763728e1935b", 1200, 700), { alt: "Bienvenida" }),
  row(`<span style="display:inline-block;background:#ff5a5f;color:#ffffff;font-family:${BLACK};font-size:14px;letter-spacing:2px;padding:8px 18px;border-radius:999px;">REGALO DE BIENVENIDA</span>`, { pad: "32px 32px 6px", align: "center" }),
  heading("Tu primera compra<br/>con un 15% menos", { align: "center", size: 40 }),
  text("Nos alegra tenerte aquí, {{nombre}}. Usa este código en tu primer pedido. Es personal y caduca en 7 días.", { align: "center", pad: "8px 48px" }),
  coupon("HOLA15", { border: "#ff5a5f", bg: "#fff4f4", note: "Válido 7 días · Compra mínima 30 €", pad: "18px 64px" }),
  button("Empezar a comprar", { align: "center", bg: "#14262b", pad: "18px 32px 40px" }),
  footer(),
]));

// ============ PROMOCIONES ============
add("promo-flash", "Rebajas flash 48 h", ["Promociones"], wrap([
  preheader({ bg: "#111111", color: "#777777", link: "#ffd400" }),
  logoBar({ bg: "#111111", color: "#ffffff", accent: "#ffd400" }),
  row(`<span style="font-family:${BLACK};font-size:14px;letter-spacing:6px;color:#ffd400;">SOLO 48 HORAS</span>`, { bg: "#111111", pad: "26px 32px 0", align: "center" }),
  heading("REBAJAS<br/>FLASH", { size: 76, lh: 76, font: BLACK, color: "#ffffff", align: "center", bg: "#111111", pad: "6px 32px", ls: "-2px" }),
  row(`<span style="display:inline-block;background:#ffd400;color:#111111;font-family:${BLACK};font-size:28px;padding:10px 26px;">HASTA -50%</span>`, { bg: "#111111", pad: "10px 32px 24px", align: "center" }),
  image(img("1441986300917-64674bd600d8", 1200, 560), { bg: "#111111" }),
  text("Cientos de artículos rebajados hasta el domingo a medianoche. Cuando se acaben, se acabaron.", { color: "#cccccc", align: "center", bg: "#111111", pad: "26px 56px 0" }),
  button("COMPRAR AHORA", { align: "center", bg: "#ffd400", color: "#111111", radius: 0, rowBg: "#111111", pad: "24px 32px 46px" }),
  footer({ bg: "#000000", circle: "#222222" }),
], { bg: "#1b1b1b", body: "#111111" }));

add("promo-blackfriday", "Black Friday", ["Promociones", "Fechas especiales"], wrap([
  preheader({ bg: "#000000", color: "#666666", link: "#c6ff00" }),
  logoBar({ bg: "#000000", color: "#ffffff", accent: "#c6ff00" }),
  heading("BLACK", { size: 92, lh: 88, font: BLACK, color: "#ffffff", align: "center", bg: "#000000", pad: "30px 32px 0", ls: "-3px" }),
  heading("FRIDAY", { size: 92, lh: 88, font: BLACK, color: "#c6ff00", align: "center", bg: "#000000", pad: "0 32px 10px", ls: "-3px" }),
  text("El mayor descuento del año empieza ahora.", { color: "#bbbbbb", align: "center", bg: "#000000", size: 18 }),
  columns([
    `<div style="background:#c6ff00;border-radius:14px;padding:22px 10px;text-align:center;font-family:${BLACK};color:#000;"><div style="font-size:40px;">-30%</div><div style="font-family:${SANS};font-size:13px;font-weight:700;">Toda la tienda</div></div>`,
    `<div style="background:#ffffff;border-radius:14px;padding:22px 10px;text-align:center;font-family:${BLACK};color:#000;"><div style="font-size:40px;">2x1</div><div style="font-family:${SANS};font-size:13px;font-weight:700;">En accesorios</div></div>`,
    `<div style="background:#c6ff00;border-radius:14px;padding:22px 10px;text-align:center;font-family:${BLACK};color:#000;"><div style="font-size:40px;">0 €</div><div style="font-family:${SANS};font-size:13px;font-weight:700;">Envío gratis</div></div>`,
  ], { bg: "#000000", pad: "20px 24px" }),
  button("Ver todas las ofertas", { align: "center", bg: "#c6ff00", color: "#000000", rowBg: "#000000", pad: "16px 32px 46px" }),
  footer({ bg: "#000000", circle: "#1c1c1c" }),
], { bg: "#111111", body: "#000000" }));

// ============ CUPONES ============
add("coupon-exclusive", "Cupón exclusivo", ["Cupones", "Promociones"], wrap([
  preheader(),
  logoBar({ bg: "#ffe9d6", accent: "#ff7a1a" }),
  row(`<div style="font-size:70px;line-height:1;">🎁</div>`, { bg: "#ffe9d6", pad: "16px 32px 0", align: "center" }),
  heading("Un regalo solo para ti", { align: "center", size: 38, bg: "#ffe9d6", pad: "14px 32px 6px" }),
  text("{{nombre}}, eres de nuestros clientes favoritos y queremos demostrártelo.", { align: "center", bg: "#ffe9d6", pad: "4px 48px 28px" }),
  coupon("VIP20", { label: "20% de descuento con el código", border: "#ff7a1a", bg: "#ffffff", note: "Caduca el 31/12 · Un uso por cliente", pad: "32px 56px 8px" }),
  button("Canjear mi cupón", { align: "center", bg: "#ff7a1a", pad: "18px 32px 18px" }),
  text("¿Cómo se usa? Añade tus productos a la cesta y escribe el código antes de pagar.", { align: "center", size: 13, color: "#8a979b", pad: "0 48px 36px" }),
  footer(),
]));

// ============ CARRITO ABANDONADO ============
add("cart-forgot", "¿Olvidaste algo?", ["Carrito abandonado"], wrap([
  preheader(),
  logoBar({ border: "1px solid #eef1f2" }),
  row(`<div style="font-size:60px;line-height:1;">🛒</div>`, { pad: "34px 32px 0", align: "center" }),
  heading("¿Se te ha olvidado algo?", { align: "center", size: 34, pad: "14px 32px 6px" }),
  text("Hola {{nombre}}, guardamos tu cesta para que puedas terminar tu compra cuando quieras.", { align: "center", pad: "4px 48px 20px" }),
  row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e6eaec;border-radius:14px;">
    <tr>
      <td class="ism-col" width="40%" style="padding:16px;">${colImg(img("1542291026-7eec264c27ff", 420, 420))}</td>
      <td class="ism-col" style="padding:16px;font-family:${SANS};vertical-align:middle;">
        <div style="font-size:18px;font-weight:800;color:#14262b;">Nombre del producto</div>
        <div style="font-size:14px;color:#6c7a7f;padding:6px 0;">Talla 42 · Rojo · Cantidad 1</div>
        <div style="font-size:22px;font-weight:800;color:#1A9190;padding-bottom:12px;">89,90 €</div>
        ${btnHTML("Finalizar compra", { size: 14, padding: "12px 24px" })}
      </td>
    </tr></table>`, { pad: "8px 32px 24px" }),
  columns([
    iconFeature({ icon: "🚚", title: "Envío gratis", body: "En pedidos de +50 €" }),
    iconFeature({ icon: "↩️", title: "30 días", body: "Para devoluciones" }),
    iconFeature({ icon: "🔒", title: "Pago seguro", body: "Tarjeta o Bizum" }),
  ], { pad: "8px 20px 34px", bg: "#f7f9fa" }),
  footer(),
]));

add("cart-last-chance", "Carrito · Última oportunidad", ["Carrito abandonado", "Cupones"], wrap([
  preheader({ bg: "#2b1b5a", color: "#a99be0", link: "#ffffff" }),
  logoBar({ bg: "#2b1b5a", color: "#ffffff", accent: "#ff9ad5" }),
  heading("Tu cesta caduca<br/>en 24 horas", { color: "#ffffff", align: "center", size: 40, bg: "#2b1b5a", pad: "30px 32px 8px" }),
  text("Y para ayudarte a decidir, te regalamos un 10% de descuento.", { color: "#d6cff5", align: "center", bg: "#2b1b5a", pad: "4px 48px 24px" }),
  columns([
    productCard({ src: img("1505740420928-5e560c06d30e", 520, 420), name: "Auriculares inalámbricos", price: "79,00 €", accent: "#7a4dff" }),
    productCard({ src: img("1523275335684-37898b6baf30", 520, 420), name: "Reloj clásico", price: "129,00 €", accent: "#7a4dff" }),
  ], { bg: "#2b1b5a", pad: "0 20px 10px" }),
  coupon("VUELVE10", { label: "Usa el código", border: "#ff9ad5", bg: "#3a2875", color: "#ffffff", pad: "16px 64px", rowBg: "#2b1b5a" }),
  button("Recuperar mi cesta", { align: "center", bg: "#ff9ad5", color: "#2b1b5a", rowBg: "#2b1b5a", pad: "12px 32px 44px" }),
  footer({ bg: "#1e1342", circle: "#33236b" }),
], { bg: "#eae6f7", body: "#2b1b5a" }));

// ============ PRODUCTO ============
add("product-launch", "Lanzamiento de producto", ["Producto", "Promociones"], wrap([
  preheader(),
  logoBar({ menu: ["Novedades", "Tienda", "Ayuda"] }),
  row(`<span style="display:inline-block;background:#e6f4f3;color:#1A9190;font-size:12px;font-weight:800;letter-spacing:2px;padding:7px 14px;border-radius:999px;">NUEVO</span>`, { pad: "30px 32px 6px", align: "center" }),
  heading("Conoce el nuevo<br/>Modelo X", { align: "center", size: 46, ls: "-1.5px" }),
  text("Más ligero, más rápido y con una batería que dura todo el día.", { align: "center", size: 18, pad: "6px 56px 20px" }),
  image(img("1526170375885-4d8ecf77b99f", 1200, 760), { pad: "0 32px", radius: 16 }),
  button("Reservar ahora · 249 €", { align: "center", pad: "28px 32px 12px" }),
  columns([
    iconFeature({ icon: "⚡", title: "2x más rápido", body: "Nuevo procesador de última generación." }),
    iconFeature({ icon: "🔋", title: "24 h de batería", body: "Carga completa en 40 minutos." }),
    iconFeature({ icon: "🌱", title: "Materiales reciclados", body: "Fabricado con un 70% de aluminio reciclado." }),
  ], { pad: "20px 20px 40px" }),
  footer(),
]));

add("product-catalog", "Catálogo de productos", ["Producto", "Moda"], wrap([
  preheader(),
  logoBar({ menu: ["Mujer", "Hombre", "Ofertas"], border: "1px solid #eef1f2" }),
  heading("Los favoritos de la semana", { align: "center", size: 32, pad: "32px 32px 4px" }),
  text("Seleccionados por nuestro equipo, a un clic de distancia.", { align: "center", pad: "4px 32px 12px" }),
  columns([
    productCard({ src: img("1542291026-7eec264c27ff", 520, 520), name: "Zapatilla Runner", price: "69,90 €", old: "89,90 €", bg: "#f6f8f9" }),
    productCard({ src: img("1523275335684-37898b6baf30", 520, 520), name: "Reloj Minimal", price: "119,00 €", bg: "#f6f8f9" }),
  ], { pad: "4px 20px" }),
  columns([
    productCard({ src: img("1505740420928-5e560c06d30e", 520, 520), name: "Auriculares Pro", price: "89,00 €", old: "109,00 €", bg: "#f6f8f9" }),
    productCard({ src: img("1526170375885-4d8ecf77b99f", 520, 520), name: "Cámara Retro", price: "249,00 €", bg: "#f6f8f9" }),
  ], { pad: "4px 20px 16px" }),
  button("Ver todo el catálogo", { align: "center", bg: "#14262b", pad: "8px 32px 40px" }),
  footer(),
]));

add("product-backinstock", "Vuelve a estar disponible", ["Producto", "Notificaciones"], wrap([
  preheader(),
  logoBar(),
  row(`<span style="font-family:${BLACK};font-size:13px;letter-spacing:4px;color:#e0405a;">¡LA ESPERA HA TERMINADO!</span>`, { pad: "30px 32px 0", align: "center" }),
  heading("Ha vuelto.<br/>Y vuela.", { align: "center", size: 52, ls: "-2px", pad: "10px 32px 18px" }),
  row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f4f1ec" style="background:#f4f1ec;border-radius:18px;"><tr><td align="center" style="padding:28px;">
    <img class="ism-img" src="${img("1523275335684-37898b6baf30", 700, 600)}" width="320" style="display:block;width:320px;max-width:100%;height:auto;border-radius:12px;" alt="Producto" />
    <div style="font-family:${SANS};font-size:20px;font-weight:800;color:#14262b;padding:18px 0 4px;">Nombre del producto</div>
    <div style="font-family:${SANS};font-size:14px;color:#6c7a7f;">Unidades limitadas · 129,00 €</div>
  </td></tr></table>`, { pad: "0 32px" }),
  button("Comprar antes de que se agote", { align: "center", bg: "#e0405a", pad: "26px 32px 40px" }),
  footer(),
]));

// ============ MODA ============
add("fashion-collection", "Nueva colección", ["Moda", "Producto"], wrap([
  preheader({ bg: "#f5efe8", color: "#9a8b7b", link: "#14262b" }),
  logoBar({ bg: "#f5efe8", menu: ["Colección", "Lookbook", "Tiendas"] }),
  row(`<span style="font-family:${SERIF};font-style:italic;font-size:18px;color:#9a6b4f;">Otoño · Invierno</span>`, { bg: "#f5efe8", pad: "24px 32px 0", align: "center" }),
  heading("La nueva colección", { font: SERIF, weight: 400, size: 50, align: "center", bg: "#f5efe8", pad: "4px 32px 22px", ls: "0" }),
  image(img("1490481651871-ab68de25d43d", 1200, 800), { bg: "#f5efe8" }),
  columns([
    `${colImg(img("1512436991641-6745cdb1723f", 560, 700), 0)}<div style="font-family:${SERIF};font-size:20px;color:#14262b;padding:12px 0 4px;">Abrigos</div><a href="#" style="font-family:${SANS};font-size:13px;color:#9a6b4f;letter-spacing:1px;">DESCUBRIR →</a>`,
    `${colImg(img("1523381210434-271e8be1f52b", 560, 700), 0)}<div style="font-family:${SERIF};font-size:20px;color:#14262b;padding:12px 0 4px;">Básicos</div><a href="#" style="font-family:${SANS};font-size:13px;color:#9a6b4f;letter-spacing:1px;">DESCUBRIR →</a>`,
  ], { bg: "#f5efe8", pad: "16px 22px 10px" }),
  button("VER LA COLECCIÓN", { align: "center", bg: "#14262b", radius: 0, size: 13, padding: "16px 40px", rowBg: "#f5efe8", pad: "18px 32px 44px" }),
  footer({ bg: "#2a2420", circle: "#3d3530" }),
], { bg: "#ebe3d9", body: "#f5efe8", font: SERIF }));

// ============ GASTRONOMÍA ============
add("food-menu", "Menú de temporada", ["Gastronomía"], wrap([
  preheader({ bg: "#1f3a2e", color: "#8fae9f", link: "#e9a23b" }),
  logoBar({ bg: "#1f3a2e", color: "#f3ead8", accent: "#e9a23b" }),
  image(img("1504674900247-0877df9cc836", 1200, 700), { alt: "Plato" }),
  row(`<span style="font-family:${SERIF};font-style:italic;font-size:18px;color:#e9a23b;">Llega el otoño a la cocina</span>`, { bg: "#1f3a2e", pad: "30px 32px 0", align: "center" }),
  heading("Nuevo menú de temporada", { font: SERIF, weight: 400, size: 40, color: "#f3ead8", align: "center", bg: "#1f3a2e", pad: "6px 32px 18px", ls: "0" }),
  row(["Crema de calabaza asada con aceite de salvia|12 €", "Risotto de setas y parmesano curado|18 €", "Bacalao confitado con pil-pil de cítricos|22 €", "Tarta de queso al horno con frutos rojos|7 €"]
    .map((l) => { const [n, p] = l.split("|"); return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px dashed #3f5e50;"><tr><td style="padding:14px 0;font-family:${SERIF};font-size:17px;color:#f3ead8;">${n}</td><td align="right" style="padding:14px 0;font-family:${SANS};font-size:16px;font-weight:700;color:#e9a23b;">${p}</td></tr></table>`; }).join(""),
    { bg: "#1f3a2e", pad: "0 48px" }),
  button("Reservar mesa", { align: "center", bg: "#e9a23b", color: "#1f3a2e", rowBg: "#1f3a2e", pad: "30px 32px 46px" }),
  footer({ bg: "#142820", circle: "#2a4a3c" }),
], { bg: "#e9e4d8", body: "#1f3a2e" }));

add("food-booking", "Reserva tu mesa", ["Gastronomía", "Servicios"], wrap([
  preheader(),
  logoBar(),
  columns([
    colImg(img("1414235077428-338989a2e8c0", 600, 760), 14),
    `<div style="font-family:${SANS};padding:10px 6px;">
      <div style="font-size:12px;font-weight:800;letter-spacing:2px;color:#d0573a;">ESTE FIN DE SEMANA</div>
      <div style="font-size:30px;line-height:34px;font-weight:800;color:#14262b;padding:10px 0;">Cena para dos con maridaje</div>
      <div style="font-size:15px;line-height:1.6;color:#5d6b70;padding-bottom:18px;">Menú degustación de 5 pasos con vinos de la tierra. Plazas limitadas los viernes y sábados.</div>
      <div style="font-size:28px;font-weight:800;color:#d0573a;padding-bottom:18px;">45 € <span style="font-size:14px;color:#8a979b;font-weight:400;">/ persona</span></div>
      ${btnHTML("Reservar ahora", { bg: "#d0573a" })}
    </div>`,
  ], { pad: "24px 20px 34px", valign: "middle" }),
  footer(),
]));

// ============ VIAJES ============
add("travel-summer", "Escapada de verano", ["Viajes", "Promociones"], wrap([
  preheader(),
  logoBar({ menu: ["Destinos", "Ofertas", "Mi viaje"] }),
  row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" background="${img("1507525428034-b723cf961d3e", 1200, 760)}" bgcolor="#0e7490" style="background:#0e7490 url('${img("1507525428034-b723cf961d3e", 1200, 760)}') center/cover no-repeat;"><tr><td align="center" style="padding:90px 32px;">
    <div style="font-family:${SANS};font-size:14px;font-weight:800;letter-spacing:4px;color:#ffffff;">VERANO 2026</div>
    <div class="ism-h1" style="font-family:${BLACK};font-size:52px;line-height:56px;color:#ffffff;padding:10px 0 20px;text-shadow:0 2px 12px rgba(0,0,0,.25);">Tu próxima<br/>escapada</div>
    ${btnHTML("Ver destinos", { bg: "#ffffff", color: "#0e7490" })}
  </td></tr></table>`),
  heading("Destinos destacados", { size: 26, pad: "34px 32px 6px" }),
  columns([
    productCard({ src: img("1469474968028-56623f02e42e", 520, 380), name: "Montaña · 3 noches", price: "desde 189 €", cta: "Reservar", accent: "#0e7490" }),
    productCard({ src: img("1501785888041-af3ef285b470", 520, 380), name: "Lagos · 5 noches", price: "desde 349 €", cta: "Reservar", accent: "#0e7490" }),
  ], { pad: "6px 20px 30px" }),
  footer({ bg: "#0b3b4a", circle: "#155366" }),
]));

add("travel-itinerary", "Confirmación de reserva", ["Viajes", "Confirmaciones"], wrap([
  preheader(),
  logoBar({ border: "1px solid #eef1f2" }),
  heading("¡Tu viaje está confirmado! ✈️", { size: 30, pad: "30px 32px 6px" }),
  text("Hola {{nombre}}, aquí tienes el resumen de tu reserva. Guárdalo, lo necesitarás el día del viaje."),
  row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f0f7fb" style="background:#f0f7fb;border-radius:14px;font-family:${SANS};"><tr>
    <td align="center" width="40%" style="padding:24px 10px;"><div style="font-family:${BLACK};font-size:36px;color:#0b3b4a;">LPA</div><div style="font-size:13px;color:#5d7380;">Gran Canaria · 08:15</div></td>
    <td align="center" width="20%" style="padding:24px 0;font-size:28px;color:#0e7490;">✈︎</td>
    <td align="center" width="40%" style="padding:24px 10px;"><div style="font-family:${BLACK};font-size:36px;color:#0b3b4a;">MAD</div><div style="font-size:13px;color:#5d7380;">Madrid · 11:55</div></td>
  </tr><tr><td colspan="3" style="padding:0 24px 22px;font-size:14px;color:#33444a;text-align:center;">Localizador <strong>XK7P2Q</strong> · 2 pasajeros · 12 dic 2026</td></tr></table>`, { pad: "18px 32px 6px" }),
  button("Gestionar mi reserva", { pad: "22px 32px 40px", bg: "#0e7490" }),
  footer({ bg: "#0b3b4a", circle: "#155366" }),
]));

// ============ EVENTOS ============
const infoBox = (icon, a, b) =>
  `<div style="background:#2a2766;border-radius:12px;padding:18px;text-align:center;font-family:${SANS};"><div style="font-size:26px;">${icon}</div><div style="color:#ffffff;font-weight:800;padding-top:6px;">${a}</div><div style="color:#a8a5d8;font-size:13px;">${b}</div></div>`;

add("event-invite", "Invitación a evento", ["Eventos", "Negocios"], wrap([
  preheader({ bg: "#1d1b4b", color: "#8784c0", link: "#ffb547" }),
  logoBar({ bg: "#1d1b4b", color: "#ffffff", accent: "#ffb547" }),
  image(img("1540575467063-178a50c2df87", 1200, 620), { alt: "Evento" }),
  row(`<span style="font-size:12px;font-weight:800;letter-spacing:3px;color:#ffb547;">ESTÁS INVITADO</span>`, { bg: "#1d1b4b", pad: "30px 32px 0", align: "center" }),
  heading("Encuentro anual<br/>de innovación 2026", { color: "#ffffff", align: "center", size: 38, bg: "#1d1b4b", pad: "8px 32px 22px" }),
  columns([infoBox("📅", "15 noviembre", "Jueves"), infoBox("⏰", "18:00 h", "Duración 3 h"), infoBox("📍", "Auditorio", "Las Palmas")], { bg: "#1d1b4b", pad: "0 24px 10px" }),
  text("Charlas, networking y un cóctel de cierre. Aforo limitado: confirma tu asistencia antes del 10 de noviembre.", { color: "#c9c7ee", align: "center", bg: "#1d1b4b", pad: "14px 48px 0" }),
  button("Confirmar asistencia", { align: "center", bg: "#ffb547", color: "#1d1b4b", rowBg: "#1d1b4b", pad: "24px 32px 46px" }),
  footer({ bg: "#141234", circle: "#26235c" }),
], { bg: "#e7e6f5", body: "#1d1b4b" }));

add("event-webinar", "Webinar gratuito", ["Eventos", "Educación", "Marketing"], wrap([
  preheader(),
  logoBar({ border: "1px solid #eef1f2" }),
  columns([
    `<div style="font-family:${SANS};padding:8px 4px;">
      <span style="display:inline-block;background:#ffe3e3;color:#e03131;font-size:12px;font-weight:800;padding:6px 12px;border-radius:999px;">🔴 EN DIRECTO</span>
      <div class="ism-h1" style="font-size:34px;line-height:38px;font-weight:800;color:#14262b;padding:14px 0 10px;">Webinar gratuito: cómo duplicar tus ventas online</div>
      <div style="font-size:15px;line-height:1.6;color:#5d6b70;">Miércoles 20 · 17:00 h (Canarias) · 45 min + preguntas</div>
    </div>`,
    colImg(img("1460925895917-afdab827c52f", 560, 560), 16),
  ], { pad: "24px 20px 4px", valign: "middle" }),
  eyebrow("Lo que aprenderás"),
  row(["Cómo atraer tráfico cualificado sin gastar más en anuncios", "Las 3 automatizaciones de email que más venden", "Cómo medir lo que funciona (y dejar lo que no)"]
    .map((l) => `<div style="font-family:${SANS};font-size:15px;color:#33444a;padding:7px 0;"><span style="color:#1A9190;font-weight:800;">✓</span>&nbsp; ${l}</div>`).join(""), { pad: "6px 32px" }),
  row(`<table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="padding-right:14px;"><img src="${img("1517836357463-d25dfeac3438", 120, 120)}" width="56" height="56" style="display:block;border-radius:50%;" alt="" /></td>
      <td style="font-family:${SANS};"><div style="font-size:15px;font-weight:800;color:#14262b;">Nombre del ponente</div><div style="font-size:13px;color:#6c7a7f;">Director de Marketing · Tu empresa</div></td>
    </tr></table>`, { pad: "18px 32px 4px" }),
  button("Reservar mi plaza gratis", { pad: "22px 32px 40px" }),
  footer(),
]));

// ============ FECHAS ESPECIALES ============
add("special-christmas", "Navidad", ["Fechas especiales", "Promociones"], wrap([
  preheader({ bg: "#7a1020", color: "#e7a3ad", link: "#ffffff" }),
  logoBar({ bg: "#7a1020", color: "#ffffff", accent: "#f2c14e" }),
  row(`<div style="font-size:58px;line-height:1;letter-spacing:12px;">🎄✨🎁</div>`, { bg: "#7a1020", pad: "26px 32px 0", align: "center" }),
  heading("Felices fiestas", { font: SERIF, weight: 400, size: 54, color: "#ffffff", align: "center", bg: "#7a1020", pad: "14px 32px 6px", ls: "0" }),
  text("Gracias por acompañarnos este año. Para celebrarlo, tienes un 25% en regalos hasta el 6 de enero.", { color: "#f5d6db", align: "center", bg: "#7a1020", pad: "6px 56px 24px" }),
  image(img("1513885535751-8b9238bd345a", 1200, 620), { bg: "#7a1020", pad: "0 32px", radius: 14 }),
  coupon("NAVIDAD25", { label: "Código regalo", border: "#f2c14e", bg: "#8e1a2c", color: "#ffffff", pad: "26px 64px 8px", rowBg: "#7a1020" }),
  button("Encontrar el regalo perfecto", { align: "center", bg: "#f2c14e", color: "#7a1020", rowBg: "#7a1020", pad: "18px 32px 46px" }),
  footer({ bg: "#4f0a15", circle: "#6b1422" }),
], { bg: "#f3e3e6", body: "#7a1020" }));

add("special-valentine", "San Valentín", ["Fechas especiales", "Promociones"], wrap([
  preheader({ bg: "#ffe4ec", color: "#c0728b", link: "#8a1238" }),
  logoBar({ bg: "#ffe4ec", accent: "#e8366f" }),
  row(`<div style="font-size:64px;line-height:1;">💘</div>`, { bg: "#ffe4ec", pad: "20px 32px 0", align: "center" }),
  heading("Regala algo que<br/>se recuerde", { align: "center", size: 42, color: "#8a1238", bg: "#ffe4ec", pad: "14px 32px 8px" }),
  text("Ideas para sorprender el 14 de febrero, con envío garantizado antes del día 13.", { align: "center", color: "#a04462", bg: "#ffe4ec", pad: "4px 56px 26px" }),
  columns([
    productCard({ src: img("1549465220-1a8b9238cd48", 520, 460), name: "Caja sorpresa", price: "39,00 €", accent: "#e8366f" }),
    productCard({ src: img("1556228578-8c89e6adf883", 520, 460), name: "Set de cuidado", price: "54,00 €", accent: "#e8366f" }),
  ], { bg: "#ffe4ec", pad: "0 20px 16px" }),
  button("Ver todos los regalos", { align: "center", bg: "#8a1238", rowBg: "#ffe4ec", pad: "10px 32px 44px" }),
  footer({ bg: "#8a1238", circle: "#a8264f" }),
], { bg: "#fff3f6", body: "#ffe4ec" }));

// ============ CUMPLEAÑOS ============
add("birthday-gift", "Feliz cumpleaños", ["Cumpleaños", "Cupones", "Personales"], wrap([
  preheader({ bg: "#fff6d6", color: "#a8945a", link: "#ff6b35" }),
  logoBar({ bg: "#fff6d6", accent: "#ff6b35" }),
  row(`<div style="font-size:72px;line-height:1;">🎂</div>`, { bg: "#fff6d6", pad: "24px 32px 0", align: "center" }),
  heading("¡Feliz cumpleaños,<br/>{{nombre}}!", { align: "center", size: 44, color: "#3b2a07", bg: "#fff6d6", pad: "16px 32px 8px" }),
  text("Hoy es tu día y queremos celebrarlo contigo. Te hemos preparado un regalo que puedes usar durante todo el mes.", { align: "center", color: "#6d5a2a", bg: "#fff6d6", pad: "6px 56px 26px" }),
  image(img("1530103862676-de8c9debad1d", 1200, 560), { bg: "#fff6d6", pad: "0 32px", radius: 16 }),
  coupon("CUMPLE30", { label: "Tu regalo: 30% de descuento", border: "#ff6b35", bg: "#ffffff", note: "Válido durante 30 días", pad: "26px 64px 8px", rowBg: "#fff6d6" }),
  button("Usar mi regalo", { align: "center", bg: "#ff6b35", rowBg: "#fff6d6", pad: "18px 32px 44px" }),
  footer(),
], { bg: "#fdf0c4", body: "#fff6d6" }));

// ============ AGRADECIMIENTO ============
add("thanks-order", "Gracias por tu compra", ["Agradecimiento", "Confirmaciones"], wrap([
  preheader(),
  logoBar({ border: "1px solid #eef1f2" }),
  row(`<div style="display:inline-block;width:72px;height:72px;line-height:72px;border-radius:50%;background:#e3f6ec;font-size:36px;">✅</div>`, { pad: "34px 32px 0", align: "center" }),
  heading("¡Gracias por tu pedido!", { align: "center", size: 34, pad: "16px 32px 6px" }),
  text("Hola {{nombre}}, hemos recibido tu pedido <strong>#10234</strong> y ya lo estamos preparando.", { align: "center", pad: "4px 48px 22px" }),
  row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f7f9fa" style="background:#f7f9fa;border-radius:14px;font-family:${SANS};">
    ${[["Zapatilla Runner · x1", "69,90 €"], ["Reloj Minimal · x1", "119,00 €"], ["Envío", "Gratis"]].map(([a, b]) => `<tr><td style="padding:14px 20px;font-size:15px;color:#33444a;border-bottom:1px solid #e6eaec;">${a}</td><td align="right" style="padding:14px 20px;font-size:15px;color:#33444a;border-bottom:1px solid #e6eaec;">${b}</td></tr>`).join("")}
    <tr><td style="padding:16px 20px;font-size:17px;font-weight:800;color:#14262b;">Total</td><td align="right" style="padding:16px 20px;font-size:17px;font-weight:800;color:#1A9190;">188,90 €</td></tr>
  </table>`, { pad: "0 32px" }),
  button("Seguir mi pedido", { align: "center", pad: "26px 32px 10px" }),
  text("¿Alguna duda? Responde a este correo y te ayudamos.", { align: "center", size: 13, color: "#8a979b", pad: "0 32px 36px" }),
  footer(),
]));

add("thanks-survey-incentive", "Gracias por ayudarnos a mejorar", ["Agradecimiento", "Reseñas"], wrap([
  preheader(),
  logoBar(),
  heading("Gracias por<br/>ayudarnos a mejorar", { align: "center", size: 40, pad: "26px 32px 10px" }),
  row(`<div style="font-size:84px;line-height:1;">🤝</div>`, { pad: "6px 32px 6px", align: "center" }),
  text("Tu opinión nos ayuda a hacerlo cada día mejor. Como agradecimiento, aquí tienes un pequeño detalle para tu próxima compra.", { align: "center", pad: "10px 56px 20px" }),
  coupon("GRACIAS10", { label: "10% en tu próxima compra", border: "#14262b", bg: "#f7f9fa", pad: "4px 72px" }),
  button("Ir a la tienda", { align: "center", bg: "#14262b", pad: "22px 32px 42px" }),
  footer(),
]));

// ============ RESEÑAS ============
add("review-request", "Valora tu experiencia", ["Reseñas", "Servicios"], wrap([
  preheader({ bg: "#5b2bd6", color: "#b9a5f5", link: "#ffffff" }),
  logoBar({ bg: "#5b2bd6", color: "#ffffff", accent: "#ffd84d" }),
  heading("¿Qué te ha<br/>parecido?", { color: "#ffffff", align: "center", size: 46, bg: "#5b2bd6", pad: "34px 32px 10px" }),
  text("{{nombre}}, tu opinión ayuda a otros clientes a decidir. Solo te llevará 30 segundos.", { color: "#e2d8ff", align: "center", bg: "#5b2bd6", pad: "4px 56px 24px" }),
  row([1, 2, 3, 4, 5].map((n) => `<a href="#" style="display:inline-block;margin:0 3px;font-size:40px;text-decoration:none;" title="${n} estrellas">⭐</a>`).join(""), { bg: "#5b2bd6", pad: "0 32px 8px", align: "center" }),
  text("Pulsa una estrella para valorar", { size: 13, color: "#c9b8ff", align: "center", bg: "#5b2bd6", pad: "0 32px 20px" }),
  button("Escribir una reseña", { align: "center", bg: "#ffd84d", color: "#2b1170", rowBg: "#5b2bd6", pad: "6px 32px 46px" }),
  footer({ bg: "#3c1a99", circle: "#5128c2" }),
], { bg: "#ece6fb", body: "#5b2bd6" }));

add("review-nps", "Encuesta de satisfacción", ["Reseñas", "Marketing"], wrap([
  preheader(),
  logoBar({ border: "1px solid #eef1f2" }),
  row(`<div style="font-size:60px;line-height:1;">📋</div>`, { pad: "34px 32px 0", align: "center" }),
  heading("Nos encantaría saber tu opinión", { align: "center", size: 30, pad: "16px 32px 6px" }),
  text("Del 0 al 10, ¿con qué probabilidad nos recomendarías a un amigo o compañero?", { align: "center", pad: "4px 48px 22px" }),
  row(`<table role="presentation" align="center" cellpadding="0" cellspacing="0"><tr>${Array.from({ length: 11 }, (_, n) => {
    const c = n <= 6 ? "#f4d6d6" : n <= 8 ? "#fbecc5" : "#d3f0e2";
    return `<td style="padding:2px;"><a href="#" style="display:block;width:38px;height:38px;line-height:38px;text-align:center;border-radius:8px;background:${c};font-family:${SANS};font-size:15px;font-weight:800;color:#14262b;text-decoration:none;">${n}</a></td>`;
  }).join("")}</tr></table>`, { pad: "0 16px", align: "center" }),
  row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-family:${SANS};font-size:12px;color:#8a979b;">Nada probable</td><td align="right" style="font-family:${SANS};font-size:12px;color:#8a979b;">Muy probable</td></tr></table>`, { pad: "8px 56px 30px" }),
  text("Gracias por dedicarnos un minuto. Leemos todas las respuestas.", { align: "center", size: 13, color: "#8a979b", pad: "0 32px 36px" }),
  footer(),
]));

// ============ CONFIRMACIONES ============
add("confirm-subscription", "Confirma tu suscripción", ["Confirmaciones", "Bienvenida"], wrap([
  preheader(),
  logoBar(),
  row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f3fbfa" style="background:#f3fbfa;border-radius:18px;"><tr><td align="center" style="padding:40px 32px;font-family:${SANS};">
    <div style="font-size:56px;line-height:1;">✉️</div>
    <div class="ism-h1" style="font-size:30px;line-height:36px;font-weight:800;color:#14262b;padding:18px 0 10px;">Confirma tu correo</div>
    <div style="font-size:16px;line-height:1.6;color:#4a5a60;padding-bottom:24px;">Solo falta un paso para completar tu suscripción. Pulsa el botón para confirmar que este es tu correo.</div>
    ${btnHTML("Sí, quiero suscribirme")}
    <div style="font-size:12px;color:#8a979b;padding-top:20px;">Si no te has registrado tú, ignora este mensaje y no volverás a recibir correos.</div>
  </td></tr></table>`, { pad: "10px 32px 36px" }),
  footer({ bg: "#ffffff", color: "#8a979b", accent: "#14262b", circle: "#eef1f2" }),
]));

add("confirm-appointment", "Recordatorio de cita", ["Confirmaciones", "Servicios", "Notificaciones"], wrap([
  preheader(),
  logoBar({ border: "1px solid #eef1f2" }),
  heading("Tu cita es mañana", { size: 32, pad: "32px 32px 6px" }),
  text("Hola {{nombre}}, te recordamos los detalles de tu cita. Si no puedes asistir, avísanos con antelación.", { pad: "4px 32px 22px" }),
  row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e6eaec;border-radius:14px;font-family:${SANS};"><tr>
    <td class="ism-col" width="34%" align="center" bgcolor="#1A9190" style="background:#1A9190;border-radius:14px 0 0 14px;padding:24px;color:#ffffff;">
      <div style="font-size:14px;font-weight:700;letter-spacing:2px;">NOVIEMBRE</div>
      <div style="font-family:${BLACK};font-size:56px;line-height:60px;">14</div>
      <div style="font-size:14px;">Viernes</div>
    </td>
    <td class="ism-col" style="padding:20px 24px;color:#33444a;font-size:15px;line-height:1.9;">
      <div>⏰ <strong>10:30 h</strong> · 45 minutos</div>
      <div>📍 Calle Ejemplo 12, Telde</div>
      <div>👤 Con: Nombre del profesional</div>
    </td>
  </tr></table>`, { pad: "0 32px" }),
  row(`${btnHTML("Confirmar asistencia")}&nbsp;&nbsp;${btnHTML("Cambiar cita", { bg: "#ffffff", color: "#1A9190", border: "2px solid #1A9190", padding: "13px 30px" })}`, { pad: "24px 32px 40px" }),
  footer(),
]));

// ============ NOTIFICACIONES ============
add("notify-important", "Aviso importante", ["Notificaciones", "Servicios"], wrap([
  preheader(),
  logoBar({ border: "1px solid #eef1f2" }),
  row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#fff7e6" style="background:#fff7e6;border-left:5px solid #f59f00;border-radius:8px;"><tr><td style="padding:18px 20px;font-family:${SANS};font-size:15px;line-height:1.5;color:#7a4b00;"><strong>⚠️ Acción necesaria:</strong> revisa la información de este correo antes del 30 de noviembre.</td></tr></table>`, { pad: "30px 32px 8px" }),
  heading("Actualizamos nuestras condiciones", { size: 28, pad: "16px 32px 6px" }),
  text("Hola {{nombre}}, a partir del 1 de diciembre entran en vigor nuestras nuevas condiciones de servicio. Estos son los cambios principales:"),
  row(["Nuevos métodos de pago disponibles.", "Mejoras en la protección de tus datos.", "Cambios en los plazos de devolución."].map((l) => `<div style="font-family:${SANS};font-size:15px;color:#33444a;padding:6px 0;">• ${l}</div>`).join(""), { pad: "6px 40px" }),
  button("Leer las condiciones", { pad: "20px 32px 40px" }),
  footer(),
]));

add("notify-winback", "Te echamos de menos", ["Notificaciones", "Marketing", "Cupones"], wrap([
  preheader({ bg: "#7048e8", color: "#c5b5ff", link: "#ffffff" }),
  logoBar({ bg: "#7048e8", color: "#ffffff", accent: "#ffd43b" }),
  heading("No te<br/>olvides", { font: BLACK, size: 68, lh: 70, color: "#ffffff", align: "center", bg: "#7048e8", pad: "36px 32px 10px", ls: "-2px" }),
  text("Hace tiempo que no te vemos, {{nombre}}. Hemos estado preparando novedades que te van a encantar.", { color: "#e5dbff", align: "center", bg: "#7048e8", pad: "6px 56px 24px" }),
  row(`<div style="font-size:84px;line-height:1;">🥺</div>`, { bg: "#7048e8", pad: "0 32px 10px", align: "center" }),
  coupon("VUELVE15", { label: "Vuelve con un 15% menos", border: "#ffd43b", bg: "#7f5af0", color: "#ffffff", pad: "16px 64px", rowBg: "#7048e8" }),
  button("Ver las novedades", { align: "center", bg: "#ffd43b", color: "#3b1f8f", rowBg: "#7048e8", pad: "14px 32px 46px" }),
  footer({ bg: "#4c2bb3", circle: "#6240d4" }),
], { bg: "#efe9ff", body: "#7048e8" }));

// ============ NEWSLETTER / NOTICIAS ============
const article = (src, tag, title, body) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td class="ism-col" width="38%" valign="top" style="padding:0 16px 0 0;">${colImg(src)}</td>
    <td class="ism-col" valign="top" style="font-family:${SANS};">
      <div style="font-size:11px;font-weight:800;letter-spacing:2px;color:#1A9190;padding-top:2px;">${tag}</div>
      <div style="font-size:19px;line-height:24px;font-weight:800;color:#14262b;padding:6px 0;">${title}</div>
      <div style="font-size:14px;line-height:1.6;color:#5d6b70;padding-bottom:8px;">${body}</div>
      <a href="#" style="font-size:14px;font-weight:700;color:#1A9190;text-decoration:none;">Leer más →</a>
    </td></tr></table>`;

add("newsletter-monthly", "Newsletter mensual", ["Newsletter", "Noticias", "Negocios"], wrap([
  preheader(),
  logoBar({ menu: ["Blog", "Recursos", "Contacto"], border: "1px solid #eef1f2" }),
  row(`<span style="font-size:12px;color:#8a979b;letter-spacing:1px;">NEWSLETTER · Nº 24 · NOVIEMBRE 2026</span>`, { pad: "26px 32px 0" }),
  heading("Lo más interesante del mes", { size: 34, pad: "8px 32px 18px" }),
  image(img("1504384308090-c894fdcc538d", 1200, 620), { pad: "0 32px", radius: 14 }),
  eyebrow("Destacado", { pad: "22px 32px 4px" }),
  heading("Cinco tendencias que marcarán el próximo año", { size: 24, pad: "4px 32px 6px" }),
  text("Analizamos los cambios que ya están transformando la forma de trabajar y qué puedes hacer hoy para adelantarte."),
  button("Leer el artículo", { pad: "16px 32px 24px", size: 14 }),
  divider(),
  row(article(img("1460925895917-afdab827c52f", 400, 300), "GUÍA", "Cómo medir tus campañas", "Las métricas que de verdad importan y cómo leerlas."), { pad: "20px 32px" }),
  divider(),
  row(article(img("1522202176988-66273c2fd55f", 400, 300), "EQUIPO", "Detrás de escena", "Conoce a las personas que hacen posible cada proyecto."), { pad: "20px 32px 32px" }),
  footer(),
]));

add("news-bulletin", "Boletín de noticias", ["Noticias", "Newsletter"], wrap([
  preheader(),
  row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="font-family:${SERIF};font-size:30px;font-weight:700;color:#111111;">El Boletín</td>
    <td align="right" style="font-family:${SANS};font-size:12px;color:#6c7a7f;">Lunes, 16 de noviembre</td>
  </tr></table>`, { pad: "24px 32px 14px", extra: "border-bottom:3px solid #111111;" }),
  image(img("1504711434969-e33886168f5c", 1200, 640), { pad: "22px 32px 0" }),
  heading("El titular principal del día va aquí, claro y directo", { font: SERIF, weight: 700, size: 30, pad: "16px 32px 6px", ls: "0" }),
  text("Un resumen de dos líneas que explique por qué esta noticia importa a tus lectores y les invite a seguir leyendo.", { font: SERIF, size: 17 }),
  row(`<a href="#" style="font-family:${SANS};font-size:14px;font-weight:700;color:#c92a2a;text-decoration:none;">Seguir leyendo →</a>`, { pad: "8px 32px 22px" }),
  divider({ color: "#111111" }),
  columns(["Economía", "Tecnología", "Cultura"].map((tag, i) =>
    `<div style="font-family:${SANS};font-size:11px;font-weight:800;letter-spacing:2px;color:#c92a2a;">${tag.toUpperCase()}</div>
     <div style="font-family:${SERIF};font-size:17px;line-height:22px;font-weight:700;color:#111111;padding:6px 0;">${["Titular de la segunda noticia", "Titular de la tercera noticia", "Titular de la cuarta noticia"][i]}</div>
     <div style="font-family:${SERIF};font-size:14px;line-height:1.5;color:#555555;">Breve descripción de la noticia en una o dos líneas.</div>`
  ), { pad: "14px 20px 30px" }),
  footer({ bg: "#111111", circle: "#2a2a2a" }),
], { font: SERIF }));

// ============ NEGOCIOS / MARKETING / INTERNET ============
add("business-services", "Servicios profesionales", ["Negocios", "Servicios", "Marketing"], wrap([
  preheader(),
  logoBar({ menu: ["Servicios", "Casos", "Contacto"], border: "1px solid #eef1f2" }),
  row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0f3d3c" style="background:#0f3d3c;border-radius:18px;"><tr>
    <td class="ism-col" style="padding:34px 28px;font-family:${SANS};">
      <div style="font-size:12px;font-weight:800;letter-spacing:2px;color:#5fd3c9;">CONSULTORÍA DIGITAL</div>
      <div class="ism-h1" style="font-size:32px;line-height:38px;font-weight:800;color:#ffffff;padding:12px 0;">Hacemos crecer tu negocio en internet</div>
      <div style="font-size:15px;line-height:1.6;color:#cfe7e5;padding-bottom:20px;">Web, posicionamiento, campañas y CRM en un mismo equipo.</div>
      ${btnHTML("Pedir diagnóstico gratis", { bg: "#5fd3c9", color: "#0f3d3c" })}
    </td>
    <td class="ism-col" width="40%" style="padding:20px;">${colImg(img("1556761175-5973dc0f32e7", 480, 560), 12)}</td>
  </tr></table>`, { pad: "24px 32px 10px" }),
  columns([
    iconFeature({ icon: "🌐", title: "Diseño web", body: "Webs rápidas que convierten visitas en clientes." }),
    iconFeature({ icon: "📈", title: "SEO y anuncios", body: "Aparece cuando tus clientes te buscan." }),
    iconFeature({ icon: "🤝", title: "CRM", body: "Ordena tus contactos y no pierdas ventas." }),
  ], { pad: "20px 20px 12px" }),
  text("<em>«Desde que trabajamos juntos hemos triplicado las solicitudes de presupuesto.»</em><br/><strong style=\"color:#14262b;\">— Cliente satisfecho, Gran Canaria</strong>", { align: "center", pad: "10px 56px 36px" }),
  footer(),
]));

add("services-quote", "Presupuesto listo", ["Servicios", "Negocios", "Notificaciones"], wrap([
  preheader(),
  logoBar({ border: "1px solid #eef1f2" }),
  heading("Tu presupuesto está listo", { size: 30, pad: "32px 32px 6px" }),
  text("Hola {{nombre}}, gracias por confiar en nosotros. Hemos preparado una propuesta a tu medida. Puedes revisarla y aceptarla en línea."),
  row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e6eaec;border-radius:14px;font-family:${SANS};">
    <tr><td style="padding:16px 20px;font-size:13px;color:#8a979b;">Presupuesto</td><td align="right" style="padding:16px 20px;font-size:15px;font-weight:700;color:#14262b;">Nº P-2026-118</td></tr>
    <tr><td style="padding:0 20px 16px;font-size:13px;color:#8a979b;">Válido hasta</td><td align="right" style="padding:0 20px 16px;font-size:15px;color:#14262b;">30/11/2026</td></tr>
    <tr><td style="padding:16px 20px;font-size:16px;font-weight:800;color:#14262b;border-top:1px solid #e6eaec;">Importe total</td><td align="right" style="padding:16px 20px;font-size:22px;font-weight:800;color:#1A9190;border-top:1px solid #e6eaec;">2.450,00 €</td></tr>
  </table>`, { pad: "16px 32px 6px" }),
  row(`${btnHTML("Ver y aceptar presupuesto")}&nbsp;&nbsp;${btnHTML("Tengo dudas", { bg: "#ffffff", color: "#1A9190", border: "2px solid #1A9190", padding: "13px 30px" })}`, { pad: "22px 32px 40px" }),
  footer(),
]));

add("marketing-case", "Caso de éxito en cifras", ["Marketing", "Negocios"], wrap([
  preheader(),
  logoBar(),
  eyebrow("Caso de éxito", { align: "center" }),
  heading("Cómo una tienda local multiplicó sus ventas", { align: "center", size: 32, pad: "6px 40px 22px" }),
  columns([["+212%", "ventas online"], ["48%", "tasa de apertura"], ["3,1x", "retorno de inversión"]].map(([n, l]) =>
    `<div style="text-align:center;font-family:${SANS};"><div style="font-family:${BLACK};font-size:40px;color:#1A9190;">${n}</div><div style="font-size:13px;color:#5d6b70;">${l}</div></div>`
  ), { bg: "#f3fbfa", pad: "24px 20px" }),
  image(img("1441986300917-64674bd600d8", 1200, 600), { pad: "26px 32px 0", radius: 14 }),
  text("En seis meses pasaron de vender solo en tienda física a facturar online cada semana, con campañas de email automatizadas y una web nueva.", { pad: "20px 32px 6px" }),
  button("Leer el caso completo", { pad: "16px 32px 40px" }),
  footer(),
]));

add("internet-app-update", "Novedades de la app", ["Internet", "Producto", "Notificaciones"], wrap([
  preheader({ bg: "#0b1220", color: "#5b6b86", link: "#7dd3fc" }),
  logoBar({ bg: "#0b1220", color: "#ffffff", accent: "#38bdf8" }),
  row(`<span style="display:inline-block;background:#12304a;color:#7dd3fc;font-family:monospace;font-size:13px;padding:6px 12px;border-radius:6px;">v 3.0 ya disponible</span>`, { bg: "#0b1220", pad: "30px 32px 0", align: "center" }),
  heading("Todo lo nuevo<br/>en la app", { color: "#ffffff", align: "center", size: 44, bg: "#0b1220", pad: "14px 32px 22px" }),
  image(img("1488590528505-98d2b5aba04b", 1200, 640), { bg: "#0b1220", pad: "0 32px", radius: 14 }),
  columns([
    iconFeature({ icon: "🌙", title: "Modo oscuro", body: "Descansa la vista por la noche.", tint: "#12304a", color: "#ffffff" }),
    iconFeature({ icon: "⚡", title: "Más rápida", body: "Carga hasta un 60% antes.", tint: "#12304a", color: "#ffffff" }),
    iconFeature({ icon: "🔔", title: "Avisos", body: "Notificaciones a tu medida.", tint: "#12304a", color: "#ffffff" }),
  ], { bg: "#0b1220", pad: "24px 20px 6px" }),
  button("Actualizar ahora", { align: "center", bg: "#38bdf8", color: "#0b1220", rowBg: "#0b1220", pad: "20px 32px 46px" }),
  footer({ bg: "#060b14", circle: "#16223a" }),
], { bg: "#e7edf6", body: "#0b1220" }));

// ============ EDUCACIÓN ============
add("edu-course", "Nuevo curso", ["Educación", "Eventos"], wrap([
  preheader({ bg: "#fef3e2", color: "#b08a55", link: "#d9480f" }),
  logoBar({ bg: "#fef3e2", accent: "#f08c00" }),
  columns([
    `<div style="font-family:${SANS};padding:6px 4px;">
      <span style="display:inline-block;background:#ffe8cc;color:#d9480f;font-size:12px;font-weight:800;padding:6px 12px;border-radius:999px;">INSCRIPCIONES ABIERTAS</span>
      <div class="ism-h1" style="font-size:36px;line-height:40px;font-weight:800;color:#3b2506;padding:14px 0 10px;">Curso de Marketing Digital</div>
      <div style="font-size:15px;line-height:1.6;color:#7a5a2b;padding-bottom:16px;">8 semanas · Online y en directo · Certificado incluido</div>
      ${btnHTML("Reservar plaza", { bg: "#f08c00" })}
    </div>`,
    colImg(img("1522202176988-66273c2fd55f", 560, 620), 16),
  ], { bg: "#fef3e2", pad: "20px 20px 30px", valign: "middle" }),
  heading("Qué vas a aprender", { size: 24, pad: "32px 32px 10px" }),
  row([["01", "Estrategia", "Define tu cliente ideal y tu propuesta de valor."], ["02", "Contenidos", "Crea publicaciones y correos que se lean."], ["03", "Publicidad", "Campañas en Google y redes que rentabilizan."], ["04", "Analítica", "Mide resultados y toma mejores decisiones."]]
    .map(([n, t, d]) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;"><tr><td width="56" valign="top" style="font-family:${BLACK};font-size:24px;color:#f08c00;">${n}</td><td style="font-family:${SANS};"><div style="font-size:16px;font-weight:800;color:#14262b;">${t}</div><div style="font-size:14px;color:#5d6b70;padding-top:2px;">${d}</div></td></tr></table>`).join(""), { pad: "4px 32px 20px" }),
  button("Ver el temario completo", { pad: "4px 32px 40px", bg: "#14262b" }),
  footer(),
]));

// ============ SALUD Y BIENESTAR ============
add("health-challenge", "Reto de bienestar", ["Salud y bienestar", "Eventos"], wrap([
  preheader({ bg: "#eaf7ef", color: "#7aa386", link: "#2f9e44" }),
  logoBar({ bg: "#eaf7ef", accent: "#2f9e44" }),
  image(img("1544367567-0f2fcb009e0b", 1200, 680), { bg: "#eaf7ef" }),
  heading("Reto de 21 días:<br/>cuídate por dentro y por fuera", { size: 32, bg: "#eaf7ef", pad: "30px 32px 8px" }),
  text("Cada mañana recibirás una rutina de 15 minutos, una receta saludable y un consejo para dormir mejor.", { bg: "#eaf7ef", pad: "4px 32px 18px" }),
  columns([
    iconFeature({ icon: "🧘", title: "Movimiento", body: "Rutinas cortas para cualquier nivel.", tint: "#d3f0dc" }),
    iconFeature({ icon: "🥗", title: "Alimentación", body: "Recetas fáciles y de temporada.", tint: "#d3f0dc" }),
    iconFeature({ icon: "😴", title: "Descanso", body: "Hábitos para dormir mejor.", tint: "#d3f0dc" }),
  ], { bg: "#eaf7ef", pad: "6px 20px 10px" }),
  button("Me apunto al reto", { align: "center", bg: "#2f9e44", rowBg: "#eaf7ef", pad: "20px 32px 46px" }),
  footer({ bg: "#1b4d2a", circle: "#2a6a3b" }),
], { bg: "#f4fbf6", body: "#eaf7ef" }));

add("health-fitness", "Plan de entrenamiento", ["Salud y bienestar", "Servicios"], wrap([
  preheader({ bg: "#111827", color: "#6b7280", link: "#f97316" }),
  logoBar({ bg: "#111827", color: "#ffffff", accent: "#f97316" }),
  image(img("1571019613454-1cb2f99b2d8b", 1200, 700), { bg: "#111827" }),
  heading("SUPERA TU<br/>MEJOR MARCA", { font: BLACK, size: 48, lh: 50, color: "#ffffff", bg: "#111827", pad: "30px 32px 10px", ls: "-1px" }),
  text("Planes personalizados con un entrenador que te acompaña cada semana. Primera sesión gratis.", { color: "#d1d5db", bg: "#111827", pad: "4px 32px 20px" }),
  columns([["12", "semanas"], ["3", "sesiones / semana"], ["1:1", "seguimiento"]].map(([n, l]) =>
    `<div style="border:1px solid #374151;border-radius:12px;padding:16px 8px;text-align:center;font-family:${SANS};"><div style="font-family:${BLACK};font-size:30px;color:#f97316;">${n}</div><div style="font-size:12px;color:#9ca3af;">${l}</div></div>`
  ), { bg: "#111827", pad: "0 24px 10px" }),
  button("Reservar sesión gratis", { bg: "#f97316", rowBg: "#111827", pad: "20px 32px 46px" }),
  footer({ bg: "#030712", circle: "#1f2937" }),
], { bg: "#e5e7eb", body: "#111827" }));

// ============ CAUSAS SOCIALES ============
add("cause-donate", "Únete a la causa", ["Causas sociales"], wrap([
  preheader(),
  logoBar({ border: "1px solid #eef1f2" }),
  image(img("1488521787991-ed7bbaae773c", 1200, 680)),
  heading("Juntos podemos llegar más lejos", { size: 32, pad: "30px 32px 8px" }),
  text("Este invierno queremos repartir 5.000 kits de abrigo. Cada aportación, por pequeña que sea, cuenta."),
  row(`<div style="font-family:${SANS};font-size:14px;color:#33444a;padding-bottom:8px;"><strong style="font-size:22px;color:#e8590c;">3.420</strong> de 5.000 kits</div>
    <div style="background:#f1e3da;border-radius:999px;height:14px;"><div style="background:#e8590c;width:68%;height:14px;border-radius:999px;"></div></div>`, { pad: "20px 32px 6px" }),
  row(["5 €", "15 €", "30 €", "Otra"].map((v) => `<a href="#" style="display:inline-block;margin:4px;padding:12px 22px;border:2px solid #e8590c;border-radius:10px;font-family:${SANS};font-size:16px;font-weight:800;color:#e8590c;text-decoration:none;">${v}</a>`).join(""), { pad: "18px 28px 0", align: "center" }),
  button("Donar ahora", { align: "center", bg: "#e8590c", pad: "20px 32px 40px" }),
  footer(),
]));

add("cause-volunteer", "Hazte voluntario", ["Causas sociales", "Eventos"], wrap([
  preheader({ bg: "#e7f5ff", color: "#6c93ad", link: "#1971c2" }),
  logoBar({ bg: "#e7f5ff", accent: "#1971c2" }),
  heading("Tu tiempo puede<br/>cambiar vidas", { align: "center", size: 40, color: "#0b3a63", bg: "#e7f5ff", pad: "24px 32px 10px" }),
  text("Buscamos voluntarios para acompañar a personas mayores dos horas a la semana. Sin experiencia previa.", { align: "center", color: "#3d6584", bg: "#e7f5ff", pad: "4px 56px 22px" }),
  image(img("1593113598332-cd288d649433", 1200, 640), { bg: "#e7f5ff", pad: "0 32px", radius: 16 }),
  columns([
    iconFeature({ icon: "🕑", title: "2 h / semana", body: "Tú eliges el horario.", tint: "#d0ebff" }),
    iconFeature({ icon: "🎓", title: "Formación", body: "Te acompañamos desde el primer día.", tint: "#d0ebff" }),
    iconFeature({ icon: "💙", title: "Impacto real", body: "Más de 300 personas atendidas.", tint: "#d0ebff" }),
  ], { bg: "#e7f5ff", pad: "24px 20px 6px" }),
  button("Quiero ser voluntario", { align: "center", bg: "#1971c2", rowBg: "#e7f5ff", pad: "20px 32px 46px" }),
  footer({ bg: "#0b3a63", circle: "#174d7d" }),
], { bg: "#f1f8ff", body: "#e7f5ff" }));

// ============ ENTRETENIMIENTO ============
add("entertainment-concert", "Concierto / estreno", ["Entretenimiento", "Eventos"], wrap([
  preheader({ bg: "#120b1f", color: "#6f5c8f", link: "#ff4fd8" }),
  logoBar({ bg: "#120b1f", color: "#ffffff", accent: "#ff4fd8" }),
  image(img("1492684223066-81342ee5ff30", 1200, 720), { bg: "#120b1f" }),
  row(`<span style="font-family:${BLACK};font-size:14px;letter-spacing:6px;color:#ff4fd8;">EN VIVO · 22.11</span>`, { bg: "#120b1f", pad: "30px 32px 0", align: "center" }),
  heading("LA NOCHE<br/>MÁS ESPERADA", { font: BLACK, size: 54, lh: 56, color: "#ffffff", align: "center", bg: "#120b1f", pad: "10px 32px 16px", ls: "-1px" }),
  text("Música, luces y la mejor compañía. Las entradas anticipadas tienen un 20% de descuento hasta el viernes.", { color: "#c4b5e0", align: "center", bg: "#120b1f", pad: "4px 56px 24px" }),
  button("Comprar entradas", { align: "center", bg: "#ff4fd8", color: "#120b1f", rowBg: "#120b1f", pad: "4px 32px 46px" }),
  footer({ bg: "#0a0612", circle: "#22163a" }),
], { bg: "#1c1230", body: "#120b1f" }));

add("entertainment-books", "Club de lectura", ["Entretenimiento", "Educación", "Newsletter"], wrap([
  preheader({ bg: "#f8f1e7", color: "#a38d6d", link: "#7c4a1e" }),
  logoBar({ bg: "#f8f1e7", accent: "#7c4a1e" }),
  columns([
    colImg(img("1512820790803-83ca734da794", 560, 700), 6),
    `<div style="font-family:${SERIF};padding:6px;">
      <div style="font-family:${SANS};font-size:12px;font-weight:800;letter-spacing:2px;color:#7c4a1e;">LECTURA DEL MES</div>
      <div style="font-size:32px;line-height:36px;color:#2b1a0b;padding:10px 0;">Una historia que no podrás soltar</div>
      <div style="font-size:16px;line-height:1.6;color:#5c4630;padding-bottom:18px;">Cada mes elegimos un libro y lo comentamos juntos. Este mes, encuentro el jueves 28 a las 19:00 h.</div>
      ${btnHTML("Unirme al club", { bg: "#7c4a1e" })}
    </div>`,
  ], { bg: "#f8f1e7", pad: "22px 20px 36px", valign: "middle" }),
  footer({ bg: "#2b1a0b", circle: "#43301c" }),
], { bg: "#efe6d8", body: "#f8f1e7", font: SERIF }));

// ============ PERSONALES ============
add("personal-letter", "Carta personal", ["Personales", "Básicas", "Negocios"], wrap([
  row(`<span style="font-family:${SANS};font-size:12px;color:#8a979b;">De parte de Nombre Apellido · Tu empresa</span>`, { pad: "28px 40px 0" }),
  text("Hola {{nombre}},", { font: SERIF, size: 18, color: "#14262b", pad: "24px 40px 4px" }),
  text("Te escribo personalmente porque quería contarte algo antes que a nadie. Este correo no tiene grandes imágenes ni ofertas: solo unas líneas sinceras, como las que escribiría a un amigo.", { font: SERIF, size: 17, color: "#33444a", pad: "10px 40px" }),
  text("Cuéntale aquí tu historia, una novedad o un agradecimiento. Los correos que parecen escritos a mano suelen ser los que más respuestas reciben.", { font: SERIF, size: 17, color: "#33444a", pad: "10px 40px" }),
  text("Si te apetece, responde a este correo: lo leo yo.", { font: SERIF, size: 17, color: "#33444a", pad: "10px 40px 20px" }),
  row(`<table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="padding-right:14px;"><img src="${img("1517836357463-d25dfeac3438", 140, 140)}" width="60" height="60" style="display:block;border-radius:50%;" alt="" /></td>
    <td style="font-family:${SERIF};"><div style="font-size:22px;font-style:italic;color:#14262b;">Nombre Apellido</div><div style="font-family:${SANS};font-size:13px;color:#6c7a7f;">Fundador · Tu empresa</div></td>
  </tr></table>`, { pad: "6px 40px 40px" }),
], { bg: "#f6f3ee", body: "#fffdf9", font: SERIF }));

add("personal-anniversary", "Aniversario de cliente", ["Personales", "Fechas especiales", "Cupones"], wrap([
  preheader({ bg: "#0c1b4d", color: "#7f8fc2", link: "#ffffff" }),
  logoBar({ bg: "#0c1b4d", color: "#ffffff", accent: "#4dabf7" }),
  row(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#1c3fa8" style="background:#1c3fa8;border-radius:18px;"><tr><td align="center" style="padding:40px 24px;font-family:${SANS};">
    <div style="font-size:48px;line-height:1;">🎉</div>
    <div class="ism-h1" style="font-size:40px;line-height:44px;font-weight:800;color:#ffffff;padding:16px 0 10px;">¡Hoy es nuestro aniversario!</div>
    <div style="font-size:16px;line-height:1.6;color:#cdd9ff;">Hace 1 año que nos elegiste, {{nombre}}. Gracias por estar ahí.</div>
  </td></tr></table>`, { bg: "#0c1b4d", pad: "16px 32px 10px" }),
  columns([["12", "pedidos"], ["340 €", "ahorrados"], ["5 ⭐", "valoraciones"]].map(([n, l]) =>
    `<div style="background:#14287a;border-radius:12px;padding:16px 8px;text-align:center;font-family:${SANS};"><div style="font-size:26px;font-weight:800;color:#ffffff;">${n}</div><div style="font-size:12px;color:#a5b4fc;">${l}</div></div>`
  ), { bg: "#0c1b4d", pad: "8px 24px" }),
  coupon("1AÑO", { label: "Regalo de aniversario · 20%", border: "#4dabf7", bg: "#14287a", color: "#ffffff", pad: "18px 64px", rowBg: "#0c1b4d" }),
  button("Celebrarlo con una compra", { align: "center", bg: "#4dabf7", color: "#0c1b4d", rowBg: "#0c1b4d", pad: "12px 32px 46px" }),
  footer({ bg: "#070f2e", circle: "#16245e" }),
], { bg: "#e3e8f8", body: "#0c1b4d" }));

// Export: cada plantilla lleva la categoría principal como "category" para el filtro.
export const systemTemplates = T.map((t) => ({ ...t, category: t.tags[0] }));
