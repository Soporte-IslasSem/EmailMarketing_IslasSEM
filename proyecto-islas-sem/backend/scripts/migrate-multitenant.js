// Prepara los datos de ISLAS SEM para la versión multiempresa. No borra nada.
//   node backend/scripts/migrate-multitenant.js           → solo cuenta lo que haría (prueba)
//   node backend/scripts/migrate-multitenant.js --apply   → lo aplica
// 1) organizations/islas-sem: memberEmails (para encontrar la empresa por email), estado, plan
//    "interno" (sin cobro) e imagen (nombre, colores, web) si aún no la tiene.
// 2) Perfiles (users) sin empresa de personas con acceso a ISLAS SEM → orgId "islas-sem".
// 3) Ajustes de system/* que pasan a la carpeta privada de la empresa (se copian; el original
//    se queda como copia de seguridad).
// 4) Documentos del CRM sin orgId (de antes del multiempresa) → orgId "islas-sem".
// 5) WhatsApp de antes (waChats, waConfig, waTemplates, waBroadcasts en la raíz) → carpeta de
//    ISLAS SEM (organizations/islas-sem/…), con sus mensajes y destinatarios.
const path = require("path");
require(path.join(__dirname, "..", "node_modules", "dotenv")).config({ path: path.join(__dirname, "..", ".env") });
const { db } = require("../lib/firebase");

const APPLY = process.argv.includes("--apply");
const ORG = "islas-sem";
const norm = (s) => String(s || "").trim().toLowerCase();
const CRM = ["contacts", "companies", "leads", "deals", "pipelines", "activities", "products", "quotes", "invoices", "outbox",
  "crmForms", "employees", "departments", "salesteams", "roles", "customFields", "restaurants", "recyclebin",
  "contractTemplates", "contracts", "formSubmissions", "inbound"];
const PRIVATE = ["contractSettings", "imapCursor", "googleCalendar", "whatsappSettings"];

(async () => {
  console.log(APPLY ? "== APLICANDO ==" : "== PRUEBA (no cambia nada; usa --apply para aplicarlo) ==");
  if (process.env.FIRESTORE_EMULATOR_HOST) console.log("(emulador:", process.env.FIRESTORE_EMULATOR_HOST + ")");

  // 1) Empresa
  const oref = db.collection("organizations").doc(ORG);
  const org = (await oref.get()).data();
  if (!org) throw new Error("No existe organizations/islas-sem");
  const memberEmails = Object.keys(org.memberRoles || {}).map(norm);
  const patch = { memberEmails };
  if (!org.status) patch.status = "active";
  if (!org.plan) patch.plan = "interno";
  if (!org.name) patch.name = "ISLAS SEM";
  if (!org.brand) patch.brand = { name: "ISLAS SEM", legalName: "ISLAS SEM SLU", website: "www.islassem.com", place: "Canarias", color: "#136B68", accent: "#E2B83C", domain: "islassem.com" };
  if (!org.features) patch.features = { whatsapp: true, contracts: true, gcal: true, talentoDigital: true, restaurants: true };
  if (!org.createdAt) patch.createdAt = new Date();
  console.log("1) Empresa:", Object.keys(patch).join(", "), `· ${memberEmails.length} empleados, ${(org.accessEmails || []).length} accesos`);
  if (APPLY) await oref.set(patch, { merge: true });

  // 2) Perfiles
  const members = new Set([...(org.accessEmails || []), ...memberEmails].map(norm));
  const users = await db.collection("users").get();
  let fixed = 0, foreign = 0, already = 0;
  for (const u of users.docs) {
    const d = u.data();
    if (d.orgId) { already++; continue; }
    if (!members.has(norm(d.email))) { foreign++; continue; }
    fixed++;
    if (APPLY) await u.ref.set({ orgId: ORG }, { merge: true });
  }
  console.log(`2) Perfiles: ${already} ya tenían empresa, ${fixed} se asignan a ISLAS SEM, ${foreign} sin acceso (se quedan sin empresa)`);

  // 3) Ajustes privados
  for (const name of PRIVATE) {
    const src = await db.collection("system").doc(name).get();
    const dst = oref.collection("private").doc(name);
    const exists = (await dst.get()).exists;
    console.log(`3) system/${name}: ${src.exists ? (exists ? "ya copiado" : "se copia") : "no existe"}`);
    if (APPLY && src.exists && !exists) await dst.set({ ...src.data(), migratedFromSystemAt: new Date() });
  }

  // 4) Documentos sin orgId
  for (const col of CRM) {
    const snap = await db.collection(col).select("orgId").get();
    const missing = snap.docs.filter((d) => !d.data().orgId);
    const others = new Set(snap.docs.map((d) => d.data().orgId).filter((x) => x && x !== ORG));
    console.log(`4) ${col}: ${snap.size} documentos, ${missing.length} sin empresa${others.size ? ` · otras empresas: ${[...others].join(", ")}` : ""}`);
    if (APPLY) {
      for (let i = 0; i < missing.length; i += 400) {
        const batch = db.batch();
        missing.slice(i, i + 400).forEach((d) => batch.update(d.ref, { orgId: ORG }));
        await batch.commit();
      }
    }
  }
  // 5) WhatsApp a la carpeta de la empresa
  const copyTree = async (srcCol, dstCol, subs) => {
    const snap = await srcCol.get();
    let n = 0;
    for (const d of snap.docs) {
      const dst = dstCol.doc(d.id);
      if (APPLY && !(await dst.get()).exists) await dst.set({ ...d.data(), orgId: ORG });
      n++;
      for (const sub of subs) n += await copyTree(d.ref.collection(sub), dst.collection(sub), []);
    }
    return n;
  };
  for (const [col, subs] of [["waConfig", []], ["waTemplates", []], ["waChats", ["messages"]], ["waBroadcasts", ["recipients"]]]) {
    const n = await copyTree(db.collection(col), oref.collection(col), subs);
    console.log(`5) ${col}: ${n} documentos ${APPLY ? "copiados" : "a copiar"} a organizations/${ORG}/${col}`);
  }
  console.log(APPLY ? "Hecho." : "Prueba terminada: no se ha cambiado nada.");
  process.exit(0);
})().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
