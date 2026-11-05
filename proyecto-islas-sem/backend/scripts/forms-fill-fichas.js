// Completa las fichas con los datos de formularios ya recibidos (DNI/NIF, web, dirección, ciudad,
// provincia, teléfono…). Solo rellena lo que en la ficha está VACÍO y solo si el email coincide.
// Uso (desde la raíz del repo):
//   node backend/scripts/forms-fill-fichas.js           → solo muestra qué cambiaría
//   node backend/scripts/forms-fill-fichas.js --apply   → lo guarda
const path = require("path");
require(path.join(__dirname, "..", "node_modules", "dotenv")).config({ path: path.join(__dirname, "..", ".env") });
const { db } = require("../lib/firebase");
const { pickPerson, fillEmptyFields, FICHA, MAPS } = require("../lib/forms");

const APPLY = process.argv.includes("--apply");
const norm = (e) => String(e || "").trim().toLowerCase();

// Mismo criterio que al procesar el envío: campos "guardar en la ficha" y, si faltan, por el nombre.
function personOf(s) {
  const person = s.mapped ? Object.fromEntries(["email", ...FICHA].map((k) => [k, ""])) : pickPerson(s.data);
  for (const [k, v] of Object.entries(s.person || {})) if (MAPS.has(k) && v) person[k] = k === "email" ? norm(v) : String(v);
  if (s.mapped) {
    const porNombre = pickPerson(s.data);
    for (const k of ["dni", "website", "address", "city", "province"]) if (!person[k] && porNombre[k]) person[k] = porNombre[k];
  }
  return person;
}

(async () => {
  const subs = await db.collection("formSubmissions").where("status", "==", "vinculado").get();
  // El más reciente primero: si hay varios envíos de la misma persona, manda el último.
  const docs = subs.docs.sort((a, b) => b.data().createdAt.toMillis() - a.data().createdAt.toMillis());
  let fichas = 0;
  const vistas = new Set();
  for (const d of docs) {
    const s = d.data();
    const col = s.contactId ? "contacts" : s.leadId ? "leads" : "";
    const id = s.contactId || s.leadId;
    if (!col || vistas.has(`${col}/${id}`)) continue;
    vistas.add(`${col}/${id}`);
    const person = personOf(s);
    const cur = (await db.collection(col).doc(id).get()).data();
    if (!cur || norm(cur.email) !== norm(person.email)) continue;
    const faltan = FICHA.filter((k) => !String(cur[k] || "").trim() && String(person[k] || "").trim());
    if (!faltan.length) continue;
    fichas++;
    console.log(`${col}/${id} (${cur.email}) ← ${faltan.join(", ")}  [formulario ${s.formName || s.formType}]`);
    if (APPLY) await fillEmptyFields(col, id, person);
  }
  console.log(APPLY ? `Hecho: ${fichas} ficha(s) completada(s).` : `${fichas} ficha(s) por completar. Para guardarlo: añade --apply`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
