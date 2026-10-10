// Importador Bitrix24 → CRM ISLAS SEM (Firestore).
//
// Lee la exportación JSON de Bitrix (carpeta `data/` de export_bitrix.py) y crea
// contactos, compañías, prospectos, negociaciones, productos, actividades (correos,
// llamadas, formularios…) y los campos personalizados que se usaban en Bitrix.
//
//   node scripts/import-bitrix.js <carpeta_data>                → SIMULACRO (no escribe)
//   node scripts/import-bitrix.js <carpeta_data> --apply        → escribe en Firestore
//   --only=contacts,companies    → solo esas colecciones (y sus campos personalizados)
//
// Embudos: los decide ISLAS SEM. El simulacro genera `bitrix-pipeline-map.json` junto a
// los datos con cada embudo/etapa de Bitrix; rellena `pipelineId` y `stage` con los del
// CRM nuevo. Las negociaciones sin destino se importan igual, sin embudo, conservando
// su embudo/etapa de Bitrix en `bitrixFunnel` / `bitrixStage` (no se pierde nada).
//
// Es idempotente: los IDs son `bx_<tipo>_<ID Bitrix>`, así que repetirlo actualiza en
// vez de duplicar (merge: no borra lo editado después en la app salvo los campos importados).
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const fs = require("fs");
const path = require("path");

const DATA = process.argv[2];
const APPLY = process.argv.includes("--apply");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7).split(",").filter(Boolean);
const ORG = "islas-sem";
if (!DATA || !fs.existsSync(DATA)) {
  console.error("Uso: node scripts/import-bitrix.js <carpeta data de la exportación> [--apply]");
  process.exit(1);
}
const load = (n) => {
  const p = path.join(DATA, n + ".json");
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
};

/* ---------- utilidades ---------- */
const date = (s) => (s ? new Date(s) : null);
const first = (multi) => (Array.isArray(multi) && multi[0] ? String(multi[0].VALUE || "").trim() : "");
const all = (multi) => (Array.isArray(multi) ? multi.map((m) => m.VALUE).filter(Boolean).join(", ") : "");
const id = (type, bxId) => `bx_${type}_${bxId}`;
const nz = (v) => v && v !== "0";
function htmlToText(html) {
  return String(html || "")
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
}
function slugKey(label) {
  return String(label || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "campo";
}

/* ---------- diccionarios ---------- */
const statuses = load("crm_statuses") || [];
const statusName = (entity, code) => (statuses.find((s) => s.ENTITY_ID === entity && s.STATUS_ID === code) || {}).NAME || code || "";
const categories = Object.fromEntries((load("crm_deal_categories") || []).map((c) => [String(c.ID), c.NAME]));
categories["0"] = categories["0"] || "General";

const SOURCE = { EMAIL: "Email", WEBFORM: "Formulario web", CALL: "Llamada", WEB: "Formulario web", ADVERTISING: "Google Ads", RECOMMENDATION: "Manual", OTHER: "Manual", SELF: "Manual", PARTNER: "Manual", TRADE_SHOW: "Manual", STORE: "Manual" };
const source = (code) => SOURCE[code] || (code ? "Importado" : "Importado");

/* ---------- campos personalizados (UF_*) ---------- */
// UF que van a campos estándar del CRM nuevo en vez de a campos personalizados.
// "Tipo Cliente" de los contactos es el tipo de cliente de la app (clientType), no un campo extra.
const STD_UF_LABELS = { contacts: { "Tipo Cliente": "clientTypeLabel" }, companies: { "CIF/NIF": "cif", IBAN: "iban", "Comunidad Autónoma": "community", Localidad: "city", Sector: "industry" } };
const UF_TYPE = { string: "text", double: "number", integer: "number", date: "date", datetime: "date", enumeration: "select", boolean: "checkbox", url: "url" };
// Campos de ejemplo de Bitrix ("Tipo de cliente 1/2/3"): se guardan en bitrixExtra, sin campo visible.
const SAMPLE_UF_LABELS = { contacts: ["Tipo de cliente"] };
const customDefs = []; // definiciones a crear

function buildCustomMap(entity, bxEntity, rows) {
  const meta = load(`crm_${bxEntity}_fields`) || {};
  const std = STD_UF_LABELS[entity] || {};
  const used = Object.keys(meta).filter((k) => k.startsWith("UF_") && rows.some((r) => r[k] !== null && r[k] !== "" && r[k] !== false && r[k] !== "0" && !(Array.isArray(r[k]) && !r[k].length)));
  const map = {}; // UF -> { key, std, items }
  const taken = new Set();
  used.forEach((uf, i) => {
    const m = meta[uf];
    const items = Object.fromEntries((m.items || []).map((it) => [String(it.ID), it.VALUE]));
    const label = String(m.listLabel || m.formLabel || "").trim();
    // Campos sin nombre en Bitrix (casi todos datos de prueba): no se crean como campo
    // visible, pero su valor se guarda en `bitrixExtra` para no perder nada.
    if (!label) { map[uf] = { extra: uf, items }; return; }
    if (std[label]) { map[uf] = { std: std[label], items }; return; }
    if ((SAMPLE_UF_LABELS[entity] || []).includes(label)) { map[uf] = { extra: uf, items }; return; }
    let key = slugKey(label);
    for (let n = 2; taken.has(key); n++) key = `${slugKey(label)}_${n}`;
    taken.add(key);
    map[uf] = { key, items };
    customDefs.push({
      _id: `bx_${entity}_${uf}`, entity, label, key, sort: i,
      type: UF_TYPE[m.type] || "text",
      options: m.items ? m.items.map((it) => it.VALUE) : [],
    });
  });
  return map;
}
function ufValues(row, map) {
  const custom = {}, std = {}, extra = {};
  for (const [uf, info] of Object.entries(map)) {
    let v = row[uf];
    if (v === null || v === undefined || v === "" || v === false) continue;
    if (Array.isArray(v)) v = v.map((x) => info.items[String(x)] || x).join(", ");
    else if (info.items[String(v)]) v = info.items[String(v)];
    if (typeof v === "string") v = v.replace(/\|-?[\d.]+;-?[\d.]+$/, "").trim(); // direcciones Bitrix: "texto|lat;lng"
    if (v === "Y") v = true;
    if (v === "N") continue;
    if (info.std) std[info.std] = String(v);
    else if (info.extra) extra[info.extra] = v;
    else custom[info.key] = v;
  }
  return { custom, std, extra };
}

/* ---------- carga ---------- */
const bxContacts = load("crm_contacts") || [];
const bxCompanies = load("crm_companys") || [];
const bxLeads = load("crm_leads") || [];
const bxDeals = load("crm_deals") || [];
const bxActivities = load("crm_activities") || [];
const bxRequisites = load("crm_requisites") || [];
const bxAddresses = load("crm_addresses") || [];
const bxProducts = load("crm_products") || [];

const cfContacts = buildCustomMap("contacts", "contact", bxContacts);
const cfCompanies = buildCustomMap("companies", "company", bxCompanies);
const cfLeads = buildCustomMap("leads", "lead", bxLeads);
const cfDeals = buildCustomMap("deals", "deal", bxDeals);

// Dirección por entidad (ANCHOR_TYPE_ID 3 = contacto, 4 = compañía)
const addressOf = {};
bxAddresses.forEach((a) => {
  const txt = [a.ADDRESS_1, a.ADDRESS_2, a.POSTAL_CODE, a.CITY, a.PROVINCE].filter(Boolean).join(", ");
  if (txt) addressOf[`${a.ANCHOR_TYPE_ID}:${a.ANCHOR_ID}`] = { txt, city: a.CITY || "", province: a.PROVINCE || a.REGION || "" };
});
const reqOf = {};
bxRequisites.forEach((r) => { reqOf[`${r.ENTITY_TYPE_ID}:${r.ENTITY_ID}`] = r; });

const companyName = Object.fromEntries(bxCompanies.map((c) => [String(c.ID), c.TITLE || ""]));

/* ---------- transformación ---------- */
const out = { companies: [], contacts: [], leads: [], deals: [], products: [], activities: [], customFields: [] };

bxCompanies.forEach((c) => {
  const { custom, std, extra } = ufValues(c, cfCompanies);
  const req = reqOf[`4:${c.ID}`] || {};
  const addr = addressOf[`4:${c.ID}`] || {};
  out.companies.push({
    _id: id("company", c.ID), name: c.TITLE || "", cif: std.cif || req.RQ_VAT_ID || req.RQ_INN || "",
    iban: std.iban || "", industry: std.industry || statusName("INDUSTRY", c.INDUSTRY), website: first(c.WEB),
    email: first(c.EMAIL), phone: first(c.PHONE), city: std.city || addr.city || "", community: std.community || "",
    address: addr.txt || "", rgpd: "Pendiente", notes: htmlToText(c.COMMENTS), custom, bitrixExtra: extra,
    source: "Importado", bitrixId: c.ID, createdAt: date(c.DATE_CREATE),
  });
});

// "SUBVENCION KIT DIGITAL" -> "subvencion-kit-digital" (mismo id que crea la app en Tipos de cliente).
const typeId = (label) => String(label || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);

bxContacts.forEach((c) => {
  const { custom, std, extra } = ufValues(c, cfContacts);
  const addr = addressOf[`3:${c.ID}`] || {};
  const req = reqOf[`3:${c.ID}`] || {};
  out.contacts.push({
    _id: id("contact", c.ID), clientId: `BX-${c.ID}`,
    firstName: [c.NAME, c.SECOND_NAME].filter(Boolean).join(" "), lastName: c.LAST_NAME || "",
    email: first(c.EMAIL).toLowerCase(), phone: first(c.PHONE), whatsapp: "",
    otherEmails: all((c.EMAIL || []).slice(1)), otherPhones: all((c.PHONE || []).slice(1)), website: first(c.WEB),
    company: companyName[String(c.COMPANY_ID)] || "", companyId: nz(c.COMPANY_ID) ? id("company", c.COMPANY_ID) : "",
    role: c.POST || "", clientType: typeId(std.clientTypeLabel), relation: c.TYPE_ID === "CLIENT" ? "recurrente" : "", stage: "Cliente",
    dni: req.RQ_IDENT_DOC_NUM || "", address: addr.txt || "", city: addr.city || "", province: addr.province || "",
    notes: htmlToText(c.COMMENTS), source: source(c.SOURCE_ID), responsable: "", tags: [], custom, bitrixExtra: extra,
    bitrixId: c.ID, createdAt: date(c.DATE_CREATE),
  });
});

const LEAD_STATUS = { NEW: "Nuevo", IN_PROCESS: "Contactado", PROCESSED: "Cualificado", CONVERTED: "Convertido", JUNK: "No cualificado" };
bxLeads.forEach((l) => {
  const { custom, extra } = ufValues(l, cfLeads);
  out.leads.push({
    _id: id("lead", l.ID), firstName: l.NAME || l.TITLE || "", lastName: l.LAST_NAME || "",
    email: first(l.EMAIL).toLowerCase(), phone: first(l.PHONE), whatsapp: "", company: l.COMPANY_TITLE || "",
    source: source(l.SOURCE_ID), status: LEAD_STATUS[l.STATUS_ID] || "Nuevo", responsable: "",
    estimatedValue: Number(l.OPPORTUNITY) || 0, notes: [l.TITLE, htmlToText(l.COMMENTS)].filter(Boolean).join(" — "), custom, bitrixExtra: extra,
    convertedContactId: nz(l.CONTACT_ID) ? id("contact", l.CONTACT_ID) : "",
    convertedCompanyId: nz(l.COMPANY_ID) ? id("company", l.COMPANY_ID) : "",
    bitrixId: l.ID, createdAt: date(l.DATE_CREATE),
  });
});

// Mapa de embudos (lo decide ISLAS SEM)
const mapPath = path.join(DATA, "bitrix-pipeline-map.json");
const pipeMap = fs.existsSync(mapPath) ? JSON.parse(fs.readFileSync(mapPath, "utf8")) : {};
const stageTemplate = {};
const contactNameById = Object.fromEntries(out.contacts.map((c) => [c.bitrixId, `${c.firstName} ${c.lastName}`.trim()]));
const contactEmailById = Object.fromEntries(out.contacts.map((c) => [c.bitrixId, c.email]));
bxDeals.forEach((d) => {
  const { custom, extra } = ufValues(d, cfDeals);
  const cat = String(d.CATEGORY_ID || "0");
  const stageEntity = cat === "0" ? "DEAL_STAGE" : `DEAL_STAGE_${cat}`;
  const funnel = categories[cat] || cat;
  const stage = statusName(stageEntity, d.STAGE_ID);
  const k = d.STAGE_ID;
  stageTemplate[k] = stageTemplate[k] || { bitrix: `${funnel} › ${stage}`, negociaciones: 0, pipelineId: (pipeMap[k] || {}).pipelineId || "", stage: (pipeMap[k] || {}).stage || "", board: (pipeMap[k] || {}).board || "pos" };
  stageTemplate[k].negociaciones++;
  const target = pipeMap[k] || {};
  out.deals.push({
    _id: id("deal", d.ID), title: d.TITLE || `Negociación ${d.ID}`, amount: Number(d.OPPORTUNITY) || 0,
    board: target.board || "pos",
    pipelineId: target.pipelineId || "", stage: target.stage || "",
    // ISLAS SEM renombró etapas de cierre (p. ej. "EJECUTADO" era la de pérdida),
    // así que no se deduce ganado/perdido: se conserva el nombre real de la etapa.
    bitrixFunnel: funnel, bitrixStage: stage, closed: d.CLOSED === "Y",
    contact: contactNameById[d.CONTACT_ID] || "", contactId: nz(d.CONTACT_ID) ? id("contact", d.CONTACT_ID) : "",
    contactEmail: contactEmailById[d.CONTACT_ID] || "",
    company: companyName[String(d.COMPANY_ID)] || "", companyId: nz(d.COMPANY_ID) ? id("company", d.COMPANY_ID) : "",
    source: source(d.SOURCE_ID), clientType: "nuevo", responsable: "", notes: htmlToText(d.COMMENTS), custom, bitrixExtra: extra,
    closeDate: date(d.CLOSEDATE), bitrixId: d.ID, createdAt: date(d.DATE_CREATE),
  });
});

bxProducts.forEach((p) => {
  out.products.push({
    _id: id("product", p.ID), name: p.NAME || "", sku: p.CODE || "", category: "",
    price: Number(p.PRICE) || 0, stock: 0, description: htmlToText(p.DESCRIPTION), active: p.ACTIVE !== "N",
    bitrixId: p.ID, createdAt: date(p.DATE_CREATE),
  });
});

const ACT_TYPE = { CRM_EMAIL: "Email", VOXIMPLANT_CALL: "Llamada", CRM_WEBFORM: "Formulario", CRM_SMS: "SMS", IMOPENLINES_SESSION: "Chat", CRM_TODO: "Tarea", CRM_MEETING: "Reunión", CRM_CALL: "Llamada" };
const dealContact = Object.fromEntries(bxDeals.map((d) => [String(d.ID), nz(d.CONTACT_ID) ? id("contact", d.CONTACT_ID) : ""]));
bxActivities.forEach((a) => {
  const type = ACT_TYPE[a.PROVIDER_ID] || (String(a.TYPE_ID) === "2" ? "Llamada" : "Nota");
  const owner = String(a.OWNER_TYPE_ID), oid = String(a.OWNER_ID);
  let contactId = "", leadId = "", entity = null, entityId = null;
  if (owner === "3") { contactId = id("contact", oid); entity = "contact"; entityId = contactId; }
  else if (owner === "2") { entity = "deal"; entityId = id("deal", oid); contactId = dealContact[oid] || ""; }
  else if (owner === "1") { leadId = id("lead", oid); entity = "lead"; entityId = leadId; }
  else if (owner === "4") { entity = "company"; entityId = id("company", oid); }
  let counterpart = "";
  try { counterpart = (a.COMMUNICATIONS || [])[0]?.VALUE || ""; } catch { /* sin comunicaciones */ }
  const incoming = String(a.DIRECTION) === "1";
  const icon = { Email: incoming ? "📥" : "📤", Llamada: "📞", Formulario: "📋", SMS: "💬", Chat: "💬", Tarea: "✅", Reunión: "🤝" }[type] || "📝";
  out.activities.push({
    _id: id("activity", a.ID), type, title: `${icon} ${a.SUBJECT || type}`.slice(0, 200),
    body: htmlToText(a.DESCRIPTION).slice(0, 20000), subject: a.SUBJECT || "",
    from: incoming ? counterpart : "", to: incoming ? "" : counterpart,
    entity, entityId, contactId, leadId, done: String(a.COMPLETED) === "Y" || a.STATUS === "2",
    auto: false, imported: true, bitrixId: a.ID, createdAt: date(a.CREATED || a.START_TIME),
  });
});

out.customFields = customDefs;
// --only: deja solo las colecciones pedidas (y los campos personalizados de esas entidades).
if (ONLY.length) {
  for (const k of Object.keys(out)) if (k !== "customFields" && !ONLY.includes(k)) delete out[k];
  out.customFields = customDefs.filter((d) => ONLY.includes(d.entity));
}

/* ---------- informe ---------- */
fs.writeFileSync(mapPath, JSON.stringify(stageTemplate, null, 2));
const withoutPipe = (out.deals || []).filter((d) => !d.pipelineId).length;
console.log(APPLY ? "== IMPORTACIÓN REAL ==" : "== SIMULACRO (no se escribe nada; usa --apply para importar) ==");
for (const [k, v] of Object.entries(out)) console.log(`  ${k.padEnd(13)} ${v.length}`);
console.log(`  campos personalizados por entidad: ${["contacts", "companies", "leads", "deals"].map((e) => `${e}=${customDefs.filter((d) => d.entity === e).length}`).join(" ")}`);
console.log(`  negociaciones sin embudo asignado: ${withoutPipe} (edita ${mapPath})`);
const orphanActs = (out.activities || []).filter((a) => !a.contactId && !a.leadId && !a.entityId).length;
console.log(`  actividades sin cliente: ${orphanActs}`);

if (process.argv.includes("--sample")) {
  const pick = (rows, fn) => rows.find(fn) || rows[0];
  console.log(JSON.stringify({
    contacto: pick(out.contacts, (c) => Object.keys(c.custom).length > 2),
    compania: pick(out.companies, (c) => c.cif),
    negociacion: (out.deals || [])[0],
    correo: out.activities ? pick(out.activities, (a) => a.type === "Email" && a.from) : null,
  }, null, 1).slice(0, 6000));
}
if (!APPLY) process.exit(0);

/* ---------- escritura ---------- */
(async () => {
  const { db } = require("../lib/firebase");
  for (const [coll, rows] of Object.entries(out)) {
    for (let i = 0; i < rows.length; i += 400) {
      const batch = db.batch();
      rows.slice(i, i + 400).forEach(({ _id, ...data }) => {
        const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
        batch.set(db.collection(coll).doc(_id), { ...clean, orgId: ORG, createdAt: clean.createdAt || new Date(), updatedAt: new Date(), importedFrom: "bitrix24" }, { merge: true });
      });
      await batch.commit();
    }
    console.log(`  ✔ ${coll}: ${rows.length}`);
  }
  console.log("IMPORTACIÓN COMPLETA");
  process.exit(0);
})().catch((e) => { console.error("ERROR", e); process.exit(1); });
