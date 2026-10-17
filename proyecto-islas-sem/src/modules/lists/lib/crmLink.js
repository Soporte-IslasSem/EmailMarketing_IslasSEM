// CRM y Email Marketing = una sola base de datos.
// - Cada tipo de cliente ES una lista con su mismo nombre (lista "de tipo": crm, crmKey "type:<id>").
//   Crear, renombrar o borrar en un lado lo hace también en el otro.
// - Los contactos mandan: sus suscripciones en las listas del CRM ("Todos los contactos" y las de
//   tipo) se derivan de ellos y se actualizan al momento (useCrmLink escucha los cambios).
// - Lo que se hace en una lista de tipo vuelve al CRM: añadir un email le pone ese tipo al contacto
//   (y lo crea si no existe); quitarlo de la lista le quita el tipo.
// - Se respetan bajas y rebotes: quien está en "Bajas" no se añade, y las suscripciones que no
//   están activas (baja, rebote, no válido) se conservan tal cual.
// Las listas son de cada usuario (userId), como el resto de Email Marketing.
import {
  arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, increment, query, serverTimestamp, updateDoc, where, writeBatch,
} from "firebase/firestore";
import { db, auth } from "../../../config/firebaseConfig";
import { SENDER_EMAIL } from "../../../config/sender";
import { loadSuppressed } from "../../campaigns/lib/campaignSend";
import { typesOf, typeFields, newTypeId, saveClientTypes } from "../../crm/lib/clientTypes";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
export const normEmail = (e) => String(e || "").trim().toLowerCase().replace(/\s+/g, "");
export const isTypeList = (l) => !!l?.crm && String(l.crmKey || "").startsWith("type:");
export const typeIdOfList = (l) => (isTypeList(l) ? String(l.crmKey).slice(5) : null);
const nameOf = (c) => `${c.firstName || ""} ${c.lastName || ""}`.trim();

export async function commitOps(ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const b = writeBatch(db);
    ops.slice(i, i + 400).forEach((op) => op(b));
    await b.commit();
  }
}

// Listas del CRM del usuario: crmKey → { id, ref, data }
// Id fijo de la lista del CRM de un usuario para una clave ("all", "type:<id>"…): si dos pestañas
// (o dos equipos) la crean a la vez, escriben la misma lista en vez de crear copias repetidas.
export const crmListId = (uid, key) => `crm_${uid}_${String(key).replace(/[^A-Za-z0-9_-]/g, "-")}`;

// Si aún quedara alguna lista repetida para la misma clave, se usa siempre la misma: la que tenga
// más suscriptores (y, a igualdad, la de id fijo o la más antigua).
const ms = (t) => (t?.toMillis ? t.toMillis() : t instanceof Date ? t.getTime() : 0);
async function myCrmLists(uid) {
  const snap = await getDocs(query(collection(db, "lists"), where("userId", "==", uid)));
  const out = new Map();
  for (const d of snap.docs) {
    const data = d.data();
    if (!data.crm) continue;
    const cur = out.get(data.crmKey);
    const better = !cur
      || (data.subscribersCount || 0) > (cur.data.subscribersCount || 0)
      || ((data.subscribersCount || 0) === (cur.data.subscribersCount || 0)
        && (d.id === crmListId(uid, data.crmKey) || (cur.id !== crmListId(uid, data.crmKey) && ms(data.createdAt) < ms(cur.data.createdAt))));
    if (better) out.set(data.crmKey, { id: d.id, ref: d.ref, data });
  }
  return out;
}

// Una sincronización a la vez por pestaña (evita altas dobles si llegan cambios seguidos).
let queue = Promise.resolve();
const serial = (fn) => { const p = queue.then(fn, fn); queue = p.catch(() => {}); return p; };

/* ------------------------------------------------------------------ CRM → listas (al momento) */

// Pone al día las suscripciones de estos contactos en las listas del CRM del usuario.
// items: ids, o { id, data } con los datos ya leídos (data null = contacto borrado; hay que
// pasarlo así porque las reglas no dejan leer un documento que ya no existe).
export function syncContacts(items, orgId) {
  return serial(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !orgId || !items.length) return;
    const lists = await myCrmLists(uid);
    const contactLists = new Map([...lists].filter(([k]) => k === "all" || k.startsWith("type:")).map(([k, l]) => [l.id, { key: k, ...l }]));
    if (!contactLists.size) return;
    const suppressed = await loadSuppressed(uid);
    const ops = [];
    const delta = new Map();
    const bump = (listId, n) => delta.set(listId, (delta.get(listId) || 0) + n);

    const known = new Map(items.map((x) => (typeof x === "string" ? [x, undefined] : [x.id, x.data])));
    for (const [id, data] of known) {
      let c = data;
      if (c === undefined) {
        try { const s = await getDoc(doc(db, "contacts", id)); c = s.exists() ? s.data() : null; } catch { continue; } // sin permiso: no es suyo
      }
      const email = normEmail(c?.email);
      const name = c ? nameOf(c) : "";
      const want = new Map();
      if (c && c.orgId === orgId && EMAIL_RE.test(email) && !suppressed.has(email)) {
        for (const key of ["all", ...typesOf(c).map((t) => `type:${t}`)]) {
          const l = lists.get(key);
          if (l && !(l.data.excludedEmails || []).map(normEmail).includes(email)) want.set(l.id, l);
        }
      }
      const have = (await getDocs(query(collection(db, "subscribers"), where("userId", "==", uid), where("contactId", "==", id)))).docs;
      for (const s of have) {
        const d = s.data();
        if (!contactLists.has(d.listId)) continue; // otras listas (empresas, restaurantes…) no se tocan
        if (want.has(d.listId)) {
          want.delete(d.listId);
          if (d.status === "subscribed" && (d.email !== email || (d.name || "") !== name)) ops.push((b) => b.update(s.ref, { email, name }));
        } else if (d.status === "subscribed") {
          ops.push((b) => b.delete(s.ref));
          bump(d.listId, -1);
        }
      }
      for (const l of want.values()) {
        // ¿Ya estaba ese email en la lista (añadido a mano, formulario…)? Se enlaza al contacto.
        const ex = (await getDocs(query(collection(db, "subscribers"), where("listId", "==", l.id), where("userId", "==", uid), where("email", "==", email)))).docs[0];
        if (ex) { ops.push((b) => b.update(ex.ref, { contactId: id, source: "crm", ...(name ? { name } : {}) })); continue; }
        const ref = doc(db, "subscribers", `${l.id}_${id}`);
        ops.push((b) => b.set(ref, { email, ...(name ? { name } : {}), listId: l.id, userId: uid, status: "subscribed", source: "crm", contactId: id, createdAt: new Date() }));
        bump(l.id, 1);
      }
    }
    for (const [listId, n] of delta) if (n) ops.push((b) => b.update(doc(db, "lists", listId), { subscribersCount: increment(n), crmSyncedAt: serverTimestamp() }));
    await commitOps(ops);
  });
}

/* ------------------------------------------------------------------ CRM → listas (todo) */

// Revisión completa (al abrir Listas o al entrar, como mucho cada 10 min): crea las listas que
// falten (una por tipo + "Todos los contactos" + "Empresas"), renombra, borra las de tipos
// eliminados y cuadra suscriptores y contadores. Con create=false no hace nada a quien aún no
// tiene listas del CRM (no se las crea a todo el equipo solo por entrar).
export function syncAll({ orgId, types, visible, create }) {
  return serial(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !orgId) return;
    const load = async (col) => visible(col, (await getDocs(query(collection(db, col), where("orgId", "==", orgId)))).docs.map((d) => ({ id: d.id, ...d.data() })))
      .map((c) => ({ ...c, email: normEmail(c.email) }))
      .filter((c) => EMAIL_RE.test(c.email));
    const crmLists = await myCrmLists(uid);
    if (!create && !crmLists.size) return;
    const suppressed = await loadSuppressed(uid);
    const contacts = await load("contacts");
    const companies = await load("companies");
    const wanted = [{ key: "all", name: "CRM · Todos los contactos", pool: contacts, match: () => true }]
      .concat(types.map((t) => ({ key: `type:${t.id}`, name: t.label, pool: contacts, match: (c) => typesOf(c).includes(t.id) })))
      .concat([{ key: "companies", name: "CRM · Empresas", pool: companies, match: () => true }]);
    const mine = (await getDocs(query(collection(db, "lists"), where("userId", "==", uid)))).docs;
    const sender = mine.map((d) => d.data().senderEmail).find(Boolean) || SENDER_EMAIL;

    for (const w of wanted) {
      const cur = crmLists.get(w.key); // si falta, se crea (quien ya tiene listas del CRM, o al abrir Listas)
      const ref = cur?.ref || doc(db, "lists", crmListId(uid, w.key));
      const ops = [];
      if (!cur) ops.push((b) => b.set(ref, { name: w.name, crm: true, crmKey: w.key, userId: uid, senderEmail: sender, language: "es", subscribersCount: 0, createdAt: new Date() }));
      else if (cur.data.name !== w.name) ops.push((b) => b.update(ref, { name: w.name }));
      const subs = cur ? (await getDocs(query(collection(db, "subscribers"), where("listId", "==", ref.id), where("userId", "==", uid)))).docs : [];
      const have = new Map(subs.map((s) => [normEmail(s.data().email), s]));
      const removed = new Set((cur?.data.excludedEmails || []).map(normEmail));
      const should = new Map(w.pool.filter(w.match).filter((c) => !suppressed.has(c.email) && !removed.has(c.email)).map((c) => [c.email, c]));
      let count = subs.length;
      for (const [email, c] of should) {
        const s = have.get(email);
        const idField = w.key === "companies" ? "companyId" : "contactId";
        if (s) {
          if (s.data()[idField] !== c.id || s.data().source !== "crm") ops.push((b) => b.update(s.ref, { [idField]: c.id, source: "crm" }));
          continue;
        }
        const name = (w.key === "companies" ? c.name : nameOf(c)) || "";
        const sref = w.key === "companies" ? doc(collection(db, "subscribers")) : doc(db, "subscribers", `${ref.id}_${c.id}`);
        ops.push((b) => b.set(sref, { email, ...(name ? { name } : {}), listId: ref.id, userId: uid, status: "subscribed", source: "crm", [idField]: c.id, createdAt: new Date() }));
        count++;
      }
      for (const [email, s] of have) {
        if (should.has(email) || s.data().source !== "crm" || s.data().status !== "subscribed") continue;
        ops.push((b) => b.delete(s.ref));
        count--;
      }
      if (ops.length || (cur && cur.data.subscribersCount !== count)) ops.push((b) => b.update(ref, { subscribersCount: count, crmSyncedAt: serverTimestamp() }));
      await commitOps(ops);
    }
    // Listas de tipo cuyo tipo ya no existe (se borró en el CRM): se borran con sus suscriptores.
    for (const [key, l] of crmLists) {
      if (String(key).startsWith("type:") && !wanted.some((w) => w.key === key)) await deleteListDocs(l.id, uid);
    }
  });
}

async function deleteListDocs(listId, uid) {
  const subs = (await getDocs(query(collection(db, "subscribers"), where("listId", "==", listId), where("userId", "==", uid)))).docs;
  await commitOps(subs.map((s) => (b) => b.delete(s.ref)));
  await deleteDoc(doc(db, "lists", listId));
}

/* ------------------------------------------------------------------ listas → CRM */

// Añadir emails a una lista de tipo: cada email queda como contacto del CRM con ese tipo
// (se crea si no existe). La suscripción la crea después syncContacts (useCrmLink).
export async function addEmailsToTypeList(list, entries, orgId) {
  const typeId = typeIdOfList(list);
  if (!typeId) throw new Error("No es una lista de tipo de cliente");
  const all = (await getDocs(query(collection(db, "contacts"), where("orgId", "==", orgId)))).docs.map((d) => ({ id: d.id, ...d.data() }));
  const byEmail = new Map(all.filter((c) => c.email).map((c) => [normEmail(c.email), c]));
  let n = 0;
  all.forEach((c) => { const m = /^CLI-(\d+)$/.exec(c.clientId || ""); if (m) n = Math.max(n, parseInt(m[1], 10)); });
  const out = { created: 0, tagged: 0, already: 0, invalid: 0, ids: [] };
  const ops = [];
  const seen = new Set();
  const me = normEmail(auth.currentUser?.email);
  for (const e of entries) {
    const email = normEmail(e.email);
    if (!EMAIL_RE.test(email)) { out.invalid++; continue; }
    if (seen.has(email)) continue;
    seen.add(email);
    const c = byEmail.get(email);
    if (c) {
      out.ids.push(c.id);
      if (typesOf(c).includes(typeId)) { out.already++; continue; }
      ops.push((b) => b.update(doc(db, "contacts", c.id), { ...typeFields([...typesOf(c), typeId]), updatedAt: serverTimestamp() }));
      out.tagged++;
    } else {
      const ref = doc(collection(db, "contacts"));
      const [firstName, ...rest] = String(e.name || "").trim().split(/\s+/);
      const clientId = "CLI-" + String(++n).padStart(4, "0");
      ops.push((b) => b.set(ref, {
        firstName: firstName || "", lastName: rest.join(" "), email, ...typeFields([typeId]), clientId, relation: "nuevo", stage: "Lead",
        source: "Email Marketing", createdByEmail: me, orgId, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      }));
      out.ids.push(ref.id);
      out.created++;
    }
  }
  await commitOps(ops);
  return out;
}

// Quitar suscriptores de una lista de tipo: a sus contactos se les quita ese tipo (y por eso
// salen de la lista). Los que no vienen de un contacto se borran sin más.
export async function removeFromTypeList(list, subs) {
  const typeId = typeIdOfList(list);
  const ops = [];
  let gone = 0;
  for (const s of subs) {
    if (s.contactId) {
      const snap = await getDoc(doc(db, "contacts", s.contactId)).catch(() => null);
      if (snap?.exists()) {
        const left = typesOf(snap.data()).filter((t) => t !== typeId);
        ops.push((b) => b.update(snap.ref, { ...typeFields(left), updatedAt: serverTimestamp() }));
        if (s.status === "subscribed") continue; // la suscripción activa la quita syncContacts
      }
    }
    ops.push((b) => b.delete(doc(db, "subscribers", s.id)));
    gone++;
  }
  if (gone) ops.push((b) => b.update(doc(db, "lists", list.id), { subscribersCount: increment(-gone) }));
  await commitOps(ops);
}

/* ------------------------------------------------------------------ tipos ⇄ listas */

// Nuevo tipo de cliente con su lista (al crear una lista en Email Marketing o un tipo en el CRM).
export async function createTypeWithList(label, orgId, types, { language = "es" } = {}) {
  const name = String(label || "").trim();
  if (!name) throw new Error("Falta el nombre");
  if (types.some((t) => t.label.trim().toLowerCase() === name.toLowerCase())) throw new Error(`Ya existe "${name}"`);
  const id = newTypeId(name, types);
  // Primero la lista y después el tipo: si el tipo apareciera antes, otra pestaña crearía su lista.
  const ref = doc(db, "lists", crmListId(auth.currentUser.uid, `type:${id}`));
  const b = writeBatch(db);
  b.set(ref, { name, crm: true, crmKey: `type:${id}`, userId: auth.currentUser.uid, senderEmail: SENDER_EMAIL, language, subscribersCount: 0, createdAt: new Date() });
  await b.commit();
  await saveClientTypes(orgId, [...types, { id, label: name, icon: "", color: "#1a9190" }]);
  return { typeId: id, listId: ref.id };
}

// Convertir una lista hecha a mano en tipo de cliente (lo decide un administrador desde Listas):
// la lista pasa a ser la del nuevo tipo y su gente queda clasificada en el CRM.
export async function convertListToType(list, orgId, types) {
  if (list.crm || list.bajas || list.restaurants) throw new Error("Esta lista no se puede convertir");
  const name = String(list.name || "").trim() || "Sin nombre";
  const id = newTypeId(name, types);
  if (types.some((t) => t.label.trim().toLowerCase() === name.toLowerCase())) throw new Error(`Ya existe el tipo "${name}": cambia el nombre de la lista antes`);
  await updateDoc(doc(db, "lists", list.id), { crm: true, crmKey: `type:${id}`, name, convertedAt: serverTimestamp() });
  await saveClientTypes(orgId, [...types, { id, label: name, icon: "", color: "#1a9190" }]);
  const subs = (await getDocs(query(collection(db, "subscribers"), where("listId", "==", list.id), where("userId", "==", auth.currentUser.uid)))).docs.map((d) => d.data());
  return addEmailsToTypeList({ ...list, crm: true, crmKey: `type:${id}` }, subs.map((s) => ({ email: s.email, name: s.name })), orgId);
}

// Listas hechas a mano que aún no van unidas al CRM (las especiales no se tocan).
// (mergedTypeId: lista repetida cuya gente ya pasó al tipo del mismo nombre.)
export const isLooseList = (l) => !!l && !l.crm && !l.bajas && !l.restaurants && !l.mergedTypeId;

// Convertir de una vez todas las listas hechas a mano en tipos de cliente (lo decide un
// administrador desde Listas). Lee los contactos una sola vez y escribe en bloque:
// - Lista con nombre nuevo → nuevo tipo de cliente; la lista pasa a ser la de ese tipo.
// - Lista con el mismo nombre que un tipo ya existente (o que otra lista convertida aquí) →
//   su gente recibe ese tipo y entra en la lista del tipo; la lista original no se borra ni se
//   cambia (queda repetida y el administrador decide si la borra).
// Nadie pierde los tipos que ya tenía; las bajas y rebotes se respetan (syncContacts).
export async function convertListsToTypes(lists, orgId, types) {
  const uid = auth.currentUser.uid;
  const key = (s) => String(s || "").trim().toLowerCase();
  const allTypes = [...types];
  const byName = new Map(types.map((t) => [key(t.label), t.id]));
  const plan = [];
  for (const l of lists.filter(isLooseList)) {
    const name = String(l.name || "").trim() || "Sin nombre";
    let typeId = byName.get(key(name));
    const merged = !!typeId;
    if (!typeId) {
      typeId = newTypeId(name, allTypes);
      allTypes.push({ id: typeId, label: name, icon: "", color: "#1a9190" });
      byName.set(key(name), typeId);
    }
    plan.push({ list: l, name, typeId, merged });
  }
  const out = { lists: plan.length, newTypes: allTypes.length - types.length, merged: plan.filter((p) => p.merged).map((p) => p.name), created: 0, tagged: 0, invalid: 0 };
  if (!plan.length) return out;

  // 1) Listas que pasan a ser la de su tipo y, después, los tipos nuevos (en ese orden: si el tipo
  //    apareciera antes que su lista, otra pestaña abierta crearía una lista repetida).
  await commitOps(plan.map((p) => (b) => b.update(doc(db, "lists", p.list.id), p.merged
    ? { mergedTypeId: p.typeId, convertedAt: serverTimestamp() }
    : { crm: true, crmKey: `type:${p.typeId}`, name: p.name, convertedAt: serverTimestamp() })));
  if (out.newTypes) await saveClientTypes(orgId, allTypes);

  // 2) Personas de cada lista → contacto con ese tipo (se crea si no existe).
  const contacts = (await getDocs(query(collection(db, "contacts"), where("orgId", "==", orgId)))).docs.map((d) => ({ id: d.id, ...d.data() }));
  const byEmail = new Map(contacts.filter((c) => c.email).map((c) => [normEmail(c.email), c]));
  let n = 0;
  contacts.forEach((c) => { const m = /^CLI-(\d+)$/.exec(c.clientId || ""); if (m) n = Math.max(n, parseInt(m[1], 10)); });
  const want = new Map(); // email → { contact, name, types }
  for (const p of plan) {
    const subs = (await getDocs(query(collection(db, "subscribers"), where("listId", "==", p.list.id), where("userId", "==", uid)))).docs.map((d) => d.data());
    for (const s of subs) {
      const email = normEmail(s.email);
      if (!EMAIL_RE.test(email)) { out.invalid++; continue; }
      const w = want.get(email) || { contact: byEmail.get(email), name: "", types: new Set() };
      w.types.add(p.typeId);
      if (!w.name && s.name) w.name = String(s.name).trim();
      want.set(email, w);
    }
  }
  const me = normEmail(auth.currentUser?.email);
  const ops = [];
  for (const [email, w] of want) {
    const [firstName, ...rest] = String(w.name || "").split(/\s+/);
    if (w.contact) {
      const cur = typesOf(w.contact);
      const next = [...cur, ...[...w.types].filter((t) => !cur.includes(t))];
      if (next.length === cur.length) continue;
      // Contacto sin nombre en el CRM: se queda con el de la lista.
      const name = !w.contact.firstName && !w.contact.lastName && w.name ? { firstName, lastName: rest.join(" ") } : {};
      ops.push((b) => b.update(doc(db, "contacts", w.contact.id), { ...typeFields(next), ...name, updatedAt: serverTimestamp() }));
      out.tagged++;
    } else {
      const ref = doc(collection(db, "contacts"));
      const clientId = "CLI-" + String(++n).padStart(4, "0");
      ops.push((b) => b.set(ref, {
        firstName: firstName || "", lastName: rest.join(" "), email, ...typeFields([...w.types]), clientId, relation: "nuevo", stage: "Lead",
        source: "Email Marketing", createdByEmail: me, orgId, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      }));
      out.created++;
    }
  }
  await commitOps(ops);
  return out;
}

// Borrar un tipo de cliente en todas partes: su lista (con sus suscriptores), el tipo en los
// contactos y en la lista de tipos de la empresa.
export async function deleteTypeEverywhere(typeId, orgId, types) {
  await purgeTypes([typeId], orgId);
  await saveClientTypes(orgId, types.filter((t) => t.id !== typeId));
}

// Quitar unos tipos (ya borrados o a punto de borrarse) de contactos, empresas y listas.
export async function purgeTypes(typeIds, orgId) {
  const gone = new Set(typeIds);
  if (!gone.size) return;
  const uid = auth.currentUser.uid;
  for (const [key, l] of await myCrmLists(uid)) if (key.startsWith("type:") && gone.has(key.slice(5))) await deleteListDocs(l.id, uid);
  const contacts = (await getDocs(query(collection(db, "contacts"), where("orgId", "==", orgId)))).docs.filter((d) => typesOf(d.data()).some((t) => gone.has(t)));
  await commitOps(contacts.map((d) => (b) => b.update(d.ref, { ...typeFields(typesOf(d.data()).filter((t) => !gone.has(t))), updatedAt: serverTimestamp() })));
  const companies = (await getDocs(query(collection(db, "companies"), where("orgId", "==", orgId)))).docs.filter((d) => gone.has(d.data().clientType));
  await commitOps(companies.map((d) => (b) => b.update(d.ref, { clientType: "", updatedAt: serverTimestamp() })));
}

// Quitar de "Todos los contactos" a mano: no se vuelve a añadir solo.
export const excludeFromList = (listId, emails) => updateDoc(doc(db, "lists", listId), { excludedEmails: arrayUnion(...emails.map(normEmail)) });
