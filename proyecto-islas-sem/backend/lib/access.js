// Acceso a la app (igual que las reglas de Firestore y AccessGate en la app): solo quien figura en
// una empresa (lista de acceso, empleados o soporte) y tiene el email verificado. Cada petición
// sabe así de qué empresa es quien llama (user.orgId) y solo toca datos de esa empresa.
const { admin, db } = require("./firebase");
const tenant = require("./tenant");

// Devuelve el usuario (token verificado) con { orgId, org, isAdmin } si tiene acceso; si no, null.
// allowSuspended: para las pantallas de pago de una empresa suspendida.
async function staffFromReq(req, { allowSuspended = false } = {}) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const user = await admin.auth().verifyIdToken(token).catch(() => null);
  if (!user || user.email_verified !== true || !user.email) return null;
  const r = await tenant.resolveUserOrg(user);
  if (!r) return null;
  if (!allowSuspended && !tenant.isActive(r.org)) return null;
  user.email = tenant.norm(user.email);
  user.orgId = r.orgId;
  user.org = r.org;
  user.isAdmin = tenant.isOrgAdmin(r.org, user.email);
  return user;
}

// Usuario con sesión aunque no sea de ninguna empresa (alta de empresa nueva).
async function userFromReq(req) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  return admin.auth().verifyIdToken(token).catch(() => null);
}

// POST /api/access/check { signup? } (Authorization: Bearer <idToken>)
//   → { allowed, orgId, orgName, status, isAdmin, platformAdmin, features, canCreateOrg }
// Se llama justo después de registrarse o entrar (email o Google) y al abrir la app. Deja el
// perfil apuntando a su empresa. Si el email no es de ninguna empresa y la cuenta se acaba de
// crear sin intención de dar de alta una empresa, se borra (no quedan cuentas de desconocidos).
async function checkAccess(req, res) {
  try {
    const user = await userFromReq(req);
    if (!user || !user.email) return res.status(401).json({ error: "Sesión no válida" });
    const r = await tenant.resolveUserOrg(user);
    const platformAdmin = tenant.isPlatformAdmin(user.email);
    if (r) {
      return res.json({
        allowed: tenant.isActive(r.org), orgId: r.orgId, orgName: r.org.name || "", status: r.org.status || "active",
        isAdmin: tenant.isOrgAdmin(r.org, user.email), platformAdmin, features: tenant.featuresOf(r.org),
      });
    }
    // Sin empresa: puede crear la suya (alta de empresa) si así lo pidió al registrarse.
    const prof = (await db.collection("users").doc(user.uid).get()).data() || {};
    if (req.body?.signup === true || prof.signupAt || platformAdmin) return res.json({ allowed: false, canCreateOrg: true, platformAdmin });
    let removed = false;
    const rec = await admin.auth().getUser(user.uid);
    const ageMs = Date.now() - new Date(rec.metadata.creationTime).getTime();
    if (ageMs < 15 * 60e3) {
      await admin.auth().deleteUser(user.uid);
      await db.collection("users").doc(user.uid).delete().catch(() => {});
      removed = true;
    }
    res.json({ allowed: false, removed });
  } catch (e) {
    console.warn("[access/check]", e.message);
    res.status(500).json({ error: "No se pudo comprobar el acceso" });
  }
}

module.exports = { staffFromReq, userFromReq, checkAccess };
