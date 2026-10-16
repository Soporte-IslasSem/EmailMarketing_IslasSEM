// Pone en minúsculas y sin espacios los emails de contactos y prospectos, para que los
// formularios, las listas y los correos encuentren siempre a la persona correcta (todo se cruza
// por el email en minúsculas). No borra ni fusiona nada: si quedan dos fichas con el mismo
// email, solo las lista para que se revisen a mano.
// Uso (desde la raíz del repo):
//   node backend/scripts/normalize-emails.js           → solo muestra lo que cambiaría
//   node backend/scripts/normalize-emails.js --apply   → lo guarda
const path = require("path");
require(path.join(__dirname, "..", "node_modules", "dotenv")).config({ path: path.join(__dirname, "..", ".env") });
const { db } = require("../lib/firebase");

const ORG_ID = "islas-sem";
const APPLY = process.argv.includes("--apply");
const norm = (e) => String(e || "").trim().toLowerCase().replace(/\s+/g, "");

(async () => {
  for (const col of ["contacts", "leads"]) {
    const snap = await db.collection(col).where("orgId", "==", ORG_ID).get();
    const fix = snap.docs.filter((d) => d.data().email && d.data().email !== norm(d.data().email));
    console.log(`\n${col}: ${snap.size} fichas, ${fix.length} con el email por normalizar`);
    fix.slice(0, 30).forEach((d) => console.log(`  ${d.id}: "${d.data().email}" → "${norm(d.data().email)}"`));
    if (fix.length > 30) console.log(`  … y ${fix.length - 30} más`);

    const byEmail = new Map();
    snap.docs.forEach((d) => {
      const e = norm(d.data().email);
      if (!e) return;
      byEmail.set(e, [...(byEmail.get(e) || []), d]);
    });
    const dupes = [...byEmail].filter(([, ds]) => ds.length > 1);
    if (dupes.length) {
      console.log(`  ⚠ ${dupes.length} emails repetidos en ${col} (revisar a mano, no se tocan):`);
      dupes.slice(0, 30).forEach(([e, ds]) => console.log(`    ${e}: ${ds.map((d) => d.data().clientId || d.id).join(", ")}`));
    }

    if (APPLY && fix.length) {
      for (let i = 0; i < fix.length; i += 400) {
        const batch = db.batch();
        fix.slice(i, i + 400).forEach((d) => batch.update(d.ref, { email: norm(d.data().email), updatedAt: new Date() }));
        await batch.commit();
      }
      console.log(`  ✓ ${fix.length} emails normalizados`);
    }
  }
  if (!APPLY) console.log("\nNo se ha cambiado nada. Para guardarlo: --apply");
  process.exit(0);
})().catch((e) => {
  console.error("Error:", e.code || "", e.message);
  process.exit(1);
});
