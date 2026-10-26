// Empresas (multiempresa): alta de una empresa nueva, su perfil e imagen (Administración › Mi
// empresa), su logo público (para correos y formularios) e invitaciones a su equipo.
const crypto = require("crypto");
const { admin, db, bucket } = require("./firebase");
const { staffFromReq, userFromReq } = require("./access");
const tenant = require("./tenant");
const { planFields, TRIAL_DAYS, PLANS, publicPlans } = require("./plans");
const { brandMailHtml, esc } = require("./brandMail");

const PUBLIC_URL = (process.env.PUBLIC_URL || "https://email-marketing.islassem.com").replace(/\/$/, "");
const FV = admin.firestore.FieldValue;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const HEX = /^#[0-9a-f]{6}$/i;
const clip = (s, n = 200) => String(s ?? "").trim().slice(0, n);
const fail = (res, msg, code = 400) => res.status(code).json({ ok: false, error: msg });
const slug = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "empresa";

// Personas con acceso (para el límite de usuarios del plan).
const seats = (org) => new Set([...(org.accessEmails || []), ...Object.keys(org.memberRoles || {})].map(tenant.norm)).size;

/* ------------------------------------------------------------------ alta */

// POST /api/orgs/create { name } — quien se registró para crear su empresa (email verificado y sin
// empresa todavía). Queda como administrador, con la prueba gratis.
async function createOrg(req, res) {
  const user = await userFromReq(req);
  if (!user?.email) return fail(res, "Sesión no válida", 401);
  if (user.email_verified !== true) return fail(res, "Verifica tu email antes de crear la empresa", 403);
  const email = tenant.norm(user.email);
  if (await tenant.resolveUserOrg(user)) return fail(res, "Tu cuenta ya pertenece a una empresa", 409);
  const name = clip(req.body?.name, 80);
  if (name.length < 2) return fail(res, "Escribe el nombre de tu empresa");
  const pref = db.collection("users").doc(user.uid);
  const prof = (await pref.get()).data() || {};
  if (prof.createdOrgAt && Date.now() - prof.createdOrgAt < 3600e3) return fail(res, "Ya creaste una empresa hace poco", 429);
  const orgId = `${slug(name)}-${crypto.randomBytes(3).toString("hex")}`;
  const now = Date.now();
  const p = planFields("trial");
  await tenant.orgRef(orgId).create({
    name, status: "active", ...p, trialEndsAt: now + TRIAL_DAYS * 864e5,
    accessEmails: [email], adminEmails: [email], memberRoles: {}, memberEmails: [],
    ownerUid: user.uid, ownerEmail: email, brand: { name }, createdAt: new Date(), createdVia: "signup",
  });
  await pref.set({ orgId, email, role: "owner", createdOrgAt: now }, { merge: true });
  tenant.forgetOrg(orgId);
  console.log(`[orgs] alta de empresa ${orgId} por ${email}`);
  res.json({ ok: true, orgId });
}

/* ------------------------------------------------------------------ perfil */

function profileOut(org, user) {
  const b = tenant.brandOf(org);
  return {
    id: org.id, name: org.name || "", brand: { ...b, logoUrl: b.logoUrl || "" },
    plan: org.plan || "trial", planName: PLANS[org.plan]?.name || org.plan || "", status: org.status || "active",
    trialEndsAt: org.trialEndsAt || null, limits: org.limits || {}, features: tenant.featuresOf(org),
    billing: org.billing ? { status: org.billing.status || "", currentPeriodEnd: org.billing.currentPeriodEnd || null, cancelAtPeriodEnd: !!org.billing.cancelAtPeriodEnd } : null,
    seats: seats(org), isAdmin: user.isAdmin, plans: publicPlans(),
  };
}

// GET /api/org/profile (también si está suspendida: para ver el aviso y pagar)
async function getProfile(req, res) {
  const user = await staffFromReq(req, { allowSuspended: true });
  if (!user) return fail(res, "Sesión no válida", 401);
  res.json({ ok: true, org: profileOut(await tenant.getOrg(user.orgId, { fresh: true }), user) });
}

// POST /api/org/profile { name, brand: { legalName, website, place, color, accent, domain }, logo?: { data, mime } | null }
async function saveProfile(req, res) {
  const user = await staffFromReq(req);
  if (!user) return fail(res, "Sesión no válida", 401);
  if (!user.isAdmin) return fail(res, "Solo un administrador puede cambiar los datos de la empresa", 403);
  const b = req.body || {};
  const org = await tenant.getOrg(user.orgId, { fresh: true });
  const name = clip(b.name, 80) || org.name;
  const cur = org.brand || {};
  const brand = {
    ...cur, name,
    legalName: clip(b.brand?.legalName, 120), website: clip(b.brand?.website, 120).replace(/^https?:\/\//, ""),
    place: clip(b.brand?.place, 80), domain: tenant.norm(b.brand?.domain).replace(/^@/, "").slice(0, 80),
    color: HEX.test(b.brand?.color || "") ? b.brand.color : cur.color || "#136B68",
    accent: HEX.test(b.brand?.accent || "") ? b.brand.accent : cur.accent || "#E2B83C",
  };
  if (brand.domain && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(brand.domain)) return fail(res, "El dominio no es válido (p. ej. miempresa.com)");
  if (b.logo === null) { brand.logoUrl = ""; brand.logoPath = ""; }
  else if (b.logo?.data) {
    const mime = ["image/png", "image/jpeg", "image/webp"].includes(b.logo.mime) ? b.logo.mime : "";
    const buf = Buffer.from(String(b.logo.data), "base64");
    if (!mime) return fail(res, "El logo tiene que ser PNG, JPG o WebP");
    if (!buf.length || buf.length > 1024 * 1024) return fail(res, "El logo tiene que pesar menos de 1 MB");
    const v = Date.now();
    const path = `branding/${user.orgId}/logo-${v}.${mime.split("/")[1]}`;
    await bucket().file(path).save(buf, { contentType: mime, resumable: false });
    if (cur.logoPath) await bucket().file(cur.logoPath).delete({ ignoreNotFound: true }).catch(() => {});
    Object.assign(brand, { logoPath: path, logoUrl: `${PUBLIC_URL}/api/org/logo/${encodeURIComponent(user.orgId)}?v=${v}` });
  }
  await tenant.orgRef(user.orgId).update({ name, brand, updatedAt: new Date() });
  tenant.forgetOrg(user.orgId);
  res.json({ ok: true, org: profileOut(await tenant.getOrg(user.orgId, { fresh: true }), user) });
}

// GET /api/org/logo/:orgId — público (correos, formularios, firma de contratos).
async function logo(req, res) {
  const org = await tenant.getOrg(String(req.params.orgId || "").slice(0, 80));
  const path = org?.brand?.logoPath;
  if (!path || !path.startsWith(`branding/${org.id}/`)) return res.sendStatus(404);
  try {
    const f = bucket().file(path);
    const [meta] = await f.getMetadata();
    res.set({ "Content-Type": meta.contentType || "image/png", "Cache-Control": "public, max-age=86400" });
    f.createReadStream().on("error", () => res.end()).pipe(res);
  } catch { res.sendStatus(404); }
}

/* ------------------------------------------------------------------ invitaciones */

// POST /api/org/invite { email } — da acceso a alguien y le manda un correo para que entre.
async function invite(req, res) {
  const user = await staffFromReq(req);
  if (!user) return fail(res, "Sesión no válida", 401);
  if (!user.isAdmin) return fail(res, "Solo un administrador puede invitar", 403);
  const email = tenant.norm(req.body?.email);
  if (!EMAIL_RE.test(email)) return fail(res, "Email no válido");
  const ref = tenant.orgRef(user.orgId);
  const out = await db.runTransaction(async (tx) => {
    const org = { id: user.orgId, ...(await tx.get(ref)).data() };
    if (tenant.isMemberOf(org, email)) return { already: true, org };
    const limit = Number(org.limits?.users) || Infinity;
    if (seats(org) + 1 > limit) return { full: limit };
    // ¿Ya es de otra empresa? (una persona = una empresa)
    tx.update(ref, { accessEmails: FV.arrayUnion(email) });
    return { org };
  });
  if (out.full) return fail(res, `Tu plan admite ${out.full} usuarios. Cambia de plan en Mi empresa › Plan para invitar a más.`, 409);
  const others = (await tenant.findOrgsForEmail(email)).filter((id) => id !== user.orgId);
  tenant.forgetOrg(user.orgId);
  const b = tenant.brandOf(out.org);
  if (!out.already && req.body?.notify !== false) {
    const url = `${PUBLIC_URL}/auth/register?email=${encodeURIComponent(email)}`;
    await db.collection("outbox").add({
      orgId: user.orgId, to: email, subject: `${b.name}: te han dado acceso`, kind: "invite", status: "pending", attempts: 0, error: "", sentAt: null, createdAt: new Date(),
      html: brandMailHtml(b, {
        title: `Te han invitado a ${b.name}`,
        body: `Hola,<br><br><b>${esc(user.email)}</b> te ha dado acceso al CRM de <b>${esc(b.name)}</b>.<br><br>Entra con tu cuenta de Google o crea una contraseña con este mismo email (<b>${esc(email)}</b>).`,
        cta: "Entrar", ctaUrl: url,
      }),
    });
  }
  res.json({ ok: true, already: !!out.already, otherOrg: others.length > 0 });
}

module.exports = { createOrg, getProfile, saveProfile, logo, invite, seats };
