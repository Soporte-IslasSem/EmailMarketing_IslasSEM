// Vincular datos entrantes (correos, formularios) con la ficha del cliente.
// Busca el contacto por email; si no existe, lo encuentra como prospecto;
// si tampoco, crea un prospecto nuevo. Así nada entrante queda huérfano.
const { db } = require("./firebase");

const DEFAULT_ORG_ID = "islas-sem";
const norm = (e) => String(e || "").trim().toLowerCase();

async function findByEmail(collection, orgId, email) {
  if (!email) return null;
  const snap = await db.collection(collection)
    .where("orgId", "==", orgId).where("email", "==", email).limit(1).get().catch(() => null);
  if (snap && !snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() };
  return null;
}

// Devuelve { contactId, leadId, created } para colgar actividades de la persona correcta.
async function resolvePerson(orgId, { email, firstName, lastName, phone, company, source, notes }) {
  const e = norm(email);
  const contact = await findByEmail("contacts", orgId, e);
  if (contact) return { contactId: contact.id, leadId: "", created: false };
  const lead = await findByEmail("leads", orgId, e);
  if (lead) return { contactId: "", leadId: lead.id, created: false };
  if (!e) return { contactId: "", leadId: "", created: false };
  const ref = await db.collection("leads").add({
    orgId, firstName: firstName || e.split("@")[0], lastName: lastName || "", email: e,
    phone: phone || "", whatsapp: "", company: company || "", source: source || "Email",
    status: "Nuevo", responsable: "", estimatedValue: 0, notes: notes || "",
    createdAt: new Date(), updatedAt: new Date(), auto: true,
  });
  return { contactId: "", leadId: ref.id, created: true };
}

async function addActivity(orgId, data) {
  return db.collection("activities").add({
    orgId, done: false, auto: true, createdAt: new Date(), contactId: "", entity: null, entityId: null, ...data,
  });
}

module.exports = { DEFAULT_ORG_ID, norm, resolvePerson, addActivity };
