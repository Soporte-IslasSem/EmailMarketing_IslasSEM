// Envíos de formularios (desde el 1/10/2026) de personas que ya eran contacto: crea su entrada en Prospectos.
// Uso (desde la raíz del repo): node backend/scripts/forms-to-leads.js
const path = require("path");
require(path.join(__dirname, "..", "node_modules", "dotenv")).config({ path: path.join(__dirname, "..", ".env") });
const { db } = require("../lib/firebase");
const { leadForContact, pickPerson } = require("../lib/forms");

const LABEL = { sepa: "Orden de Domiciliación SEPA", juridicos: "Datos Jurídicos del Representante" };

(async () => {
  const subs = await db.collection("formSubmissions").where("createdAt", ">=", new Date("2026-10-01")).get();
  let n = 0;
  for (const d of subs.docs.sort((a, b) => a.data().createdAt.toMillis() - b.data().createdAt.toMillis())) {
    const s = d.data();
    if (s.status !== "vinculado" || !s.contactId || s.leadId) continue;
    const id = await leadForContact(s.orgId || "islas-sem", s.contactId, pickPerson(s.data), LABEL[s.formType] || s.formName || s.formType);
    await d.ref.update({ leadId: id });
    await db.collection("leads").doc(id).update({ lastFormAt: s.createdAt.toDate() });
    console.log("Envío", d.id, `(${s.formType})`, "→ prospecto", id);
    n++;
  }
  console.log(`Listo: ${n} envío(s) ahora salen en Prospectos.`);
  process.exit(0);
})().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
