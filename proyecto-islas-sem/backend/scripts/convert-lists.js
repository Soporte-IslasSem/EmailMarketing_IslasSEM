// Convierte en tipo de cliente todas las listas de Email Marketing que aún van sueltas (lo mismo
// que el botón "Convertir las N en tipos de cliente" de Listas, pero para las listas de todo el
// equipo de una vez). Igual que en la app (src/modules/lists/lib/crmLink.js › convertListsToTypes):
// - Lista con nombre nuevo → tipo de cliente nuevo; la lista pasa a ser la de ese tipo.
// - Lista con el mismo nombre que un tipo existente → su gente recibe ese tipo; la lista se marca
//   como repetida (mergedTypeId) y no se borra.
// - Cada email queda como contacto del CRM con ese tipo (se crea si no existe); nadie pierde tipos.
// No borra nada. Las suscripciones a las listas de tipo las cuadra la app al abrir Listas.
// Uso (desde la raíz del repo):
//   node backend/scripts/convert-lists.js           → solo muestra lo que haría
//   node backend/scripts/convert-lists.js --apply   → lo hace
const path = require("path");
require(path.join(__dirname, "..", "node_modules", "dotenv")).config({ path: path.join(__dirname, "..", ".env") });
const { db } = require("../lib/firebase");

const ORG_ID = "islas-sem";
const APPLY = process.argv.includes("--apply");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const norm = (e) => String(e || "").trim().toLowerCase().replace(/\s+/g, "");
const key = (s) => String(s || "").trim().toLowerCase();
const typesOf = (x) => [...new Set((Array.isArray(x.clientTypes) ? x.clientTypes : x.clientType ? [x.clientType] : []).filter(Boolean))];
const typeFields = (ids) => ({ clientTypes: ids, clientType: ids[0] || "" });
function newTypeId(label, types) {
  const base = String(label).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "tipo";
  let id = base, n = 2;
  while (types.some((t) => t.id === id)) id = `${base}-${n++}`;
  return id;
}
async function commit(ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const b = db.batch();
    ops.slice(i, i + 400).forEach((op) => op(b));
    await b.commit();
  }
}

(async () => {
  const orgRef = db.collection("organizations").doc(ORG_ID);
  const types = (await orgRef.get()).data()?.clientTypes || [];
  if (!types.length) throw new Error("La organización no tiene tipos de cliente guardados; abre la app una vez como administrador.");
  const lists = (await db.collection("lists").get()).docs
    .filter((d) => { const l = d.data(); return !l.crm && !l.bajas && !l.restaurants && !l.mergedTypeId; });

  const allTypes = [...types];
  const byName = new Map(types.map((t) => [key(t.label), t.id]));
  const plan = [];
  for (const d of lists) {
    const name = String(d.data().name || "").trim() || "Sin nombre";
    let typeId = byName.get(key(name));
    const merged = !!typeId;
    if (!typeId) {
      typeId = newTypeId(name, allTypes);
      allTypes.push({ id: typeId, label: name, icon: "", color: "#1a9190" });
      byName.set(key(name), typeId);
    }
    plan.push({ ref: d.ref, id: d.id, name, typeId, merged, count: d.data().subscribersCount || 0 });
  }
  console.log(`Listas sueltas: ${plan.length}`);
  plan.forEach((p) => console.log(`  ${p.merged ? "≈ ya existe el tipo" : "+ tipo nuevo     "} "${p.name}" (${p.count} suscriptores) → ${p.typeId}`));
  if (!plan.length) return process.exit(0);

  const contacts = (await db.collection("contacts").where("orgId", "==", ORG_ID).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const byEmail = new Map(contacts.filter((c) => c.email).map((c) => [norm(c.email), c]));
  let n = 0;
  contacts.forEach((c) => { const m = /^CLI-(\d+)$/.exec(c.clientId || ""); if (m) n = Math.max(n, parseInt(m[1], 10)); });
  const want = new Map();
  let invalid = 0;
  for (const p of plan) {
    const subs = (await db.collection("subscribers").where("listId", "==", p.id).get()).docs.map((d) => d.data());
    for (const s of subs) {
      const email = norm(s.email);
      if (!EMAIL_RE.test(email)) { invalid++; continue; }
      const w = want.get(email) || { contact: byEmail.get(email), name: "", types: new Set() };
      w.types.add(p.typeId);
      if (!w.name && s.name) w.name = String(s.name).trim();
      want.set(email, w);
    }
  }
  const ops = [];
  let created = 0, tagged = 0;
  for (const [email, w] of want) {
    const [firstName, ...rest] = String(w.name || "").split(/\s+/);
    if (w.contact) {
      const cur = typesOf(w.contact);
      const next = [...cur, ...[...w.types].filter((t) => !cur.includes(t))];
      if (next.length === cur.length) continue;
      const name = !w.contact.firstName && !w.contact.lastName && w.name ? { firstName, lastName: rest.join(" ") } : {};
      ops.push((b) => b.update(db.collection("contacts").doc(w.contact.id), { ...typeFields(next), ...name, updatedAt: new Date() }));
      tagged++;
    } else {
      const ref = db.collection("contacts").doc();
      const clientId = "CLI-" + String(++n).padStart(4, "0");
      ops.push((b) => b.set(ref, {
        firstName: firstName || "", lastName: rest.join(" "), email, ...typeFields([...w.types]), clientId, relation: "nuevo", stage: "Lead",
        source: "Email Marketing", orgId: ORG_ID, createdAt: new Date(), updatedAt: new Date(),
      }));
      created++;
    }
  }
  console.log(`\nTipos nuevos: ${allTypes.length - types.length} · contactos ya existentes que reciben tipo: ${tagged} · contactos nuevos: ${created}${invalid ? ` · emails no válidos ignorados: ${invalid}` : ""}`);

  if (!APPLY) { console.log("\nNo se ha cambiado nada. Para hacerlo: --apply"); return process.exit(0); }
  // Listas antes que tipos: si el tipo apareciera antes, la app abierta crearía listas repetidas.
  await commit(plan.map((p) => (b) => b.update(p.ref, p.merged
    ? { mergedTypeId: p.typeId, convertedAt: new Date() }
    : { crm: true, crmKey: `type:${p.typeId}`, name: p.name, convertedAt: new Date() })));
  if (allTypes.length > types.length) await orgRef.update({ clientTypes: allTypes });
  await commit(ops);
  console.log("✓ Hecho. Abre Listas en la app para que cuadre las suscripciones.");
  process.exit(0);
})().catch((e) => {
  console.error("Error:", e.code || "", e.message);
  process.exit(1);
});
