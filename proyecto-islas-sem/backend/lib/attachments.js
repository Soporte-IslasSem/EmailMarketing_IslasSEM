// Archivos adjuntos de las reglas de automatización del Kanban (CRM › Automatización).
// La app no escribe en Firebase Storage: los sube este servidor, que comprueba antes que quien
// sube tiene acceso a la app. Se guardan en automations/<org>/… y la regla guarda solo
// { path, name, size, type }.
// Al enviar (outbox): si caben (≤ ATTACH_MAX en total) van adjuntos al correo; si no, el correo
// lleva un enlace de descarga firmado (válido 7 días, el máximo que permite Google).
const crypto = require("crypto");
const { bucket } = require("./firebase");
const { staffFromReq } = require("./access");
const { DEFAULT_ORG_ID } = require("./link");

const MAX_FILE = 10 * 1024 * 1024; // 10 MB por archivo
const ATTACH_MAX = 8 * 1024 * 1024; // más que esto en total → enlaces de descarga
const PREFIX = "automations/";
const TYPES = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  txt: "text/plain",
  csv: "text/csv",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  zip: "application/zip",
};
const extOf = (name) => (String(name || "").toLowerCase().match(/\.([a-z0-9]{1,5})$/) || [])[1] || "";
const safeName = (name) => String(name || "archivo").normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 120);
// Para subir/ver/borrar desde la app, solo adjuntos de automatizaciones.
const validPath = (p) => typeof p === "string" && p.startsWith(PREFIX) && !p.includes("..") && p.length < 400;
// Para enviar por correo: también los contratos firmados (los pone el propio servidor).
const mailPath = (p) => validPath(p) || (typeof p === "string" && p.startsWith("contracts/") && !p.includes("..") && p.length < 400);

// POST /api/automations/adjunto { name, data: base64 } → { ok, file: { path, name, size, type } }
async function upload(req, res) {
  const user = await staffFromReq(req);
  if (!user) return res.status(401).json({ ok: false, error: "Sesión no válida" });
  const name = safeName(req.body?.name);
  const type = TYPES[extOf(name)];
  if (!type) return res.status(400).json({ ok: false, error: "Tipo de archivo no admitido (PDF, Word, Excel, PowerPoint, imágenes, TXT, CSV o ZIP)" });
  const buf = Buffer.from(String(req.body?.data || ""), "base64");
  if (!buf.length) return res.status(400).json({ ok: false, error: "El archivo está vacío" });
  if (buf.length > MAX_FILE) return res.status(400).json({ ok: false, error: "El archivo pasa de 10 MB" });
  const path = `${PREFIX}${DEFAULT_ORG_ID}/${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${name}`;
  await bucket().file(path).save(buf, { contentType: type, resumable: false, metadata: { metadata: { uploadedBy: user.email } } });
  res.json({ ok: true, file: { path, name, size: buf.length, type } });
}

// POST /api/automations/adjunto-url { path } → { ok, url } (para verlo desde la app, 10 min)
async function link(req, res) {
  const user = await staffFromReq(req);
  if (!user) return res.status(401).json({ ok: false, error: "Sesión no válida" });
  if (!validPath(req.body?.path)) return res.status(400).json({ ok: false, error: "Archivo no válido" });
  const [url] = await bucket().file(req.body.path).getSignedUrl({ action: "read", expires: Date.now() + 10 * 60e3 });
  res.json({ ok: true, url });
}

// POST /api/automations/adjunto-borrar { path } (al quitarlo de la regla)
async function remove(req, res) {
  const user = await staffFromReq(req);
  if (!user) return res.status(401).json({ ok: false, error: "Sesión no válida" });
  if (!validPath(req.body?.path)) return res.status(400).json({ ok: false, error: "Archivo no válido" });
  await bucket().file(req.body.path).delete({ ignoreNotFound: true });
  res.json({ ok: true });
}

// Para la cola de correos: los adjuntos de la regla (los que caben) y, para el resto, una lista
// HTML de enlaces de descarga que se pone donde el correo tiene <!--ADJUNTOS-->.
async function forMail(list) {
  const files = (Array.isArray(list) ? list : []).filter((a) => a && mailPath(a.path));
  if (!files.length) return { attachments: [], linksHtml: "" };
  const total = files.reduce((s, a) => s + (Number(a.size) || 0), 0);
  const attachments = [];
  const links = [];
  for (const a of files) {
    const f = bucket().file(a.path);
    try {
      if (total <= ATTACH_MAX) {
        const [content] = await f.download();
        attachments.push({ filename: a.name || "archivo", content, contentType: a.type || undefined });
      } else {
        const [url] = await f.getSignedUrl({ action: "read", expires: Date.now() + 7 * 864e5 });
        links.push({ name: a.name || "archivo", url });
      }
    } catch (e) {
      console.warn("[adjuntos] no se pudo preparar", a.path, e.message);
    }
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const linksHtml = links.length
    ? `<div style="margin-top:18px;font-size:14px"><b>Documentos para descargar</b> <span style="color:#8a9a9a">(enlaces válidos 7 días)</span><ul style="padding-left:18px">${links.map((l) => `<li><a href="${l.url}">${esc(l.name)}</a></li>`).join("")}</ul></div>`
    : "";
  return { attachments, linksHtml };
}

module.exports = { upload, link, remove, forMail };
