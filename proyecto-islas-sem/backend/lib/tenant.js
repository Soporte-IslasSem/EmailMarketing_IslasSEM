// Multiempresa: a qué empresa (organizations/{orgId}) pertenece cada usuario, ajustes privados de
// cada empresa (organizations/{orgId}/private/*, que las reglas no dejan leer desde la app) y su
// imagen (nombre, colores, web) para correos y PDF.
//
// Quién es de una empresa: los emails de su lista de acceso (accessEmails), sus empleados
// (memberRoles; memberEmails es la misma lista en un array para poder buscarla) y, mientras dure,
// el soporte de la plataforma (supportEmails hasta supportUntil). users/{uid}.orgId apunta a la
// empresa del usuario y solo lo cambia el servidor.
const { db } = require("./firebase");

const DEFAULT_ORG_ID = "islas-sem";
const norm = (s) => String(s || "").trim().toLowerCase();
const orgRef = (orgId) => db.collection("organizations").doc(orgId);
const privateRef = (orgId, name) => orgRef(orgId).collection("private").doc(name);

// Ajustes privados de una empresa. ISLAS SEM los guardaba en system/{name}: la primera vez que se
// piden se copian a su carpeta privada (el original se queda como copia de seguridad).
const migrated = new Set();
async function orgPrivate(orgId, name) {
  const ref = privateRef(orgId, name);
  const key = `${orgId}/${name}`;
  if (orgId === DEFAULT_ORG_ID && !migrated.has(key)) {
    const snap = await ref.get();
    if (!snap.exists) {
      const old = await db.collection("system").doc(name).get();
      if (old.exists) await ref.set({ ...old.data(), migratedFromSystemAt: new Date() }, { merge: true });
    }
    migrated.add(key);
  }
  return ref;
}

// Imagen de ISLAS SEM (la primera empresa): se usa si su ficha aún no la tiene.
const ISLAS_BRAND = {
  name: "ISLAS SEM", legalName: "ISLAS SEM SLU", website: "www.islassem.com", place: "Canarias",
  color: "#136B68", accent: "#E2B83C", domain: "islassem.com", logoUrl: "",
};

const PLATFORM_ADMINS = () => (process.env.PLATFORM_ADMINS || "").split(",").map(norm).filter(Boolean);
const isPlatformAdmin = (email) => !!email && PLATFORM_ADMINS().includes(norm(email));

// Caché corta: las fichas de empresa se leen en casi cada petición.
const orgCache = new Map(); // orgId -> { at, data }
const ORG_TTL = 20e3;
async function getOrg(orgId, { fresh = false } = {}) {
  if (!orgId || typeof orgId !== "string" || orgId.includes("/")) return null;
  const hit = orgCache.get(orgId);
  if (!fresh && hit && Date.now() - hit.at < ORG_TTL) return hit.data;
  const snap = await orgRef(orgId).get();
  const data = snap.exists ? { id: snap.id, ...snap.data() } : null;
  orgCache.set(orgId, { at: Date.now(), data });
  if (orgCache.size > 2000) orgCache.clear();
  return data;
}
const forgetOrg = (orgId) => orgCache.delete(orgId);

function supportActive(org, email) {
  return (org.supportEmails || []).map(norm).includes(norm(email)) && Number(org.supportUntil || 0) > Date.now();
}
function isMemberOf(org, email) {
  if (!org || !email) return false;
  const e = norm(email);
  return (org.accessEmails || []).map(norm).includes(e)
    || Object.keys(org.memberRoles || {}).map(norm).includes(e)
    || supportActive(org, e);
}
// Igual que en la app y en las reglas: si no hay administradores, todos lo son.
function isOrgAdmin(org, email) {
  const admins = (org?.adminEmails || []).map(norm);
  return !admins.length || admins.includes(norm(email)) || supportActive(org || {}, email);
}
// Suspendida (impago o por la plataforma): nadie entra salvo para pagar.
const isActive = (org) => !!org && !["suspended", "deleted"].includes(org.status);

// Empresas en las que figura un email (lista de acceso o empleados).
async function findOrgsForEmail(email) {
  const e = norm(email);
  if (!e) return [];
  const [a, b] = await Promise.all([
    db.collection("organizations").where("accessEmails", "array-contains", e).limit(10).get(),
    db.collection("organizations").where("memberEmails", "array-contains", e).limit(10).get(),
  ]);
  const ids = [...new Set([...a.docs, ...b.docs].map((d) => d.id))];
  if (ids.length) return ids;
  // Empresas antiguas sin memberEmails: se miran sus empleados (memberRoles).
  const all = await db.collection("organizations").select("memberRoles").limit(500).get();
  return all.docs.filter((d) => Object.keys(d.data().memberRoles || {}).map(norm).includes(e)).map((d) => d.id);
}

// Empresa del usuario. Si su perfil no apunta a ninguna (o ya no está en ella), se busca la
// empresa donde figura su email y se guarda en el perfil. null = no es de ninguna.
async function resolveUserOrg(user) {
  const email = norm(user?.email);
  if (!user?.uid || !email) return null;
  const pref = db.collection("users").doc(user.uid);
  const prof = (await pref.get()).data() || {};
  if (prof.orgId) {
    const org = await getOrg(prof.orgId);
    if (isMemberOf(org, email)) return { orgId: prof.orgId, org };
  }
  const ids = await findOrgsForEmail(email);
  // Si figura en varias, primero la que ya tenía, luego la de su soporte, luego la primera.
  for (const id of ids) {
    const org = await getOrg(id, { fresh: true });
    if (!isMemberOf(org, email)) continue;
    if (prof.orgId !== id) await pref.set({ orgId: id, email, orgChangedAt: new Date() }, { merge: true });
    return { orgId: id, org };
  }
  return null;
}

// Imagen de la empresa para correos, PDF y páginas públicas.
function brandOf(org) {
  const b = org?.brand || {};
  const base = org?.id === DEFAULT_ORG_ID ? ISLAS_BRAND : {};
  const name = b.name || org?.name || base.name || "";
  const firstAdmin = (org?.adminEmails || [])[0] || (org?.accessEmails || [])[0] || "";
  return {
    name,
    legalName: b.legalName || base.legalName || name,
    website: b.website || base.website || "",
    place: b.place || base.place || "",
    color: /^#[0-9a-f]{6}$/i.test(b.color || "") ? b.color : base.color || "#136B68",
    accent: /^#[0-9a-f]{6}$/i.test(b.accent || "") ? b.accent : base.accent || "#E2B83C",
    logoUrl: b.logoUrl || base.logoUrl || "",
    // Dominio propio: correos de este dominio son "de la casa" (no se crean prospectos con ellos).
    domain: norm(b.domain || base.domain || String(firstAdmin).split("@")[1] || ""),
  };
}
async function brandFor(orgId) {
  return brandOf((await getOrg(orgId || DEFAULT_ORG_ID)) || { id: orgId });
}
// Pie de los correos: "ISLAS SEM SLU · Canarias · www.islassem.com".
const footerText = (b) => [b.legalName || b.name, b.place, b.website].filter(Boolean).join(" · ");

// Módulos por empresa. ISLAS SEM tiene los suyos propios (Talento Digital, Restaurantes).
const FEATURE_DEFAULTS = { whatsapp: true, contracts: true, gcal: true, talentoDigital: false, restaurants: false };
function featuresOf(org) {
  const own = org?.id === DEFAULT_ORG_ID ? { talentoDigital: true, restaurants: true } : {};
  return { ...FEATURE_DEFAULTS, ...own, ...(org?.features || {}) };
}

// Usuarios (uid) de una empresa: para acotar colecciones que van por dueño (listas, suscriptores…).
const usersCache = new Map();
async function usersOfOrg(orgId) {
  const hit = usersCache.get(orgId);
  if (hit && Date.now() - hit.at < 60e3) return hit.uids;
  const snap = await db.collection("users").where("orgId", "==", orgId).select().get();
  const uids = new Set(snap.docs.map((d) => d.id));
  usersCache.set(orgId, { at: Date.now(), uids });
  return uids;
}
const userOrgCache = new Map();
async function orgOfUser(uid) {
  if (!uid) return DEFAULT_ORG_ID;
  const hit = userOrgCache.get(uid);
  if (hit && Date.now() - hit.at < 60e3) return hit.orgId;
  const d = (await db.collection("users").doc(String(uid)).get().catch(() => null))?.data();
  const orgId = d?.orgId || DEFAULT_ORG_ID;
  userOrgCache.set(uid, { at: Date.now(), orgId });
  if (userOrgCache.size > 5000) userOrgCache.clear();
  return orgId;
}

// Empresas que el cron tiene que recorrer (las suspendidas no envían nada).
let activeCache = null;
async function activeOrgs() {
  if (activeCache && Date.now() - activeCache.at < 60e3) return activeCache.list;
  const snap = await db.collection("organizations").get();
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter(isActive);
  activeCache = { at: Date.now(), list };
  return list;
}

module.exports = {
  DEFAULT_ORG_ID, ISLAS_BRAND, norm, orgRef, privateRef, orgPrivate, getOrg, forgetOrg, isMemberOf, isOrgAdmin, isActive,
  findOrgsForEmail, resolveUserOrg, brandOf, brandFor, footerText, featuresOf, usersOfOrg, orgOfUser,
  activeOrgs, isPlatformAdmin, supportActive,
};
