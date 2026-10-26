// Panel de la plataforma (solo PLATFORM_ADMINS): todas las empresas, su plan y estado, cambiar
// plan / ampliar la prueba / suspender o reactivar, y entrar como soporte en una empresa (con
// tiempo límite y quedando registrado).
const { admin, db } = require("./firebase");
const { userFromReq } = require("./access");
const tenant = require("./tenant");
const { planFields, PLANS } = require("./plans");

const FV = admin.firestore.FieldValue;
const fail = (res, msg, code = 400) => res.status(code).json({ ok: false, error: msg });
const audit = (by, action, orgId, data = {}) => db.collection("platformAudit").add({ by, action, orgId, ...data, at: new Date() });

async function platformAdmin(req, res) {
  const user = await userFromReq(req);
  if (!user?.email || user.email_verified !== true || !tenant.isPlatformAdmin(user.email)) { fail(res, "Solo para la administración de la plataforma", 403); return null; }
  user.email = tenant.norm(user.email);
  return user;
}

// GET /api/platform/orgs → todas las empresas con sus números
async function listOrgs(req, res) {
  if (!(await platformAdmin(req, res))) return;
  const [orgs, wa] = await Promise.all([db.collection("organizations").get(), db.collection("waIndex").where("kind", "==", "phone").get()]);
  const waOrgs = new Set(wa.docs.map((d) => d.data().orgId));
  const out = [];
  for (const d of orgs.docs) {
    const o = d.data();
    const contacts = await db.collection("contacts").where("orgId", "==", d.id).count().get().then((s) => s.data().count).catch(() => null);
    out.push({
      id: d.id, name: o.name || d.id, plan: o.plan || "", planName: PLANS[o.plan]?.name || o.plan || "", status: o.status || "active",
      trialEndsAt: o.trialEndsAt || null, ownerEmail: o.ownerEmail || (o.adminEmails || [])[0] || "",
      seats: new Set([...(o.accessEmails || []), ...Object.keys(o.memberRoles || {})]).size, limits: o.limits || {},
      createdAt: o.createdAt?.toMillis?.() || null, billing: o.billing ? { status: o.billing.status || "", plan: o.billing.plan || "" } : null,
      whatsapp: waOrgs.has(d.id), contacts, notes: o.platformNotes || "", features: tenant.featuresOf({ id: d.id, ...o }),
    });
  }
  out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  res.json({ ok: true, orgs: out, plans: Object.entries(PLANS).map(([id, p]) => ({ id, name: p.name })) });
}

// POST /api/platform/org { orgId, plan?, status?, trialDays?, notes? }
async function updateOrg(req, res) {
  const user = await platformAdmin(req, res);
  if (!user) return;
  const b = req.body || {};
  const ref = tenant.orgRef(String(b.orgId || "x"));
  const org = (await ref.get()).data();
  if (!org) return fail(res, "Esa empresa no existe", 404);
  const patch = {};
  if (b.plan) {
    if (!PLANS[b.plan]) return fail(res, "Plan no válido");
    Object.assign(patch, planFields(b.plan));
    if (b.plan === "trial") patch.trialEndsAt = Date.now() + (Number(b.trialDays) || 14) * 864e5;
  }
  if (b.trialDays && !b.plan) patch.trialEndsAt = Math.max(Date.now(), org.trialEndsAt || 0) + Number(b.trialDays) * 864e5;
  if (b.status) {
    if (!["active", "suspended"].includes(b.status)) return fail(res, "Estado no válido");
    if (b.status === "suspended" && ref.id === tenant.DEFAULT_ORG_ID) return fail(res, "ISLAS SEM no se puede suspender desde aquí");
    patch.status = b.status;
    if (b.status === "active") Object.assign(patch, { suspendedReason: FV.delete(), suspendedAt: FV.delete() });
    else patch.suspendedAt = Date.now();
  }
  if (typeof b.notes === "string") patch.platformNotes = b.notes.slice(0, 2000);
  if (!Object.keys(patch).length) return res.json({ ok: true });
  await ref.set(patch, { merge: true });
  tenant.forgetOrg(ref.id);
  await audit(user.email, "update", ref.id, { patch: Object.keys(patch) });
  res.json({ ok: true });
}

// POST /api/platform/create { name, adminEmail, plan? } — da de alta una empresa a mano (cuando el
// alta pública está cerrada). Su administrador entra con ese email (Google o registrándose).
async function createOrg(req, res) {
  const user = await platformAdmin(req, res);
  if (!user) return;
  const name = String(req.body?.name || "").trim().slice(0, 80);
  const adminEmail = tenant.norm(req.body?.adminEmail);
  const plan = PLANS[req.body?.plan] ? req.body.plan : "trial";
  if (name.length < 2) return fail(res, "Escribe el nombre de la empresa");
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(adminEmail)) return fail(res, "Email del administrador no válido");
  if ((await tenant.findOrgsForEmail(adminEmail)).length) return fail(res, "Ese email ya tiene acceso a una empresa", 409);
  const orgId = await require("./orgs").newOrg({ name, ownerEmail: adminEmail, via: `platform:${user.email}`, plan });
  await audit(user.email, "create", orgId, { adminEmail, plan });
  res.json({ ok: true, orgId });
}

// POST /api/platform/support { orgId, minutes } — entra en la empresa como administrador de
// soporte durante un tiempo (máx. 4 h). Su perfil apunta a esa empresa hasta que salga.
async function startSupport(req, res) {
  const user = await platformAdmin(req, res);
  if (!user) return;
  const orgId = String(req.body?.orgId || "x");
  const ref = tenant.orgRef(orgId);
  if (!(await ref.get()).exists) return fail(res, "Esa empresa no existe", 404);
  const minutes = Math.max(10, Math.min(240, Number(req.body?.minutes) || 60));
  const until = Date.now() + minutes * 60e3;
  await ref.set({ supportEmails: FV.arrayUnion(user.email), supportUntil: until }, { merge: true });
  const pref = db.collection("users").doc(user.uid);
  const prof = (await pref.get()).data() || {};
  await pref.set({ orgId, supportOrgId: orgId, homeOrgId: prof.homeOrgId || prof.orgId || tenant.DEFAULT_ORG_ID }, { merge: true });
  tenant.forgetOrg(orgId);
  await audit(user.email, "support-start", orgId, { minutes });
  res.json({ ok: true, until });
}

// POST /api/platform/support/exit — vuelve a su empresa y quita el acceso de soporte.
async function exitSupport(req, res) {
  const user = await userFromReq(req);
  if (!user?.email) return fail(res, "Sesión no válida", 401);
  const email = tenant.norm(user.email);
  const pref = db.collection("users").doc(user.uid);
  const prof = (await pref.get()).data() || {};
  if (prof.supportOrgId) {
    await tenant.orgRef(prof.supportOrgId).set({ supportEmails: FV.arrayRemove(email) }, { merge: true }).catch(() => {});
    tenant.forgetOrg(prof.supportOrgId);
    await audit(email, "support-exit", prof.supportOrgId);
  }
  await pref.set({ orgId: prof.homeOrgId || tenant.DEFAULT_ORG_ID, supportOrgId: FV.delete(), homeOrgId: FV.delete() }, { merge: true });
  res.json({ ok: true });
}

module.exports = { listOrgs, updateOrg, createOrg, startSupport, exitSupport };
