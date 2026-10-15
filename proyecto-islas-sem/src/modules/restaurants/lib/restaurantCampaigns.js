// Campañas de ISLAS SEM a los restaurantes (Restaurantes › Campañas).
// Son campañas normales de Email Marketing (colección "campaigns", marcadas con
// section: "restaurants"), así que usan la MISMA cola de envío, bajas, seguimiento de
// aperturas/clics e informes. Los destinatarios salen de una lista automática
// "Restaurantes · Contactos" con el email de contacto de cada ficha.
import { collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import { db, auth } from "../../../config/firebaseConfig";
import { loadSuppressed } from "../../campaigns/lib/campaignSend";
import { SENDER_EMAIL } from "../../../config/sender";

export const SECTION = "restaurants";
export const LIST_NAME = "Restaurantes · Contactos";
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
export const cleanEmail = (v) => String(v || "").trim().toLowerCase();
export const validEmail = (v) => EMAIL_RE.test(cleanEmail(v));

async function commit(ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const b = writeBatch(db);
    ops.slice(i, i + 400).forEach((op) => op(b));
    await b.commit();
  }
}

// Crea/actualiza la lista automática con el email de cada restaurante y devuelve
// { listId, subs, suppressed } (subs = suscriptores de la lista tras sincronizar, con su
// estado; suppressed = emails de la lista "Bajas").
// - Nunca se vuelve a dar de alta a quien se dio de baja o rebotó (se respeta su estado).
// - Quien está en la lista "Bajas" no se añade.
// - Nunca se borra a nadie: los correos ya enviados llevan el enlace de baja de su
//   suscriptor. Quien ya no corresponde (otro email, restaurante borrado o no elegido)
//   simplemente queda fuera de cada envío (campaign.lists.excludedEmails).
// Las llamadas se encadenan para que dos pantallas a la vez no creen la lista dos veces.
let queue = Promise.resolve();
export function syncRestaurantList(restaurants) {
  const run = queue.then(() => doSync(restaurants));
  queue = run.catch(() => {});
  return run;
}

async function doSync(restaurants) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sin sesión");
  const mine = (await getDocs(query(collection(db, "lists"), where("userId", "==", uid)))).docs;
  const existing = mine.find((d) => d.data().restaurants === true);
  const sender = mine.map((d) => d.data().senderEmail).find(Boolean) || SENDER_EMAIL;
  const listRef = existing ? existing.ref : doc(collection(db, "lists"));
  const ops = [];
  if (!existing) {
    ops.push((b) => b.set(listRef, { name: LIST_NAME, restaurants: true, userId: uid, senderEmail: sender, language: "es", subscribersCount: 0, createdAt: new Date() }));
  }
  const subsDocs = existing
    ? (await getDocs(query(collection(db, "subscribers"), where("listId", "==", listRef.id), where("userId", "==", uid)))).docs
    : [];
  const suppressed = await loadSuppressed(uid);
  const have = new Map(subsDocs.map((s) => [cleanEmail(s.data().email), s]));
  const should = new Map();
  for (const r of restaurants) {
    const email = cleanEmail(r.email);
    if (validEmail(email) && !suppressed.has(email) && !should.has(email)) should.set(email, r);
  }
  const result = new Map(subsDocs.map((s) => [s.id, { id: s.id, ...s.data() }]));
  for (const [email, r] of should) {
    const cur = have.get(email);
    if (cur) {
      const d = cur.data();
      if (d.restaurantId !== r.id || d.name !== (r.name || "")) {
        ops.push((b) => b.update(cur.ref, { restaurantId: r.id, name: r.name || "" }));
        result.set(cur.id, { ...result.get(cur.id), restaurantId: r.id, name: r.name || "" });
      }
      continue;
    }
    const ref = doc(collection(db, "subscribers"));
    const data = { email, name: r.name || "", listId: listRef.id, userId: uid, status: "subscribed", source: SECTION, restaurantId: r.id, createdAt: new Date() };
    ops.push((b) => b.set(ref, data));
    result.set(ref.id, { id: ref.id, ...data });
  }
  ops.push((b) => b.update(listRef, { subscribersCount: result.size, restaurantsSyncedAt: serverTimestamp() }));
  await commit(ops);
  return { listId: listRef.id, subs: [...result.values()], suppressed };
}

// Estado del suscriptor de un email (para avisar de bajas/rebotes al elegir destinatarios).
export const subStatus = (subs, email) => subs.find((s) => cleanEmail(s.email) === cleanEmail(email))?.status || "";
export const canReceive = (st) => !["unsubscribed", "baja", "bounced", "rebotado", "blocked", "invalid", "pending"].includes(String(st || "").toLowerCase());

export async function createRestaurantCampaign(data) {
  const uid = auth.currentUser?.uid;
  const ref = doc(collection(db, "campaigns"));
  await setDoc(ref, {
    ...data,
    section: SECTION,
    ownerId: uid,
    status: "draft",
    step: 2,
    lists: { selectedLists: [], totalSubscribers: 0, excludedEmails: [] },
    template: { templateId: null, templateName: null, type: "html", html: "" },
    send: { scheduleType: "now", scheduledAt: null, status: "draft" },
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return ref.id;
}

export const updateCampaign = (id, data) => updateDoc(doc(db, "campaigns", id), { ...data, updatedAt: new Date() });

// Igual que en Email Marketing: borrar una campaña cancela los correos que aún esperan en cola.
export async function deleteCampaign(orgId, campaignId) {
  let cancelled = 0;
  if (orgId) {
    const snap = await getDocs(query(collection(db, "outbox"), where("orgId", "==", orgId), where("campaignId", "==", campaignId)));
    const queued = snap.docs.filter((d) => ["pending", "scheduled"].includes(d.data().status));
    await commit(queued.map((d) => (b) => b.update(d.ref, { status: "cancelled", cancelledAt: Date.now() })));
    cancelled = queued.length;
  }
  await deleteDoc(doc(db, "campaigns", campaignId));
  return cancelled;
}

export const STATUS_LABEL = {
  draft: ["Borrador", "off"], scheduled: ["Programada", "wip"], sending: ["Enviando", "wip"], sent: ["Enviada", "ok"], inactive: ["De baja", "off"],
};
