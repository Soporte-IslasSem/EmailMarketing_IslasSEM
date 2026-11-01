// Facturas: el PDF de la factura (lo sube este servidor a Storage, en invoices/<org>/…) y el envío
// al cliente por correo con el PDF adjunto (pasa por la cola de correos, como el resto).
// La factura (colección invoices) la crea la app; aquí solo se comprueba que es de la empresa
// de quien llama y que el cliente es suyo.
const crypto = require("crypto");
const { db, bucket } = require("./firebase");
const { staffFromReq } = require("./access");
const { norm, addActivity } = require("./link");
const { brandFor } = require("./tenant");
const { brandMailHtml } = require("./brandMail");

const MAX_FILE = 10 * 1024 * 1024; // 10 MB
const PREFIX = "invoices/";
const orgOf = (d) => d?.orgId || "";
const validPath = (p, orgId) => typeof p === "string" && !!orgId && p.startsWith(`${PREFIX}${orgId}/`) && !p.includes("..") && p.length < 400;
const safeName = (name) => String(name || "factura.pdf").normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 120);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

async function invoiceOf(user, id) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(id || ""))) return null;
  const snap = await db.collection("invoices").doc(id).get();
  return snap.exists && orgOf(snap.data()) === user.orgId ? { ref: snap.ref, ...snap.data() } : null;
}

// POST /api/invoices/pdf { name, data: base64 } → { ok, file: { path, name, size, type } }
async function uploadPdf(req, res) {
  const user = await staffFromReq(req);
  if (!user) return res.status(401).json({ ok: false, error: "Sesión no válida" });
  const name = safeName(req.body?.name);
  if (!/\.pdf$/i.test(name)) return res.status(400).json({ ok: false, error: "La factura tiene que ser un PDF" });
  const buf = Buffer.from(String(req.body?.data || ""), "base64");
  if (!buf.length) return res.status(400).json({ ok: false, error: "El archivo está vacío" });
  if (buf.length > MAX_FILE) return res.status(400).json({ ok: false, error: "El PDF pasa de 10 MB" });
  if (buf.subarray(0, 5).toString() !== "%PDF-") return res.status(400).json({ ok: false, error: "El archivo no es un PDF válido" });
  const path = `${PREFIX}${user.orgId}/${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${name}`;
  await bucket().file(path).save(buf, { contentType: "application/pdf", resumable: false, metadata: { metadata: { uploadedBy: user.email } } });
  res.json({ ok: true, file: { path, name, size: buf.length, type: "application/pdf" } });
}

// POST /api/invoices/pdf-url { path } → { ok, url } (para verlo desde la app, 10 min)
async function pdfUrl(req, res) {
  const user = await staffFromReq(req);
  if (!user) return res.status(401).json({ ok: false, error: "Sesión no válida" });
  if (!validPath(req.body?.path, user.orgId)) return res.status(400).json({ ok: false, error: "Archivo no válido" });
  const [url] = await bucket().file(req.body.path).getSignedUrl({ action: "read", expires: Date.now() + 10 * 60e3 });
  res.json({ ok: true, url });
}

// POST /api/invoices/send { id, to?, message? } → manda la factura (PDF adjunto) al cliente.
async function send(req, res) {
  const user = await staffFromReq(req);
  if (!user) return res.status(401).json({ ok: false, error: "Sesión no válida" });
  const inv = await invoiceOf(user, req.body?.id);
  if (!inv) return res.status(404).json({ ok: false, error: "Factura no encontrada" });
  if (!inv.pdf?.path || !validPath(inv.pdf.path, user.orgId)) return res.status(400).json({ ok: false, error: "Sube antes el PDF de la factura" });
  let contact = null;
  if (inv.contactId) {
    const c = await db.collection("contacts").doc(inv.contactId).get();
    if (c.exists && orgOf(c.data()) === user.orgId) contact = c.data();
  }
  const to = norm(req.body?.to || contact?.email || inv.clientEmail);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return res.status(400).json({ ok: false, error: "Falta un email válido del cliente" });
  const toName = [contact?.firstName, contact?.lastName].filter(Boolean).join(" ") || inv.client || "";
  const brand = await brandFor(user.orgId);
  const msg = String(req.body?.message || "").trim().slice(0, 4000);
  const body = `Hola${toName ? ` ${esc(toName)}` : ""},<br><br>`
    + (msg ? esc(msg).replace(/\n/g, "<br>") : `Te enviamos adjunta la factura <b>${esc(inv.number || "")}</b>${inv.concept ? ` (${esc(inv.concept)})` : ""}.<br><br>Cualquier duda, responde a este correo.`);
  const now = new Date();
  await db.collection("outbox").add({
    orgId: user.orgId, to, toName, subject: `Factura ${inv.number || ""} · ${brand.name}`.replace(/\s+/g, " ").trim(),
    html: brandMailHtml(brand, { title: `Factura ${inv.number || ""}`.trim(), body: body + "<!--ADJUNTOS-->", cta: "", ctaUrl: "" }),
    text: "", kind: "invoice", source: "invoices", invoiceId: inv.ref.id, contactId: inv.contactId || "", dealId: inv.dealId || "",
    attachments: [{ path: inv.pdf.path, name: inv.pdf.name || `${inv.number || "factura"}.pdf`, size: inv.pdf.size || 0, type: "application/pdf" }],
    status: "pending", attempts: 0, error: "", sentAt: null, attachment: null, sentBy: user.email, createdAt: now, updatedAt: now,
  });
  await inv.ref.update({ sentAt: now, sentTo: to, sentBy: user.email, updatedAt: now });
  await addActivity(user.orgId, {
    type: "Documento", title: `🧾 Factura ${inv.number || ""} enviada a ${to}`, done: true,
    entity: inv.dealId ? "deal" : "contact", entityId: inv.dealId || inv.contactId || null, contactId: inv.contactId || "",
  });
  res.json({ ok: true, to });
}

module.exports = { uploadPdf, pdfUrl, send, validPath };
