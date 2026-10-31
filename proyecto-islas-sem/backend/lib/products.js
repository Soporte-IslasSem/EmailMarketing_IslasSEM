// Productos para vender fuera del CRM: imagen (1080×1080), enlace de pago (Stripe, PayPal…),
// página pública del producto y catálogos tipo «linktree» para compartir por WhatsApp.
//
// - POST /api/products/image { productId, data, mime } | { productId, remove: true }
// - GET  /api/products/img/:id   imagen pública del producto
// - GET  /p/:id                  página del producto (?embed=1 para <iframe>)
// - GET  /c/:id                  página del catálogo (?embed=1 para <iframe>)
// Las páginas se generan en el servidor con etiquetas Open Graph: así WhatsApp, Facebook, etc.
// enseñan la foto, el nombre y el precio al pegar el enlace.
const { db, bucket } = require("./firebase");
const { staffFromReq } = require("./access");
const { getOrg, brandOf } = require("./tenant");

const PUBLIC_URL = (process.env.PUBLIC_URL || "https://email-marketing.islassem.com").replace(/\/$/, "");
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const fail = (res, msg, code = 400) => res.status(code).json({ ok: false, error: msg });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const httpsUrl = (u) => (/^https:\/\/[^\s"'<>]+$/i.test(String(u || "").trim()) ? String(u).trim() : "");
const money = (n) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(n) || 0);
const imgUrl = (p) => (p.imagePath ? `${PUBLIC_URL}/api/products/img/${p.id}?v=${p.imageV || 0}` : "");

async function productOf(id) {
  if (!ID.test(String(id || ""))) return null;
  const s = await db.collection("products").doc(String(id)).get();
  return s.exists ? { id: s.id, ...s.data() } : null;
}

// POST /api/products/image — la imagen ya llega recortada a 1080×1080 desde el navegador.
async function uploadImage(req, res) {
  const user = await staffFromReq(req);
  if (!user) return fail(res, "Sesión no válida", 401);
  const p = await productOf(req.body?.productId);
  if (!p || p.orgId !== user.orgId) return fail(res, "Producto no encontrado", 404);
  const ref = db.collection("products").doc(p.id);
  if (req.body.remove) {
    if (p.imagePath) await bucket().file(p.imagePath).delete({ ignoreNotFound: true }).catch(() => {});
    await ref.update({ imagePath: "", imageUrl: "", updatedAt: new Date() });
    return res.json({ ok: true, imageUrl: "" });
  }
  const mime = ["image/jpeg", "image/png", "image/webp"].includes(req.body.mime) ? req.body.mime : "";
  const buf = Buffer.from(String(req.body.data || ""), "base64");
  if (!mime) return fail(res, "La imagen tiene que ser JPG, PNG o WebP");
  if (!buf.length || buf.length > 3 * 1024 * 1024) return fail(res, "La imagen tiene que pesar menos de 3 MB");
  const v = Date.now();
  const path = `products/${user.orgId}/${p.id}-${v}.${mime.split("/")[1]}`;
  await bucket().file(path).save(buf, { contentType: mime, resumable: false });
  if (p.imagePath) await bucket().file(p.imagePath).delete({ ignoreNotFound: true }).catch(() => {});
  const imageUrl = imgUrl({ id: p.id, imagePath: path, imageV: v });
  await ref.update({ imagePath: path, imageV: v, imageUrl, updatedAt: new Date() });
  res.json({ ok: true, imageUrl });
}

// GET /api/products/img/:id
async function image(req, res) {
  const p = await productOf(req.params.id);
  if (!p?.imagePath || !p.imagePath.startsWith(`products/${p.orgId}/`)) return res.sendStatus(404);
  try {
    const f = bucket().file(p.imagePath);
    const [meta] = await f.getMetadata();
    res.set({ "Content-Type": meta.contentType || "image/jpeg", "Cache-Control": "public, max-age=604800" });
    f.createReadStream().on("error", () => res.end()).pipe(res);
  } catch { res.sendStatus(404); }
}

/* ------------------------------------------------------------------ páginas públicas */

function page({ title, desc, image, url, brand, embed, body }) {
  const c = brand.color || "#136B68", a = brand.accent || "#E2B83C";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}">
${image ? `<meta property="og:image" content="${esc(image)}"><meta property="og:image:width" content="1080"><meta property="og:image:height" content="1080">` : ""}
<meta name="twitter:card" content="summary_large_image"><meta name="robots" content="noindex">
<style>
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:${embed ? "transparent" : "#f3f7f7"};color:#22302f}
.wrap{max-width:${embed ? "100%" : "520px"};margin:0 auto;padding:${embed ? "0" : "24px 16px 40px"}}
.brand{display:flex;flex-direction:column;align-items:center;gap:8px;margin-bottom:18px;text-align:center}
.brand img{max-height:56px;max-width:200px}.brand b{font-size:15px;color:${c}}
.card{background:#fff;border-radius:16px;box-shadow:0 2px 14px rgba(0,0,0,.07);overflow:hidden;margin-bottom:14px}
.ph{width:100%;aspect-ratio:1/1;object-fit:cover;display:block;background:#e6f0ef}
.in{padding:16px 18px 18px}h1{font-size:20px;margin:0 0 6px}h2{font-size:16px;margin:0 0 4px}
.cat{font-size:12px;color:#7a8b8a;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px}
.price{font-size:20px;font-weight:700;color:${c};margin:6px 0 10px}.d{font-size:14px;line-height:1.5;color:#4a5b5a;white-space:pre-line;margin:0 0 14px}
.btn{display:block;text-align:center;text-decoration:none;font-weight:700;padding:13px;border-radius:10px;margin-top:8px;font-size:15px}
.buy{background:${c};color:#fff}.wa{background:#fff;color:${c};border:2px solid ${c}}.more{background:${a};color:#22302f}
.row{display:flex;gap:12px;align-items:center;padding:10px;text-decoration:none;color:inherit}
.row img,.row .noimg{width:84px;height:84px;border-radius:10px;object-fit:cover;flex:none;background:#e6f0ef}
.row .p{font-weight:700;color:${c};font-size:15px}.empty{text-align:center;color:#7a8b8a;padding:30px}
.foot{text-align:center;font-size:12px;color:#9aa8a7;margin-top:18px}
</style></head><body><div class="wrap">${body}</div></body></html>`;
}

const header = (b, embed) => (embed ? "" : `<div class="brand">${b.logoUrl ? `<img src="${esc(b.logoUrl)}" alt="${esc(b.name)}">` : ""}<b>${esc(b.name)}</b></div>`);
const shareWa = (url, text) => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
const visible = (p) => p && p.active !== false && p.public !== false;

// GET /p/:id
async function productPage(req, res) {
  const p = await productOf(req.params.id);
  if (!visible(p)) return res.status(404).send(page({ title: "No disponible", desc: "", brand: {}, body: `<p class="empty">Este producto ya no está disponible.</p>` }));
  const b = brandOf(await getOrg(p.orgId));
  const embed = req.query.embed === "1";
  const url = `${PUBLIC_URL}/p/${p.id}`;
  const pay = httpsUrl(p.paymentUrl);
  const desc = [p.description, p.price ? money(p.price) : ""].filter(Boolean).join(" · ").slice(0, 200);
  const body = `${header(b, embed)}<div class="card">${p.imageUrl ? `<img class="ph" src="${esc(imgUrl(p))}" alt="${esc(p.name)}">` : ""}<div class="in">
${p.category ? `<div class="cat">${esc(p.category)}</div>` : ""}<h1>${esc(p.name)}</h1>
${p.price ? `<div class="price">${esc(money(p.price))}</div>` : ""}${p.description ? `<p class="d">${esc(p.description)}</p>` : ""}
${pay ? `<a class="btn buy" href="${esc(pay)}" target="_blank" rel="noopener">${esc(p.buyLabel || "Comprar")}</a>` : ""}
${embed ? "" : `<a class="btn wa" href="${esc(shareWa(url, p.name))}" target="_blank" rel="noopener">Compartir por WhatsApp</a>`}
</div></div>${embed ? "" : `<div class="foot">${esc(b.legalName || b.name)}</div>`}`;
  res.set("Cache-Control", "no-cache").send(page({ title: `${p.name}${b.name ? ` · ${b.name}` : ""}`, desc, image: p.imageUrl ? imgUrl(p) : "", url, brand: b, embed, body }));
}

// GET /c/:id
async function catalogPage(req, res) {
  const id = String(req.params.id || "");
  const s = ID.test(id) ? await db.collection("catalogs").doc(id).get() : null;
  const cat = s?.exists ? { id: s.id, ...s.data() } : null;
  if (!cat || cat.active === false) return res.status(404).send(page({ title: "No disponible", desc: "", brand: {}, body: `<p class="empty">Este catálogo ya no está disponible.</p>` }));
  const b = brandOf(await getOrg(cat.orgId));
  const embed = req.query.embed === "1";
  const ids = (Array.isArray(cat.productIds) ? cat.productIds : []).filter((x) => ID.test(String(x))).slice(0, 100);
  const snaps = ids.length ? await db.getAll(...ids.map((x) => db.collection("products").doc(x))) : [];
  const items = snaps.filter((x) => x.exists).map((x) => ({ id: x.id, ...x.data() })).filter((p) => p.orgId === cat.orgId && visible(p));
  const url = `${PUBLIC_URL}/c/${cat.id}`;
  const cover = items.find((p) => p.imageUrl);
  const rows = items.map((p) => {
    const pay = httpsUrl(p.paymentUrl);
    return `<div class="card"><a class="row" href="${esc(`${PUBLIC_URL}/p/${p.id}`)}" target="_blank" rel="noopener">
${p.imageUrl ? `<img src="${esc(imgUrl(p))}" alt="">` : `<span class="noimg"></span>`}
<div><h2>${esc(p.name)}</h2>${p.price ? `<div class="p">${esc(money(p.price))}</div>` : ""}</div></a>
${pay ? `<div class="in" style="padding-top:0"><a class="btn buy" href="${esc(pay)}" target="_blank" rel="noopener">${esc(p.buyLabel || "Comprar")}</a></div>` : ""}</div>`;
  }).join("");
  const body = `${header(b, embed)}${embed ? "" : `<h1 style="text-align:center">${esc(cat.name)}</h1>${cat.description ? `<p class="d" style="text-align:center">${esc(cat.description)}</p>` : ""}`}
${rows || `<p class="empty">Todavía no hay productos en este catálogo.</p>`}
${embed ? "" : `<a class="btn wa" href="${esc(shareWa(url, cat.name))}" target="_blank" rel="noopener">Compartir por WhatsApp</a><div class="foot">${esc(b.legalName || b.name)}</div>`}`;
  res.set("Cache-Control", "no-cache").send(page({ title: `${cat.name}${b.name ? ` · ${b.name}` : ""}`, desc: cat.description || `${items.length} productos`, image: cover ? imgUrl(cover) : "", url, brand: b, embed, body }));
}

module.exports = { uploadImage, image, productPage, catalogPage, httpsUrl };
