// Contratos con firma electrónica (CRM › Ventas › Contratos).
//
// - Plantillas (contractTemplates): un .DOCX convertido a bloques de texto (lo hace la app al
//   subirlo) con sus huecos [..] y de dónde sale cada uno; o un PDF que se firma tal cual.
// - Contrato (contracts): uno o varios documentos para un cliente (un "sobre"). Al enviarlo,
//   la empresa ya firma (firma guardada en Ajustes + huella de quien envía) y el cliente recibe
//   un enlace personal /firmar/<token>. Allí revisa, confirma sus datos, dibuja su firma y firma.
// - Al firmar: el servidor anota la huella (nombre, DNI/NIF, sociedad y CIF si es empresa, IP,
//   navegador, fecha y hora DEL SERVIDOR), genera los PDF firmados con el certificado, calcula
//   su huella SHA-256, los guarda, los envía a las dos partes y la negociación avanza de etapa.
// - Verificación pública: /verificar/<código> comprueba que un contrato existe y su estado.
//
// Todo pasa por aquí (Admin SDK): la app no lee ni escribe estas colecciones directamente, así
// que no hace falta tocar las reglas de la base de datos. Quien llama tiene que tener acceso
// a la app (staffFromReq), salvo las rutas públicas del enlace de firma.
// Cada empresa tiene sus ajustes (organizations/{org}/private/contractSettings), sus plantillas y
// sus contratos (orgId) y sus archivos en contracts/<org>/…: nadie toca los de otra.
const crypto = require("crypto");
const { admin, db, bucket } = require("./firebase");
const { staffFromReq } = require("./access");
const { DEFAULT_ORG_ID, norm, addActivity } = require("./link");
const { orgPrivate, brandFor, featuresOf, getOrg } = require("./tenant");
const { brandMailHtml } = require("./brandMail");
const { renderPdf } = require("./pdf");

const PUBLIC_URL = (process.env.PUBLIC_URL || "https://email-marketing.islassem.com").replace(/\/$/, "");
const TZ = "Atlantic/Canary";
const SETTINGS = (orgId) => orgPrivate(orgId || DEFAULT_ORG_ID, "contractSettings");
const orgOf = (c) => c?.orgId || DEFAULT_ORG_ID;
const HOLE = /\[([^\[\]]{1,120})\]/g;
const TEAL = "#136B68";
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clip = (s, n = 200) => String(s ?? "").trim().slice(0, n);
const when = (d) => new Date(d).toLocaleString("es-ES", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const today = () => new Date().toLocaleDateString("es-ES", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" });
const money = (n) => Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" });
const newCode = () => crypto.randomBytes(4).toString("hex").toUpperCase().replace(/^(.{4})/, "$1-");
const ipOf = (req) => clip(req.ip || req.headers["x-forwarded-for"] || "", 80);
const uaOf = (req) => clip(req.headers["user-agent"] || "", 300);

async function staff(req, res) {
  const user = await staffFromReq(req);
  if (!user) { res.status(401).json({ ok: false, error: "Sesión no válida" }); return null; }
  if (!featuresOf(user.org).contracts) { res.status(403).json({ ok: false, error: "Los contratos no están incluidos en tu plan" }); return null; }
  return user;
}
const fail = (res, msg, code = 400) => res.status(code).json({ ok: false, error: msg });

/* ------------------------------------------------------------------ bloques (.DOCX ya convertido) */

// Bloques: [{ t: "h"|"p"|"li"|"table", runs:[{text,b,i,u}], level, align, rows:[[runs]] }]
function cleanRuns(runs) {
  return (Array.isArray(runs) ? runs : []).slice(0, 400).map((r) => ({
    text: String(r?.text ?? "").slice(0, 5000), ...(r?.b ? { b: true } : {}), ...(r?.i ? { i: true } : {}), ...(r?.u ? { u: true } : {}),
  })).filter((r) => r.text);
}
function cleanBlocks(blocks) {
  return (Array.isArray(blocks) ? blocks : []).slice(0, 3000).map((b) => {
    const t = ["h", "p", "li", "table"].includes(b?.t) ? b.t : "p";
    if (t === "table") return { t, rows: (Array.isArray(b.rows) ? b.rows : []).slice(0, 200).map((row) => (Array.isArray(row) ? row : []).slice(0, 12).map(cleanRuns)) };
    return { t, runs: cleanRuns(b.runs), ...(t === "h" ? { level: Math.min(3, Math.max(1, Number(b.level) || 1)) } : {}), ...(["center", "right", "justify"].includes(b.align) ? { align: b.align } : {}), ...(b.ordered ? { ordered: true } : {}) };
  });
}
const blockText = (b) => (b.t === "table" ? b.rows.flat().flat().map((r) => r.text).join(" ") : (b.runs || []).map((r) => r.text).join(""));
function holesOf(blocks) {
  const out = new Set();
  for (const b of blocks || []) for (const m of blockText(b).matchAll(HOLE)) out.add(m[0]);
  return [...out];
}
// Las líneas de firma del propio documento ("______", "Firma del Cliente"…) se quitan: las firmas
// van en su recuadro al final, con la huella.
const isSignLine = (b) => b.t !== "table" && (/^[_\s.]{6,}$/.test(blockText(b)) || /^firma del? (cliente|prestador|proveedor|contratante|contratista)/i.test(blockText(b).trim()));
const fill = (text, values) => String(text).replace(HOLE, (m) => (values[m] != null && values[m] !== "" ? String(values[m]) : m));

/* ------------------------------------------------------------------ de dónde sale cada hueco */

// Orígenes válidos de un hueco (el resto se trata como "preguntar al enviar").
const SOURCES = [
  "contact.fullName", "contact.firstName", "contact.lastName", "contact.dni", "contact.email", "contact.phone", "contact.address",
  "contact.city", "contact.province", "company.name", "company.cif", "company.address", "deal.amount", "deal.title",
  "org.name", "org.cif", "org.address", "org.signerName", "org.signerDni", "org.signerRole", "date.today", "form", "ask", "fixed",
];
function cleanFields(fields, holes) {
  const byKey = new Map((Array.isArray(fields) ? fields : []).map((f) => [String(f?.key || ""), f]));
  return holes.map((key) => {
    const f = byKey.get(key) || {};
    const source = SOURCES.includes(f.source) ? f.source : "ask";
    return { key, source, ...(source === "fixed" || source === "form" ? { value: clip(f.value, 300) } : {}) };
  });
}

// Datos del cliente para rellenar (contacto, su empresa, la negociación y el último formulario).
async function contextFor({ contactId, dealId, orgId }) {
  // Solo documentos de la misma empresa.
  const get = async (col, id) => {
    const d = id ? (await db.collection(col).doc(String(id)).get().catch(() => null))?.data() || null : null;
    return d && orgOf(d) === orgId ? d : null;
  };
  const deal = await get("deals", dealId);
  const contact = await get("contacts", contactId || deal?.contactId || "");
  const company = await get("companies", contact?.companyId || deal?.companyId || "");
  const settings = (await (await SETTINGS(orgId)).get()).data() || {};
  // Último formulario rellenado por esta persona / negociación (para los huecos "form").
  let formData = {};
  const subs = [];
  if (dealId) subs.push(...(await db.collection("formSubmissions").where("dealId", "==", dealId).get()).docs);
  const cid = contactId || deal?.contactId;
  if (cid) subs.push(...(await db.collection("formSubmissions").where("contactId", "==", cid).get()).docs);
  subs.sort((a, b) => (a.data().createdAt?.toMillis?.() || 0) - (b.data().createdAt?.toMillis?.() || 0));
  subs.filter((x) => orgOf(x.data()) === orgId).forEach((s) => { formData = { ...formData, ...(s.data().data || {}) }; });
  return { deal, contact, company, settings, formData, contactId: contact || deal ? cid || "" : "", dealId: deal ? dealId : "", orgId };
}

function valueFor(field, ctx) {
  const c = ctx.contact || {}, co = ctx.company || {}, d = ctx.deal || {}, org = ctx.settings.company || {}, sg = ctx.settings.signer || {};
  switch (field.source) {
    case "contact.fullName": return [c.firstName, c.lastName].filter(Boolean).join(" ");
    case "contact.firstName": return c.firstName || "";
    case "contact.lastName": return c.lastName || "";
    case "contact.dni": return c.dni || "";
    case "contact.email": return c.email || "";
    case "contact.phone": return c.phone || c.whatsapp || "";
    case "contact.address": return [c.address, c.city, c.province].filter(Boolean).join(", ");
    case "contact.city": return c.city || "";
    case "contact.province": return c.province || "";
    case "company.name": return co.name || c.company || "";
    case "company.cif": return co.cif || "";
    case "company.address": return [co.address, co.province].filter(Boolean).join(", ");
    case "deal.amount": return d.amount ? money(d.amount) : "";
    case "deal.title": return d.title || "";
    case "org.name": return org.name || "";
    case "org.cif": return org.cif || "";
    case "org.address": return org.address || "";
    case "org.signerName": return sg.name || "";
    case "org.signerDni": return sg.dni || "";
    case "org.signerRole": return sg.role || "";
    case "date.today": return today();
    case "form": {
      const want = String(field.value || "").trim().toLowerCase();
      const hit = Object.entries(ctx.formData || {}).find(([k]) => k.trim().toLowerCase() === want);
      return hit ? String(hit[1] || "") : "";
    }
    case "fixed": return field.value || "";
    default: return "";
  }
}
function resolveValues(fields, ctx, manual = {}) {
  const values = {}, missing = [];
  for (const f of fields || []) {
    const m = manual[f.key];
    const v = m != null && String(m).trim() !== "" ? clip(m, 500) : clip(valueFor(f, ctx), 500);
    values[f.key] = v;
    if (!v) missing.push(f.key);
  }
  return { values, missing };
}

/* ------------------------------------------------------------------ PDF firmado + certificado */

function runsToPdf(runs, values) {
  // Solo se marca lo que el trozo trae: así un título sigue en negrita aunque su texto no la lleve.
  return (runs || []).map((r) => ({ text: fill(r.text, values), ...(r.b ? { bold: true } : {}), ...(r.i ? { italics: true } : {}), ...(r.u ? { decoration: "underline" } : {}) }));
}
function blocksToPdf(blocks, values) {
  const out = [];
  for (const b of blocks || []) {
    if (isSignLine(b)) continue;
    if (b.t === "table") {
      const width = Math.max(...b.rows.map((r) => r.length), 1);
      out.push({
        table: { widths: Array(width).fill("*"), body: b.rows.map((row) => Array.from({ length: width }, (_, i) => ({ text: runsToPdf(row[i] || [], values), fontSize: 9 }))) },
        layout: { hLineColor: () => "#cfdcdc", vLineColor: () => "#cfdcdc" }, margin: [0, 4, 0, 8],
      });
    } else if (b.t === "h") {
      out.push({ text: runsToPdf(b.runs, values), bold: true, fontSize: b.level === 1 ? 15 : b.level === 2 ? 12.5 : 11, color: TEAL, margin: [0, b.level === 1 ? 4 : 10, 0, 5], alignment: b.align || "left" });
    } else if (b.t === "li") {
      out.push({ columns: [{ width: 12, text: "•" }, { width: "*", text: runsToPdf(b.runs, values) }], margin: [8, 0, 0, 3] });
    } else {
      out.push({ text: runsToPdf(b.runs, values), margin: [0, 0, 0, 6], alignment: b.align || "justify" });
    }
  }
  return out;
}
async function imageData(path) {
  if (!path) return null;
  const [buf] = await bucket().file(path).download();
  return "data:image/png;base64," + buf.toString("base64");
}
function signerBox(title, s, img) {
  return {
    width: "*", stack: [
      { text: title, bold: true, color: TEAL, margin: [0, 0, 0, 4] },
      // Recuadro de altura fija: así las dos líneas de firma quedan siempre a la misma altura.
      {
        table: { widths: [220], heights: [74], body: [[img ? { image: img, fit: [200, 70] } : { text: "(pendiente de firma)", color: "#999", margin: [0, 28, 0, 0] }]] },
        layout: "noBorders",
      },
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 220, y2: 0, lineWidth: 0.7, lineColor: "#555" }] },
      { text: [s.name, s.dni && `· ${s.dni}`].filter(Boolean).join(" "), fontSize: 9, margin: [0, 3, 0, 0] },
      ...(s.company ? [{ text: `En representación de: ${s.company}${s.cif ? ` · CIF ${s.cif}` : ""}`, fontSize: 8.5 }] : []),
      ...(s.role ? [{ text: s.role, fontSize: 8.5 }] : []),
      ...(s.signedAt ? [{ text: `Firmado el ${when(s.signedAt)} (hora de Canarias)`, fontSize: 8.5 }] : []),
      ...(s.ip ? [{ text: `IP ${s.ip}`, fontSize: 8, color: "#666" }] : []),
    ],
  };
}
function certificate(c, docInfo) {
  const row = (k, v) => [{ text: k, bold: true, fontSize: 8.5 }, { text: v || "—", fontSize: 8.5 }];
  const signerRows = (label, s) => [
    [{ text: label, bold: true, color: TEAL, colSpan: 2, margin: [0, 6, 0, 2] }, {}],
    row("Nombre", s.name), row("DNI / NIF", s.dni), ...(s.company ? [row("Sociedad", s.company), row("CIF", s.cif)] : []),
    ...(s.role ? [row("Cargo", s.role)] : []), row("Email", s.email), row("Fecha y hora", s.signedAt ? `${when(s.signedAt)} (Atlantic/Canary)` : ""),
    row("IP", s.ip), row("Navegador / dispositivo", s.ua), ...(s.by ? [row("Enviado por", s.by)] : []),
  ];
  return [
    { text: "Certificado de firma electrónica", fontSize: 15, bold: true, color: TEAL, pageBreak: "before", margin: [0, 0, 0, 4] },
    { text: "Este certificado forma parte del documento y recoge las evidencias de la firma de las dos partes.", fontSize: 9, color: "#555", margin: [0, 0, 0, 10] },
    {
      table: {
        widths: [130, "*"], body: [
          row("Documento", docInfo.name), row("ID del contrato", c.code), row("Huella del contenido (SHA-256)", docInfo.contentHash),
          ...signerRows(`Firma de ${c.provider?.company || "ISLAS SEM"} (prestador)`, c.provider || {}), ...signerRows("Firma del cliente", c.client || {}),
        ],
      },
      layout: "lightHorizontalLines",
    },
    { text: "Historial", bold: true, color: TEAL, margin: [0, 12, 0, 4] },
    ...(c.events || []).map((e) => ({ text: `${when(e.at)} · ${e.label}${e.ip ? ` · IP ${e.ip}` : ""}`, fontSize: 8.5 })),
    { text: `Comprobar la autenticidad: ${PUBLIC_URL}/verificar/${c.code}`, fontSize: 8.5, margin: [0, 12, 0, 0], color: TEAL },
    { text: "Firma electrónica simple con evidencias conforme al Reglamento (UE) 910/2014 (eIDAS). La fecha y la hora las registra el servidor de la plataforma de firma, no el dispositivo del firmante.", fontSize: 7.5, color: "#777", margin: [0, 8, 0, 0] },
  ];
}
async function buildSignedPdf(c, d) {
  const [pImg, cImg] = await Promise.all([imageData(c.provider?.signaturePath), imageData(c.client?.signaturePath)]);
  const isPdf = d.kind === "pdf";
  const contentHash = isPdf ? d.sourceHash : sha256(Buffer.from(JSON.stringify({ blocks: d.blocks, values: d.values })));
  const body = isPdf
    ? [{ text: "Hoja de firmas", fontSize: 15, bold: true, color: TEAL, margin: [0, 0, 0, 6] },
      { text: `Las partes firman el documento «${d.name}» (PDF adjunto). Su huella SHA-256, que identifica el archivo exacto firmado, es:`, fontSize: 9.5 },
      { text: d.sourceHash, fontSize: 8.5, margin: [0, 4, 0, 14], color: "#333" }]
    : blocksToPdf(d.blocks, d.values || {});
  const definition = {
    pageSize: "A4", pageMargins: [50, 50, 50, 55], defaultStyle: { font: "Roboto", fontSize: 10, lineHeight: 1.2 },
    info: { title: d.name, author: c.provider?.company || "ISLAS SEM" },
    footer: (page, count) => ({ text: `Documento firmado electrónicamente · ID ${c.code} · Página ${page} de ${count}`, fontSize: 7.5, color: "#777", alignment: "center", margin: [0, 18, 0, 0] }),
    content: [
      ...body,
      { text: "Firmas", bold: true, color: TEAL, fontSize: 12, margin: [0, 18, 0, 8], unbreakable: true },
      { columns: [signerBox("Firma del Prestador del Servicio", c.provider || {}, pImg), signerBox("Firma del Cliente", c.client || {}, cImg)], columnGap: 30, unbreakable: true },
      ...certificate(c, { name: d.name, contentHash }),
    ],
  };
  const pdf = await renderPdf(definition);
  return { pdf, contentHash };
}

/* ------------------------------------------------------------------ correo */

const mailHtml = (brand, title, body, cta, url) => brandMailHtml(brand, { title, body, cta, ctaUrl: url });
const queue = (orgId, item) => db.collection("outbox").add({
  orgId, text: "", status: item.to ? "pending" : "skipped", attempts: 0, error: item.to ? "" : "Sin email del destinatario",
  sentAt: null, attachment: null, source: "contracts", createdAt: new Date(), updatedAt: new Date(), ...item,
});

/* ------------------------------------------------------------------ crear y enviar */

// docs de entrada: [{ templateId, values? } | { upload: { name, kind, blocks?, data? (pdf base64) }, values? }]
async function createContract({ orgId, contactId, dealId, title, docs, manual = {}, by, ip, ua, fromRule = "" }) {
  const ctx = await contextFor({ contactId, dealId, orgId });
  const s = ctx.settings;
  const brand = await brandFor(orgId);
  if (!s.signer?.name || !s.company?.name || !s.signaturePath) throw new Error("Configura antes la firma de tu empresa en Contratos › Ajustes (empresa, firmante y firma).");
  if (!ctx.contactId && !ctx.dealId) throw new Error("No se encontró el cliente");
  const email = norm(ctx.contact?.email || ctx.deal?.contactEmail);
  if (!email) throw new Error("El cliente no tiene email: añádelo en su ficha para poder enviarle el contrato.");
  const out = [];
  const missing = [];
  for (const [i, d] of (docs || []).slice(0, 10).entries()) {
    if (d.templateId) {
      const t = (await db.collection("contractTemplates").doc(String(d.templateId)).get()).data();
      if (!t || t.archived || orgOf(t) !== orgId) throw new Error("Una de las plantillas ya no existe");
      if (t.kind === "pdf") { out.push({ name: t.name, kind: "pdf", sourcePath: t.sourcePath, sourceHash: t.sourceHash, templateId: d.templateId }); continue; }
      const r = resolveValues(t.fields, ctx, { ...manual, ...(d.values || {}) });
      r.missing.forEach((k) => missing.push(`${t.name}: ${k}`));
      out.push({ name: t.name, kind: "docx", blocks: t.blocks, values: r.values, templateId: d.templateId });
    } else if (d.upload) {
      const name = clip(d.upload.name || `Documento ${i + 1}`, 120);
      if (d.upload.kind === "pdf") {
        const buf = Buffer.from(String(d.upload.data || ""), "base64");
        if (!buf.length || buf.length > 10 * 1024 * 1024 || buf.subarray(0, 4).toString() !== "%PDF") throw new Error(`"${name}" no es un PDF válido (máx. 10 MB)`);
        const path = `contracts/${orgId}/originals/${Date.now()}-${crypto.randomBytes(4).toString("hex")}.pdf`;
        await bucket().file(path).save(buf, { contentType: "application/pdf", resumable: false });
        out.push({ name, kind: "pdf", sourcePath: path, sourceHash: sha256(buf) });
      } else {
        const blocks = cleanBlocks(d.upload.blocks);
        const fields = cleanFields(d.upload.fields, holesOf(blocks));
        const r = resolveValues(fields, ctx, { ...manual, ...(d.values || {}) });
        r.missing.forEach((k) => missing.push(`${name}: ${k}`));
        out.push({ name, kind: "docx", blocks, values: r.values });
      }
    }
  }
  if (!out.length) throw new Error("Añade al menos un documento");
  if (missing.length) { const e = new Error("Faltan datos"); e.missing = missing; throw e; }
  const c = ctx.contact || {};
  const now = Date.now();
  const contract = {
    orgId, code: newCode(), token: crypto.randomBytes(24).toString("hex"),
    title: clip(title || out.map((d) => d.name).join(" + "), 200), status: "sent",
    contactId: ctx.contactId, dealId: ctx.dealId, companyId: c.companyId || "",
    clientName: [c.firstName, c.lastName].filter(Boolean).join(" ") || ctx.deal?.contact || "", clientEmail: email,
    docs: out,
    provider: {
      name: s.signer.name, dni: s.signer.dni || "", role: s.signer.role || "", company: s.company.name, cif: s.company.cif || "",
      email: s.signer.email || by || "", signaturePath: s.signaturePath, signedAt: now, ip: ip || "servidor", by: by || "automatización",
      ua: ua || (fromRule ? "Envío automático (regla del Kanban)" : ""),
    },
    client: { email },
    events: [
      { at: now, label: `Firmado por ${s.company.name} (${s.signer.name})${by ? ` · enviado por ${by}` : " · envío automático"}`, ip: ip || "" },
      { at: now, label: `Enviado a firmar a ${email}` },
    ],
    sentBy: by || "", fromRule, createdAt: now, updatedAt: now,
  };
  const ref = await db.collection("contracts").add(contract);
  const url = `${PUBLIC_URL}/firmar/${contract.token}`;
  await queue(orgId, {
    to: email, toName: contract.clientName, subject: `${contract.title} · para firmar · ${brand.name}`, kind: "contract", dealId: ctx.dealId, contactId: ctx.contactId,
    html: mailHtml(brand, "Documento para firmar", `Hola ${esc(contract.clientName)},<br><br>${esc(s.company.name)} te ha enviado <b>${esc(contract.title)}</b> para que lo revises y lo firmes electrónicamente.<br><br>Solo tienes que abrir el enlace, revisar el documento, confirmar tus datos y firmar con el ratón o con el dedo.`, "Revisar y firmar", url),
  });
  await addActivity(orgId, {
    type: "Documento", title: `✍️ Contrato enviado a firmar: ${contract.title} → ${email}`, done: true,
    entity: ctx.dealId ? "deal" : "contact", entityId: ctx.dealId || ctx.contactId, contactId: ctx.contactId,
  });
  return { id: ref.id, code: contract.code, url };
}

/* ------------------------------------------------------------------ rutas de la app (con acceso) */

async function getSettings(req, res) {
  const user = await staff(req, res);
  if (!user) return;
  const s = (await (await SETTINGS(user.orgId)).get()).data() || {};
  // La firma guardada se devuelve para verla (enlace temporal): sin ella parecía que se había borrado.
  const signatureUrl = s.signaturePath
    ? await bucket().file(s.signaturePath).getSignedUrl({ action: "read", expires: Date.now() + 30 * 60e3 }).then(([u]) => u).catch(() => "")
    : "";
  res.json({ ok: true, settings: { company: s.company || {}, signer: s.signer || {}, hasSignature: !!s.signaturePath, signatureUrl, notifyEmail: s.notifyEmail || "" } });
}
async function saveSettings(req, res) {
  const user = await staff(req, res);
  if (!user) return;
  if (!user.isAdmin) return fail(res, "Solo un administrador puede cambiar los ajustes de contratos", 403);
  const orgId = user.orgId;
  const b = req.body || {};
  const patch = {
    company: { name: clip(b.company?.name, 150), cif: clip(b.company?.cif, 30), address: clip(b.company?.address, 250) },
    signer: { name: clip(b.signer?.name, 120), dni: clip(b.signer?.dni, 30), role: clip(b.signer?.role, 80), email: norm(b.signer?.email).slice(0, 150) },
    notifyEmail: norm(b.notifyEmail).slice(0, 150), updatedAt: Date.now(), updatedBy: user.email,
  };
  if (b.signature) {
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.signature));
    if (!m) return fail(res, "Firma no válida");
    const path = `contracts/${orgId}/provider-signature-${Date.now()}.png`;
    await bucket().file(path).save(Buffer.from(m[1], "base64"), { contentType: "image/png", resumable: false });
    patch.signaturePath = path;
  }
  await (await SETTINGS(orgId)).set(patch, { merge: true });
  res.json({ ok: true });
}

async function listTemplates(req, res) {
  const user = await staff(req, res);
  if (!user) return;
  const snap = await db.collection("contractTemplates").where("orgId", "==", user.orgId).get();
  const templates = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((t) => !t.archived)
    .map(({ blocks, ...t }) => ({ ...t, preview: (blocks || []).slice(0, 400) }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  res.json({ ok: true, templates });
}
// { id?, name, kind: "docx"|"pdf", blocks?, fields?, data? (pdf base64) }
async function saveTemplate(req, res) {
  const user = await staff(req, res);
  if (!user) return;
  const orgId = user.orgId;
  const b = req.body || {};
  const name = clip(b.name, 120);
  if (!name) return fail(res, "Ponle un nombre a la plantilla");
  const ref = b.id ? db.collection("contractTemplates").doc(String(b.id)) : db.collection("contractTemplates").doc();
  const cur = b.id ? (await ref.get()).data() : null;
  if (b.id && (!cur || orgOf(cur) !== orgId)) return fail(res, "La plantilla no existe", 404);
  const kind = cur?.kind || (b.kind === "pdf" ? "pdf" : "docx");
  const data = { orgId, name, kind, updatedAt: Date.now(), updatedBy: user.email };
  if (kind === "docx") {
    const blocks = b.blocks ? cleanBlocks(b.blocks) : cur?.blocks || [];
    if (!blocks.length) return fail(res, "El documento está vacío");
    Object.assign(data, { blocks, fields: cleanFields(b.fields, holesOf(blocks)) });
  } else if (!cur) {
    const buf = Buffer.from(String(b.data || ""), "base64");
    if (!buf.length || buf.length > 10 * 1024 * 1024 || buf.subarray(0, 4).toString() !== "%PDF") return fail(res, "No es un PDF válido (máx. 10 MB)");
    const path = `contracts/${orgId}/templates/${ref.id}.pdf`;
    await bucket().file(path).save(buf, { contentType: "application/pdf", resumable: false });
    Object.assign(data, { sourcePath: path, sourceHash: sha256(buf), fields: [] });
  }
  if (!cur) Object.assign(data, { createdAt: Date.now(), createdBy: user.email });
  await ref.set(data, { merge: true });
  res.json({ ok: true, id: ref.id });
}
async function archiveTemplate(req, res) {
  const user = await staff(req, res);
  if (!user) return;
  const ref = db.collection("contractTemplates").doc(String(req.body?.id || "x"));
  const cur = (await ref.get()).data();
  if (!cur || orgOf(cur) !== user.orgId) return fail(res, "La plantilla no existe", 404);
  await ref.set({ archived: true, updatedAt: Date.now() }, { merge: true });
  res.json({ ok: true });
}

// Rellena los huecos con los datos del cliente sin enviar nada (para la ventana de envío).
async function prepare(req, res) {
  const user = await staff(req, res);
  if (!user) return;
  const { contactId, dealId, docs } = req.body || {};
  const ctx = await contextFor({ contactId, dealId, orgId: user.orgId });
  const out = [];
  for (const d of (Array.isArray(docs) ? docs : []).slice(0, 10)) {
    if (d.templateId) {
      const t = (await db.collection("contractTemplates").doc(String(d.templateId)).get()).data();
      if (!t || orgOf(t) !== user.orgId) continue;
      out.push(t.kind === "pdf" ? { name: t.name, kind: "pdf", fields: [] } : { name: t.name, kind: "docx", fields: t.fields, ...resolveValues(t.fields, ctx) });
    } else if (d.upload && d.upload.kind !== "pdf") {
      const blocks = cleanBlocks(d.upload.blocks);
      const fields = cleanFields(d.upload.fields, holesOf(blocks));
      out.push({ name: clip(d.upload.name, 120), kind: "docx", fields, ...resolveValues(fields, ctx) });
    } else out.push({ name: clip(d.upload?.name, 120), kind: "pdf", fields: [] });
  }
  const c = ctx.contact || {};
  res.json({ ok: true, docs: out, client: { name: [c.firstName, c.lastName].filter(Boolean).join(" "), email: c.email || ctx.deal?.contactEmail || "" }, ready: !!(ctx.settings.signaturePath && ctx.settings.signer?.name) });
}

async function send(req, res) {
  const user = await staff(req, res);
  if (!user) return;
  const b = req.body || {};
  try {
    const orgId = user.orgId;
    const r = await createContract({ orgId, contactId: b.contactId, dealId: b.dealId, title: b.title, docs: b.docs, manual: b.values || {}, by: user.email, ip: ipOf(req), ua: uaOf(req) });
    // "Guardar también como plantilla" (documentos subidos)
    for (const d of (b.docs || []).filter((x) => x.upload && x.saveAsTemplate)) {
      const ref = db.collection("contractTemplates").doc();
      if (d.upload.kind === "pdf") {
        const buf = Buffer.from(String(d.upload.data || ""), "base64");
        const path = `contracts/${orgId}/templates/${ref.id}.pdf`;
        await bucket().file(path).save(buf, { contentType: "application/pdf", resumable: false });
        await ref.set({ orgId, name: clip(d.upload.name, 120), kind: "pdf", sourcePath: path, sourceHash: sha256(buf), fields: [], createdAt: Date.now(), createdBy: user.email });
      } else {
        const blocks = cleanBlocks(d.upload.blocks);
        await ref.set({ orgId, name: clip(d.upload.name, 120), kind: "docx", blocks, fields: cleanFields(d.upload.fields, holesOf(blocks)), createdAt: Date.now(), createdBy: user.email });
      }
    }
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message, missing: e.missing || [] });
  }
}

const STATUS_LABEL = { sent: "Enviado", viewed: "Recibido", completed: "Firmado", cancelled: "Anulado" };
const RETAIN_YEARS = 10;
// Cuándo lo abrió el cliente: viewedAt (desde el 31/10/2026) o, en los anteriores, el evento.
const viewedAtOf = (c) => c.viewedAt || (c.events || []).find((e) => /^Abierto por el cliente/.test(e.label || ""))?.at || null;
async function list(req, res) {
  const user = await staff(req, res);
  if (!user) return;
  const { contactId, dealId } = req.query || {};
  let q = db.collection("contracts").where("orgId", "==", user.orgId);
  if (dealId) q = q.where("dealId", "==", String(dealId));
  else if (contactId) q = q.where("contactId", "==", String(contactId));
  const snap = await q.get();
  const contracts = snap.docs.map((d) => {
    const c = d.data();
    return {
      id: d.id, code: c.code, title: c.title, status: c.status, statusLabel: STATUS_LABEL[c.status] || c.status, clientName: c.clientName, clientEmail: c.clientEmail,
      contactId: c.contactId, dealId: c.dealId, createdAt: c.createdAt, viewedAt: viewedAtOf(c), completedAt: c.completedAt || null, sentBy: c.sentBy, fromRule: c.fromRule || "",
      baja: c.baja ? { at: c.baja.at, by: c.baja.by, reason: c.baja.reason, retainUntil: c.baja.retainUntil } : null,
      docs: (c.docs || []).map((x, i) => ({ i, name: x.name, kind: x.kind, signed: !!x.signedPath })), events: c.events || [],
    };
  }).sort((a, b) => b.createdAt - a.createdAt);
  res.json({ ok: true, contracts });
}
async function fileUrl(req, res) {
  const user = await staff(req, res);
  if (!user) return;
  const { id, i = 0, which = "signed" } = req.body || {};
  const c0 = (await db.collection("contracts").doc(String(id || "x")).get()).data();
  const c = c0 && orgOf(c0) === user.orgId ? c0 : null;
  const d = c?.docs?.[Number(i)];
  const path = which === "original" ? d?.sourcePath : d?.signedPath;
  if (!path) return fail(res, "Ese archivo no existe todavía", 404);
  const [url] = await bucket().file(path).getSignedUrl({ action: "read", expires: Date.now() + 10 * 60e3 });
  res.json({ ok: true, url });
}
async function cancel(req, res) {
  const user = await staff(req, res);
  if (!user) return;
  const ref = db.collection("contracts").doc(String(req.body?.id || "x"));
  const c = (await ref.get()).data();
  if (!c || orgOf(c) !== user.orgId) return fail(res, "No existe", 404);
  if (c.status === "completed") return fail(res, "Ya está firmado: no se puede anular (se puede dar de baja)");
  if (c.baja) return fail(res, "Está dado de baja");
  await ref.update({ status: "cancelled", updatedAt: Date.now(), events: [...(c.events || []), { at: Date.now(), label: `Anulado por ${user.email}` }] });
  res.json({ ok: true });
}

// POST { id, reason } — dar de baja un contrato (también firmado). NUNCA se borra: queda guardado
// con quién, cuándo y por qué, y se conserva al menos RETAIN_YEARS años. Si aún no estaba firmado,
// su enlace de firma deja de funcionar.
async function baja(req, res) {
  const user = await staff(req, res);
  if (!user) return;
  const reason = clip(req.body?.reason, 300);
  if (reason.length < 3) return fail(res, "Escribe el motivo de la baja");
  const ref = db.collection("contracts").doc(String(req.body?.id || "x"));
  const now = Date.now();
  const out = await db.runTransaction(async (tx) => {
    const c = (await tx.get(ref)).data();
    if (!c || orgOf(c) !== user.orgId) return { code: 404, error: "No existe" };
    if (c.baja) return { code: 400, error: "Ya está dado de baja" };
    if (c.signing) return { code: 409, error: "El cliente lo está firmando ahora mismo; inténtalo en un momento" };
    const base = new Date(c.completedAt || c.createdAt || now);
    base.setFullYear(base.getFullYear() + RETAIN_YEARS);
    const info = { at: now, by: user.email, reason, prevStatus: c.status, retainUntil: base.getTime() };
    tx.update(ref, { baja: info, updatedAt: now, events: [...(c.events || []), { at: now, label: `Dado de baja por ${user.email}: ${reason}` }] });
    return { c, info };
  });
  if (out.error) return fail(res, out.error, out.code);
  await addActivity(user.orgId, {
    type: "Documento", title: `🗄 Contrato dado de baja: ${out.c.title} (${out.c.code}) · ${reason}`, done: true,
    entity: out.c.dealId ? "deal" : "contact", entityId: out.c.dealId || out.c.contactId, contactId: out.c.contactId || "",
  }).catch(() => {});
  res.json({ ok: true, retainUntil: out.info.retainUntil });
}

/* ------------------------------------------------------------------ rutas públicas (enlace de firma) */

async function byToken(token) {
  if (!/^[a-f0-9]{48}$/.test(String(token || ""))) return null;
  const snap = await db.collection("contracts").where("token", "==", token).limit(1).get();
  return snap.empty ? null : snap.docs[0];
}

async function publicView(req, res) {
  const doc = await byToken(req.params.token);
  if (!doc) return fail(res, "Este enlace no es válido", 404);
  const c = doc.data();
  if (c.status === "cancelled" || (c.baja && c.status !== "completed")) return fail(res, "Este documento ya no está disponible", 410);
  if (c.status === "sent") {
    const now = Date.now();
    await doc.ref.update({ status: "viewed", viewedAt: now, updatedAt: now, events: [...(c.events || []), { at: now, label: "Abierto por el cliente", ip: ipOf(req) }] });
  }
  const ctx = await contextFor({ contactId: c.contactId, dealId: c.dealId, orgId: orgOf(c) });
  const ct = ctx.contact || {}, co = ctx.company || {};
  const docs = [];
  for (const d of c.docs || []) {
    if (d.kind === "pdf") {
      const path = d.signedPath && c.status === "completed" ? d.signedPath : d.sourcePath;
      const [url] = await bucket().file(path).getSignedUrl({ action: "read", expires: Date.now() + 60 * 60e3 });
      docs.push({ name: d.name, kind: "pdf", url });
    } else {
      docs.push({ name: d.name, kind: "docx", blocks: (d.blocks || []).filter((b) => !isSignLine(b)).map((b) => (b.t === "table"
        ? { ...b, rows: b.rows.map((r) => r.map((runs) => runs.map((x) => ({ ...x, text: fill(x.text, d.values || {}) })))) }
        : { ...b, runs: (b.runs || []).map((x) => ({ ...x, text: fill(x.text, d.values || {}) })) })) });
    }
  }
  res.set("Cache-Control", "no-store").json({
    ok: true, title: c.title, code: c.code, status: c.status === "completed" ? "completed" : "pending",
    provider: { company: c.provider?.company, name: c.provider?.name, signedAt: c.provider?.signedAt },
    prefill: { name: [ct.firstName, ct.lastName].filter(Boolean).join(" ") || c.clientName, dni: ct.dni || "", company: co.name || ct.company || "", cif: co.cif || "" },
    client: c.status === "completed" ? { name: c.client?.name, signedAt: c.client?.signedAt } : null,
    docs,
  });
}

// POST { name, dni, company?, cif?, signature (dataURL png), accept: true }
async function publicSign(req, res) {
  const doc = await byToken(req.params.token);
  if (!doc) return fail(res, "Este enlace no es válido", 404);
  const b = req.body || {};
  const name = clip(b.name, 120), dni = clip(b.dni, 30).toUpperCase(), company = clip(b.company, 150), cif = clip(b.cif, 30).toUpperCase();
  if (name.length < 3) return fail(res, "Escribe tu nombre completo");
  if (dni.length < 5) return fail(res, "Escribe tu DNI / NIF");
  if (company && cif.length < 5) return fail(res, "Si firmas en nombre de una empresa, escribe su CIF");
  if (b.accept !== true) return fail(res, "Tienes que aceptar el documento para firmarlo");
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.signature || ""));
  if (!m || m[1].length < 400) return fail(res, "Dibuja tu firma");
  // Una sola firma aunque se pulse dos veces: se reclama en una transacción.
  const now = Date.now();
  const claimed = await db.runTransaction(async (tx) => {
    const s = await tx.get(doc.ref);
    const c = s.data();
    if (!c || c.status === "completed" || c.status === "cancelled" || c.baja || c.signing) return null;
    tx.update(doc.ref, { signing: true });
    return c;
  });
  if (!claimed) return fail(res, "Este documento ya está firmado o no está disponible", 409);
  const orgId = orgOf(claimed);
  try {
    const sigPath = `contracts/${orgId}/signatures/${doc.id}-client.png`;
    await bucket().file(sigPath).save(Buffer.from(m[1], "base64"), { contentType: "image/png", resumable: false });
    const c = {
      ...claimed,
      client: { ...claimed.client, name, dni, company, cif, signaturePath: sigPath, signedAt: now, ip: ipOf(req), ua: uaOf(req) },
      events: [...(claimed.events || []), { at: now, label: `Firmado por el cliente: ${name} (${dni})${company ? ` en representación de ${company} (CIF ${cif})` : ""}`, ip: ipOf(req) }],
    };
    const docs = [];
    const files = [];
    for (const [i, d] of (c.docs || []).entries()) {
      const { pdf, contentHash } = await buildSignedPdf(c, d);
      // Nombre de archivo limpio: sin caracteres que los sistemas de archivos no admiten, sin espacios dobles.
      const base = String(d.name).replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || `Documento ${i + 1}`;
      const signedPath = `contracts/${orgId}/signed/${doc.id}-${i}.pdf`;
      await bucket().file(signedPath).save(pdf, { contentType: "application/pdf", resumable: false });
      docs.push({ ...d, signedPath, contentHash, signedHash: sha256(pdf) });
      if (d.kind === "pdf") files.push({ path: d.sourcePath, name: `${base}.pdf`, size: 0, type: "application/pdf" });
      files.push({ path: signedPath, name: d.kind === "pdf" ? `${base} - Hoja de firmas.pdf` : `${base} - firmado.pdf`, size: pdf.length, type: "application/pdf" });
    }
    await doc.ref.update({ client: c.client, events: c.events, docs, status: "completed", completedAt: now, updatedAt: now, signing: admin.firestore.FieldValue.delete() });
    // Copia firmada a las dos partes.
    const s = (await (await SETTINGS(orgId)).get()).data() || {};
    const brand = await brandFor(orgId);
    const body = `Hola,<br><br>El documento <b>${esc(c.title)}</b> ha quedado firmado por las dos partes.<br><br>Te adjuntamos la copia firmada con su certificado de firma (ID ${c.code}).`;
    const sizes = await Promise.all(files.map(async (f) => (f.size ? f.size : Number((await bucket().file(f.path).getMetadata())[0].size) || 0)));
    const attachments = files.map((f, i) => ({ ...f, size: sizes[i] }));
    for (const [to, toName] of [[c.clientEmail, name], [norm(s.notifyEmail || c.provider?.email || c.sentBy), c.provider?.company]]) {
      if (to) await queue(orgId, { to, toName, subject: `Firmado: ${c.title} · ${brand.name}`, kind: "contract-signed", dealId: c.dealId, contactId: c.contactId, attachments, html: mailHtml(brand, "Documento firmado", body + "<!--ADJUNTOS-->", "", "") });
    }
    // Si el cliente no tenía DNI en su ficha, se guarda el que ha confirmado al firmar.
    if (c.contactId) {
      const cref = db.collection("contacts").doc(c.contactId);
      const cd = (await cref.get()).data();
      if (cd && orgOf(cd) === orgId && !cd.dni) await cref.update({ dni, updatedAt: new Date() }).catch(() => {});
    }
    await addActivity(orgId, {
      type: "Documento", title: `✅ Contrato firmado: ${c.title} — ${name} (${dni})`, done: true,
      entity: c.dealId ? "deal" : "contact", entityId: c.dealId || c.contactId, contactId: c.contactId,
    });
    // La negociación que esperaba esta firma pasa a la siguiente etapa.
    if (c.dealId) await require("./stageflow").respond(c.dealId, `contrato "${c.title}" firmado`).catch((e) => console.warn("[contratos] flujo:", e.message));
    res.json({ ok: true, code: c.code });
  } catch (e) {
    await doc.ref.update({ signing: admin.firestore.FieldValue.delete() }).catch(() => {});
    throw e;
  }
}

async function verify(req, res) {
  const code = String(req.params.code || "").toUpperCase();
  if (!/^[0-9A-F]{4}-[0-9A-F]{4}$/.test(code)) return fail(res, "Código no válido", 404);
  const snap = await db.collection("contracts").where("code", "==", code).limit(1).get();
  if (snap.empty) return fail(res, "No existe ningún documento con ese código", 404);
  const c = snap.docs[0].data();
  const mask = (v) => (v ? String(v).slice(0, 2) + "****" + String(v).slice(-2) : "");
  res.set("Cache-Control", "no-store").json({
    ok: true, code, title: c.title,
    status: (c.status === "completed" ? "Firmado por las dos partes" : c.status === "cancelled" ? "Anulado" : "Pendiente de firma")
      + (c.baja ? ` · dado de baja el ${new Date(c.baja.at).toLocaleDateString("es-ES", { timeZone: TZ })}` : ""),
    provider: c.provider ? { company: c.provider.company, name: c.provider.name, signedAt: c.provider.signedAt } : null,
    client: c.client?.signedAt ? { name: c.client.name, dni: mask(c.client.dni), company: c.client.company || "", signedAt: c.client.signedAt } : null,
    docs: (c.docs || []).map((d) => ({ name: d.name, contentHash: d.contentHash || d.sourceHash || "", signedHash: d.signedHash || "" })),
  });
}

/* ------------------------------------------------------------------ desde una regla del Kanban */

// Envía las plantillas de la regla a la negociación. Si falta algún dato, no envía nada
// incompleto: crea una tarea al responsable. Devuelve { sent, waitH }.
async function sendFromRule(deal, rule, stageName) {
  const ids = (Array.isArray(rule.templateIds) ? rule.templateIds : []).filter((x) => /^[A-Za-z0-9_-]{1,64}$/.test(x)).slice(0, 10);
  if (!ids.length) return { sent: false };
  if (!featuresOf(await getOrg(deal.orgId || DEFAULT_ORG_ID)).contracts) return { sent: false };
  try {
    await createContract({ orgId: deal.orgId || DEFAULT_ORG_ID, contactId: deal.contactId, dealId: deal.id, title: rule.title && rule.title !== "Nueva regla" ? rule.title : "", docs: ids.map((templateId) => ({ templateId })), fromRule: rule.id || "regla" });
    return { sent: true };
  } catch (e) {
    await addActivity(deal.orgId || DEFAULT_ORG_ID, {
      type: "Tarea", priority: "Alta", done: false,
      title: `⚠ No se pudo enviar el contrato "${rule.title || "Contrato"}" (${deal.title} · ${stageName}): ${e.missing?.length ? `faltan datos → ${e.missing.join(", ")}` : e.message}`,
      entity: "deal", entityId: deal.id, contactId: deal.contactId || "", assignee: deal.responsable || "Responsable",
      assigneeType: "person", assigneeName: deal.responsable || "", assigneeEmail: deal.ownerEmail || "", dueDate: new Date().toISOString().slice(0, 10),
    });
    return { sent: false };
  }
}

module.exports = {
  getSettings, saveSettings, listTemplates, saveTemplate, archiveTemplate, prepare, send, list, fileUrl, cancel, baja,
  publicView, publicSign, verify, sendFromRule, buildSignedPdf, cleanBlocks, holesOf, createContract,
};
