// Acceso a la app (igual que las reglas de Firestore y AccessGate en la app):
// solo quien es empleado (memberRoles) o está en organizations/islas-sem.accessEmails, y
// tiene el email verificado.
const { admin, db } = require("./firebase");
const { DEFAULT_ORG_ID } = require("./link");

const norm = (s) => String(s || "").trim().toLowerCase();

// Devuelve el usuario (token verificado) si tiene acceso; si no, null.
async function staffFromReq(req) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const user = await admin.auth().verifyIdToken(token).catch(() => null);
  if (!user || user.email_verified !== true || !user.email) return null;
  const org = (await db.collection("organizations").doc(DEFAULT_ORG_ID).get()).data() || {};
  const allowed = [...(org.accessEmails || []), ...Object.keys(org.memberRoles || {})].map(norm);
  return allowed.includes(norm(user.email)) ? user : null;
}

// POST /api/access/check (Authorization: Bearer <idToken>) → { allowed }
// Se llama justo después de registrarse o entrar (email o Google). Si el email no tiene
// acceso y la cuenta se acaba de crear (registro externo), se borra para que no queden
// cuentas de desconocidos. Las cuentas antiguas no se tocan: simplemente no entran.
async function checkAccess(req, res) {
  try {
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const user = token ? await admin.auth().verifyIdToken(token).catch(() => null) : null;
    if (!user || !user.email) return res.status(401).json({ error: "Sesión no válida" });
    const org = (await db.collection("organizations").doc(DEFAULT_ORG_ID).get()).data() || {};
    const allowed = [...(org.accessEmails || []), ...Object.keys(org.memberRoles || {})].map(norm).includes(norm(user.email));
    let removed = false;
    if (!allowed) {
      const rec = await admin.auth().getUser(user.uid);
      const ageMs = Date.now() - new Date(rec.metadata.creationTime).getTime();
      if (ageMs < 15 * 60e3) {
        await admin.auth().deleteUser(user.uid);
        await db.collection("users").doc(user.uid).delete().catch(() => {});
        removed = true;
      }
    }
    res.json({ allowed, removed });
  } catch (e) {
    console.warn("[access/check]", e.message);
    res.status(500).json({ error: "No se pudo comprobar el acceso" });
  }
}

module.exports = { staffFromReq, checkAccess };
