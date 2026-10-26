// Correo de cada empresa (Ajustes › Correo): con qué cuenta salen sus correos y de qué buzón se
// leen las respuestas.
//
// organizations/{orgId}/private/mail = {
//   fromName, replyTo,                                   // siempre
//   smtp: { host, port, user, password, from },          // opcional: su propio servidor
//   imap: { host, port, user, password },                // opcional: leer respuestas y rebotes
//   dailyLimit }
// ISLAS SEM usa la cuenta de la plataforma (variables de entorno), como hasta ahora.
// Sin servidor propio, una empresa envía por la cuenta de la plataforma con su nombre y con
// "responder a" su email, con un tope diario (limits.emailsPerDay de su plan).
const { privateRef, getOrg, brandOf, DEFAULT_ORG_ID, norm } = require("./tenant");
const { platformAccount, forgetAccount, getTransporter, addressOf } = require("./mailer");
const { staffFromReq } = require("./access");

const PLATFORM_ORG_LIMIT = Number(process.env.ORG_PLATFORM_DAILY_LIMIT) || 300;
const OWN_DEFAULT_LIMIT = 1500;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

const cache = new Map(); // orgId -> { at, data }
async function mailSettings(orgId) {
  const hit = cache.get(orgId);
  if (hit && Date.now() - hit.at < 30e3) return hit.data;
  const data = (await privateRef(orgId, "mail").get().catch(() => null))?.data() || {};
  cache.set(orgId, { at: Date.now(), data });
  return data;
}

const smtpReady = (s) => !!(s?.host && s?.user && s?.password);
const imapReady = (s) => !!(s?.host && s?.user && s?.password);

// Cuenta con la que salen los correos de una empresa.
async function accountFor(orgId) {
  const id = orgId || DEFAULT_ORG_ID;
  const m = await mailSettings(id);
  if (smtpReady(m.smtp)) {
    return {
      key: `org:${id}:${norm(m.smtp.user)}`, own: true, orgId: id,
      host: m.smtp.host, port: m.smtp.port, user: m.smtp.user, pass: m.smtp.password,
      from: m.smtp.from || m.smtp.user, fromName: m.fromName || "", replyTo: m.replyTo || "",
      dailyLimit: Number(m.dailyLimit) || OWN_DEFAULT_LIMIT,
    };
  }
  const p = platformAccount();
  if (id === DEFAULT_ORG_ID) return { ...p, orgId: id, fromName: m.fromName || "", replyTo: m.replyTo || p.replyTo, dailyLimit: Infinity };
  const org = await getOrg(id);
  const b = brandOf(org);
  const fallbackReply = (org?.adminEmails || [])[0] || (org?.accessEmails || [])[0] || "";
  return {
    ...p, orgId: id, fromName: m.fromName || b.name, replyTo: m.replyTo || fallbackReply,
    dailyLimit: Number(org?.limits?.emailsPerDay) || PLATFORM_ORG_LIMIT,
  };
}

// Buzón del que se leen respuestas/rebotes. ISLAS SEM: el de la plataforma (variables IMAP_*).
async function imapFor(orgId) {
  if (orgId === DEFAULT_ORG_ID) {
    if (!(process.env.IMAP_HOST && process.env.IMAP_USER && process.env.IMAP_PASSWORD)) return null;
    return { host: process.env.IMAP_HOST, port: process.env.IMAP_PORT, user: process.env.IMAP_USER, pass: process.env.IMAP_PASSWORD };
  }
  const m = await mailSettings(orgId);
  return imapReady(m.imap) ? { host: m.imap.host, port: m.imap.port, user: m.imap.user, pass: m.imap.password } : null;
}

/* ------------------------------------------------------------------ rutas (Ajustes › Correo) */

const clip = (s, n = 200) => String(s ?? "").trim().slice(0, n);
const port = (v, def) => { const n = Number(v); return Number.isInteger(n) && n > 0 && n < 65536 ? n : def; };
const host = (v) => { const h = clip(v, 200).toLowerCase(); return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(h) ? h : ""; };

// GET /api/org/mail → lo que ve el administrador (nunca las contraseñas).
async function getMail(req, res) {
  const user = await staffFromReq(req);
  if (!user) return res.status(401).json({ ok: false, error: "Sesión no válida" });
  const m = await mailSettings(user.orgId);
  const a = await accountFor(user.orgId);
  res.json({
    ok: true, isAdmin: user.isAdmin, platform: !a.own, platformAddress: a.own ? "" : addressOf(a.from),
    fromName: m.fromName || "", replyTo: m.replyTo || "", dailyLimit: a.dailyLimit === Infinity ? null : a.dailyLimit,
    smtp: m.smtp ? { host: m.smtp.host || "", port: m.smtp.port || 587, user: m.smtp.user || "", from: m.smtp.from || "", hasPassword: !!m.smtp.password } : null,
    imap: m.imap ? { host: m.imap.host || "", port: m.imap.port || 993, user: m.imap.user || "", hasPassword: !!m.imap.password } : null,
  });
}

// POST /api/org/mail { fromName, replyTo, smtp?: {...}|null, imap?: {...}|null } — solo administradores.
// Comprueba la conexión SMTP antes de guardarla.
async function saveMail(req, res) {
  const user = await staffFromReq(req);
  if (!user) return res.status(401).json({ ok: false, error: "Sesión no válida" });
  if (!user.isAdmin) return res.status(403).json({ ok: false, error: "Solo un administrador puede cambiar el correo" });
  const b = req.body || {};
  const cur = await mailSettings(user.orgId);
  const out = { fromName: clip(b.fromName, 80).replace(/["<>]/g, ""), replyTo: norm(b.replyTo).slice(0, 200) };
  if (out.replyTo && !EMAIL_RE.test(out.replyTo)) return res.status(400).json({ ok: false, error: "El email de respuesta no es válido" });
  if (b.smtp === null) out.smtp = null;
  else if (b.smtp) {
    const s = { host: host(b.smtp.host), port: port(b.smtp.port, 587), user: clip(b.smtp.user, 200), from: clip(b.smtp.from, 200), password: String(b.smtp.password || "") || cur.smtp?.password || "" };
    if (!s.host || !s.user || !s.password) return res.status(400).json({ ok: false, error: "Faltan datos del servidor de salida (servidor, usuario y contraseña)" });
    if (s.from && !EMAIL_RE.test(addressOf(s.from))) return res.status(400).json({ ok: false, error: "El remitente no es un email válido" });
    try {
      await getTransporter({ key: `test:${Date.now()}`, ...s, pass: s.password }).verify();
    } catch (e) {
      return res.status(400).json({ ok: false, error: `No se pudo conectar con el servidor de correo: ${String(e.message || e).slice(0, 200)}` });
    }
    out.smtp = s;
  }
  if (b.imap === null) out.imap = null;
  else if (b.imap) {
    const s = { host: host(b.imap.host), port: port(b.imap.port, 993), user: clip(b.imap.user, 200), password: String(b.imap.password || "") || cur.imap?.password || "" };
    if (!s.host || !s.user || !s.password) return res.status(400).json({ ok: false, error: "Faltan datos del buzón de entrada (servidor, usuario y contraseña)" });
    out.imap = s;
  }
  await privateRef(user.orgId, "mail").set(out, { merge: true });
  if (cur.smtp?.user) forgetAccount(`org:${user.orgId}:${norm(cur.smtp.user)}`);
  cache.delete(user.orgId);
  res.json({ ok: true });
}

module.exports = { accountFor, imapFor, mailSettings, getMail, saveMail };
