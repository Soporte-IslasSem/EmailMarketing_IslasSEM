// Acceso a la app (igual que las reglas de Firestore y AccessGate en la app):
// solo quien está en organizations/islas-sem.accessEmails y tiene el email verificado.
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
  return (org.accessEmails || []).map(norm).includes(norm(user.email)) ? user : null;
}

module.exports = { staffFromReq };
