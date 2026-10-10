// Publica firestore.rules en el proyecto de Firebase con la service account del backend.
// Uso (desde la raíz del repo): node backend/scripts/publish-rules.js
const path = require("path");
const fs = require("fs");
require(path.join(__dirname, "..", "node_modules", "dotenv")).config({ path: path.join(__dirname, "..", ".env") });
const { admin } = require("../lib/firebase");

(async () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "firestore.rules"), "utf8");
  const rs = await admin.securityRules().releaseFirestoreRulesetFromSource(source);
  console.log("Reglas publicadas:", rs.name);
  process.exit(0);
})().catch((e) => {
  console.error("No se pudieron publicar:", e.message);
  process.exit(1);
});
