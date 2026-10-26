// Contacto borrado en el CRM → fuera de las listas del CRM (las de cada tipo y "Todos los contactos"),
// de TODOS los usuarios, aunque nadie tenga la app abierta (la app lo hace al momento solo si el
// dueño de la lista la tiene abierta). Va en el cron: mira lo que entró en la Papelera desde la
// última pasada.
// - Si queda otro contacto con ese mismo email (fichas duplicadas), no se quita a nadie.
// - Si el contacto se restauró desde la Papelera, tampoco.
// - La lista "Bajas" no se toca nunca (quien se dio de baja debe seguir sin recibir correos), ni
//   las listas que no son del CRM.
const { admin, db } = require("./firebase");
const { DEFAULT_ORG_ID, norm } = require("./link");
const { usersOfOrg } = require("./tenant");

const FV = admin.firestore.FieldValue;
const stateRef = () => db.collection("system").doc("listCleanup");

async function processDeletedContacts() {
  const since = (await stateRef().get()).data()?.lastDeletedAt || new Date(0);
  const snap = await db.collection("recyclebin").where("deletedAt", ">", since).orderBy("deletedAt").limit(300).get();
  let removed = 0, checked = 0, last = since;
  for (const d of snap.docs) {
    const r = d.data();
    last = r.deletedAt || last;
    if (r.collection !== "contacts") continue;
    checked++;
    const email = norm(r.data?.email);
    if (!email) continue;
    if ((await db.collection("contacts").doc(r.docId).get()).exists) continue; // restaurado
    const same = await db.collection("contacts").where("orgId", "==", r.orgId || DEFAULT_ORG_ID).where("email", "==", email).limit(1).get();
    if (!same.empty) continue; // otra ficha con el mismo email sigue en el CRM
    // Solo las listas de los usuarios de la empresa del contacto.
    const subs = await db.collection("subscribers").where("email", "==", email).get();
    const mine = await usersOfOrg(r.orgId || DEFAULT_ORG_ID);
    for (const s of subs.docs.filter((x) => mine.has(x.data().userId))) {
      const listRef = db.collection("lists").doc(String(s.data().listId || "x"));
      const list = (await listRef.get()).data();
      if (!list?.crm || list.bajas || list.crmKey === "companies") continue;
      await s.ref.delete();
      if (s.data().status === "subscribed") await listRef.update({ subscribersCount: FV.increment(-1) }).catch(() => {});
      removed++;
    }
  }
  if (snap.size) await stateRef().set({ lastDeletedAt: last, lastRunAt: new Date() }, { merge: true });
  return { checked, removed };
}

module.exports = { processDeletedContacts };
