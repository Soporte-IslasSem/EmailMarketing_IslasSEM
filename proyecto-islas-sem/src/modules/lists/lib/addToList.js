// Añadir contactos del CRM a una lista de Email Marketing creada a mano (CRM › Contactos ›
// seleccionar › "Añadir a lista…"). No toca el tipo de cliente del contacto.
// - no duplica: quien ya está en la lista se cuenta como "ya estaban";
// - no añade a quien está en "Bajas" ni a quien en esa lista se dio de baja o rebotó
//   (ya está en la lista con ese estado y se respeta);
// - se salta a quien no tiene email válido.
import { useEffect, useState } from "react";
import { addDoc, collection, doc, getDocs, increment, onSnapshot, query, where, writeBatch } from "firebase/firestore";
import { db, auth } from "../../../config/firebaseConfig";
import { SENDER_EMAIL } from "../../../config/sender";
import { loadSuppressed } from "../../campaigns/lib/campaignSend";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const norm = (e) => String(e || "").trim().toLowerCase();

// Listas manuales del usuario (sin las automáticas "CRM · …" ni la de Bajas).
export function useManualLists() {
  const [lists, setLists] = useState([]);
  const uid = auth.currentUser?.uid;
  useEffect(() => {
    if (!uid) return undefined;
    return onSnapshot(
      query(collection(db, "lists"), where("userId", "==", uid)),
      (s) => setLists(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((l) => !l.crm && !l.bajas).sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))),
      () => setLists([])
    );
  }, [uid]);
  return lists;
}

export async function createManualList(name) {
  const ref = await addDoc(collection(db, "lists"), {
    name: name.trim(), senderEmail: SENDER_EMAIL, language: "es", userId: auth.currentUser.uid, subscribersCount: 0, createdAt: new Date(),
  });
  return ref.id;
}

// contacts: [{ id, email, firstName, lastName }]. Devuelve el resumen para el aviso.
export async function addContactsToList(listId, contacts) {
  const uid = auth.currentUser?.uid;
  const have = new Set((await getDocs(query(collection(db, "subscribers"), where("listId", "==", listId), where("userId", "==", uid)))).docs.map((d) => norm(d.data().email)));
  const suppressed = await loadSuppressed(uid);
  const out = { added: 0, already: 0, noEmail: 0, suppressed: 0 };
  const toAdd = new Map();
  for (const c of contacts) {
    const email = norm(c.email);
    if (!EMAIL_RE.test(email)) out.noEmail++;
    else if (have.has(email) || toAdd.has(email)) out.already++;
    else if (suppressed.has(email)) out.suppressed++;
    else toAdd.set(email, c);
  }
  const rows = [...toAdd];
  for (let i = 0; i < rows.length; i += 400) {
    const b = writeBatch(db);
    rows.slice(i, i + 400).forEach(([email, c]) => {
      const name = `${c.firstName || ""} ${c.lastName || ""}`.trim();
      b.set(doc(collection(db, "subscribers")), { email, ...(name ? { name } : {}), listId, userId: uid, status: "subscribed", source: "crm-contactos", contactId: c.id, createdAt: new Date() });
    });
    await b.commit();
  }
  out.added = rows.length;
  if (out.added) {
    const b = writeBatch(db);
    b.update(doc(db, "lists", listId), { subscribersCount: increment(out.added), lastImportAt: new Date(), lastImportSource: "crm-contactos" });
    await b.commit();
  }
  return out;
}
