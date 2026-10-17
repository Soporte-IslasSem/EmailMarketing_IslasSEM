// Cuadra las listas del CRM con los tipos de cliente:
// 1) Listas repetidas (mismo usuario y mismo tipo, creadas a la vez por varias pestañas): se queda
//    la que tiene más suscriptores (o la convertida / la más antigua) y se borran las copias con sus
//    suscriptores. Un formulario que apunte a una copia pasa a la que se queda; si una campaña usa
//    la copia, esa copia NO se borra (se avisa).
// 2) Suscriptores activos de una lista de tipo cuyo contacto no tiene ese tipo (altas antiguas, de
//    antes de unir CRM y Email Marketing): el contacto recibe el tipo; si no existe, se crea.
// Uso (desde la raíz del repo):
//   node backend/scripts/fix-crm-lists.js           → solo muestra lo que haría
//   node backend/scripts/fix-crm-lists.js --apply   → lo hace
const path = require("path");
require(path.join(__dirname, "..", "node_modules", "dotenv")).config({ path: path.join(__dirname, "..", ".env") });
const { db } = require("../lib/firebase");

const ORG_ID = "islas-sem";
const APPLY = process.argv.includes("--apply");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const norm = (e) => String(e || "").trim().toLowerCase().replace(/\s+/g, "");
const ms = (t) => (t?.toMillis ? t.toMillis() : t instanceof Date ? t.getTime() : 0);
const typesOf = (x) => [...new Set((Array.isArray(x.clientTypes) ? x.clientTypes : x.clientType ? [x.clientType] : []).filter(Boolean))];
async function commit(ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const b = db.batch();
    ops.slice(i, i + 400).forEach((op) => op(b));
    await b.commit();
  }
}

(async () => {
  const lists = (await db.collection("lists").get()).docs.filter((d) => d.data().crm);
  const subsOf = new Map();
  for (const d of lists) subsOf.set(d.id, (await db.collection("subscribers").where("listId", "==", d.id).get()).docs);

  // 1) Repetidas
  const groups = new Map();
  for (const d of lists) {
    const k = `${d.data().userId}|${d.data().crmKey}`;
    groups.set(k, [...(groups.get(k) || []), d]);
  }
  const removed = new Set();
  const ops = [];
  for (const [k, ds] of groups) {
    if (ds.length < 2) continue;
    const sorted = [...ds].sort((a, b) => subsOf.get(b.id).length - subsOf.get(a.id).length
      || (b.data().convertedAt ? 1 : 0) - (a.data().convertedAt ? 1 : 0)
      || ms(a.data().createdAt) - ms(b.data().createdAt));
    const keep = sorted[0];
    console.log(`${k.split("|")[1]} (${keep.data().name}): se queda ${keep.id} (${subsOf.get(keep.id).length} suscr.)`);
    for (const d of sorted.slice(1)) {
      const camps = await db.collection("campaigns").where("lists.selectedLists", "array-contains", d.id).get();
      if (!camps.empty) { console.log(`  ⚠ ${d.id} la usa ${camps.size} campaña(s): no se borra`); continue; }
      const forms = await db.collection("crmForms").where("listId", "==", d.id).get();
      forms.docs.forEach((f) => ops.push((b) => b.update(f.ref, { listId: keep.id, listName: keep.data().name || "" })));
      subsOf.get(d.id).forEach((s) => ops.push((b) => b.delete(s.ref)));
      ops.push((b) => b.delete(d.ref));
      removed.add(d.id);
      console.log(`  − borrar ${d.id} (${subsOf.get(d.id).length} suscr.${forms.size ? `, ${forms.size} formulario(s) pasan a la que se queda` : ""})`);
    }
  }

  // 2) Suscriptores de listas de tipo cuyo contacto no tiene el tipo
  const contacts = (await db.collection("contacts").where("orgId", "==", ORG_ID).get()).docs.map((d) => ({ id: d.id, ref: d.ref, ...d.data() }));
  // Varias fichas con el mismo email (duplicados): se mira en todas antes de tocar nada.
  const byEmail = new Map();
  contacts.filter((c) => c.email).forEach((c) => byEmail.set(norm(c.email), [...(byEmail.get(norm(c.email)) || []), c]));
  const orgTypes = new Set(((await db.collection("organizations").doc(ORG_ID).get()).data()?.clientTypes || []).map((t) => t.id));
  const orphan = new Set();
  let n = 0;
  contacts.forEach((c) => { const m = /^CLI-(\d+)$/.exec(c.clientId || ""); if (m) n = Math.max(n, parseInt(m[1], 10)); });
  const want = new Map();
  for (const d of lists) {
    if (removed.has(d.id) || !String(d.data().crmKey || "").startsWith("type:")) continue;
    const typeId = d.data().crmKey.slice(5);
    if (!orgTypes.has(typeId)) { orphan.add(`${d.data().name} (${d.id})`); continue; } // tipo ya borrado: no se reparte
    for (const s of subsOf.get(d.id)) {
      const x = s.data();
      const email = norm(x.email);
      if (x.status !== "subscribed" || !EMAIL_RE.test(email)) continue;
      const same = byEmail.get(email) || [];
      if (same.some((c) => typesOf(c).includes(typeId))) continue;
      const c = same[0];
      const w = want.get(email) || { contact: c, name: "", types: new Set() };
      w.types.add(typeId);
      if (!w.name && x.name) w.name = String(x.name).trim();
      want.set(email, w);
    }
  }
  for (const [email, w] of want) {
    const [firstName, ...rest] = String(w.name || "").split(/\s+/);
    if (w.contact) {
      const cur = typesOf(w.contact);
      const next = [...cur, ...[...w.types].filter((t) => !cur.includes(t))];
      console.log(`  tipo ${[...w.types].join(",")} → ${w.contact.clientId || w.contact.id} ${email}`);
      ops.push((b) => b.update(w.contact.ref, { clientTypes: next, clientType: next[0], updatedAt: new Date() }));
    } else {
      const ref = db.collection("contacts").doc();
      const clientId = "CLI-" + String(++n).padStart(4, "0");
      console.log(`  contacto nuevo ${clientId} ${email} con tipo ${[...w.types].join(",")}`);
      ops.push((b) => b.set(ref, {
        firstName: firstName || "", lastName: rest.join(" "), email, clientTypes: [...w.types], clientType: [...w.types][0], clientId,
        relation: "nuevo", stage: "Lead", source: "Email Marketing", orgId: ORG_ID, createdAt: new Date(), updatedAt: new Date(),
      }));
    }
  }

  if (orphan.size) console.log(`\n⚠ Listas de tipos que ya no existen (no se tocan; se pueden borrar desde Listas): ${[...orphan].join(", ")}`);
  console.log(`\nListas repetidas a borrar: ${removed.size} · contactos a corregir/crear: ${want.size}`);
  if (!APPLY) { console.log("No se ha cambiado nada. Para hacerlo: --apply"); return process.exit(0); }
  await commit(ops);
  console.log("✓ Hecho. Abre Listas en la app para que recalcule los contadores.");
  process.exit(0);
})().catch((e) => {
  console.error("Error:", e.code || "", e.message);
  process.exit(1);
});
