// Listas automáticas del CRM (Email Marketing › Listas): "CRM · Todos los contactos", una
// por cada tipo de cliente ("CRM · RGPD", …) y "CRM · Empresas" (email de cada empresa),
// listas para usarlas en campañas.
// Se sincronizan al abrir Listas (como mucho cada 10 min, o al pulsar "Actualizar"):
// - altas: contactos con email válido que deberían estar y no están;
// - bajas: suscriptores que vinieron del CRM (source "crm") y ya no corresponden;
// - nunca se toca a quien se dio de baja o rebotó (su estado se respeta).
// Las listas son del usuario (userId), como el resto de listas de Email Marketing.
import { useCallback, useEffect, useState } from "react";
import { collection, doc, getDocs, query, where, writeBatch, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../../../config/firebaseConfig";
import { usePerms } from "../../crm/lib/permissions";
import { useClientTypes } from "../../crm/lib/clientTypes";
import { useOrg } from "../../crm/lib/useOrg";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const EVERY_MS = 10 * 60e3;
const KEY = "islassem_crm_lists_sync";

async function commit(ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const b = writeBatch(db);
    ops.slice(i, i + 400).forEach((op) => op(b));
    await b.commit();
  }
}

export default function useCrmListsSync() {
  const { orgId } = useOrg();
  const perms = usePerms();
  const { types } = useClientTypes();
  const [state, setState] = useState({ busy: false, last: null, error: "" });

  const sync = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !orgId || !perms.ready) return;
    setState((s) => ({ ...s, busy: true, error: "" }));
    try {
      const load = async (col) => perms.visible(col, (await getDocs(query(collection(db, col), where("orgId", "==", orgId)))).docs.map((d) => ({ id: d.id, ...d.data() })))
        .map((c) => ({ ...c, email: String(c.email || "").trim().toLowerCase() }))
        .filter((c) => EMAIL_RE.test(c.email));
      const contacts = await load("contacts");
      const companies = await load("companies");
      const wanted = [{ key: "all", name: "CRM · Todos los contactos", pool: contacts, match: () => true }]
        .concat(types.map((t) => ({ key: `type:${t.id}`, name: `CRM · ${t.label}`, pool: contacts, match: (c) => c.clientType === t.id })))
        .concat([{ key: "companies", name: "CRM · Empresas", pool: companies, match: () => true }]);

      const mine = (await getDocs(query(collection(db, "lists"), where("userId", "==", uid)))).docs;
      const crmLists = new Map(mine.filter((d) => d.data().crm).map((d) => [d.data().crmKey, d]));
      const sender = mine.map((d) => d.data().senderEmail).find(Boolean) || auth.currentUser.email || "";

      for (const w of wanted) {
        let ref = crmLists.get(w.key)?.ref;
        const ops = [];
        if (!ref) {
          ref = doc(collection(db, "lists"));
          ops.push((b) => b.set(ref, { name: w.name, crm: true, crmKey: w.key, userId: uid, senderEmail: sender, language: "es", subscribersCount: 0, createdAt: new Date() }));
        } else if (crmLists.get(w.key).data().name !== w.name) {
          ops.push((b) => b.update(ref, { name: w.name }));
        }
        const subs = crmLists.has(w.key)
          ? (await getDocs(query(collection(db, "subscribers"), where("listId", "==", ref.id), where("userId", "==", uid)))).docs
          : [];
        const have = new Map(subs.map((s) => [String(s.data().email || "").toLowerCase(), s]));
        const should = new Map(w.pool.filter(w.match).map((c) => [c.email, c]));
        let count = subs.length;
        for (const [email, c] of should) {
          if (have.has(email)) continue;
          const name = (w.key === "companies" ? c.name : `${c.firstName || ""} ${c.lastName || ""}`).trim();
          ops.push((b) => b.set(doc(collection(db, "subscribers")), {
            email, ...(name ? { name } : {}), listId: ref.id, userId: uid, status: "subscribed", source: "crm", ...(w.key === "companies" ? { companyId: c.id } : { contactId: c.id }), createdAt: new Date(),
          }));
          count++;
        }
        for (const [email, s] of have) {
          if (should.has(email) || s.data().source !== "crm" || s.data().status !== "subscribed") continue;
          ops.push((b) => b.delete(s.ref));
          count--;
        }
        if (ops.length) ops.push((b) => b.update(ref, { subscribersCount: count, crmSyncedAt: serverTimestamp() }));
        await commit(ops);
      }
      // Tipos que ya no existen: su lista automática se conserva pero se marca.
      for (const [key, d] of crmLists) {
        if (!wanted.some((w) => w.key === key) && !/\(tipo eliminado\)$/.test(d.data().name)) {
          await commit([(b) => b.update(d.ref, { name: `${d.data().name} (tipo eliminado)` })]);
        }
      }
      try { localStorage.setItem(KEY, String(Date.now())); } catch { /* sin almacenamiento */ }
      setState({ busy: false, last: Date.now(), error: "" });
    } catch (e) {
      setState({ busy: false, last: null, error: e.message });
    }
  }, [orgId, perms, types]);

  useEffect(() => {
    if (!perms.ready || !types.length) return;
    let last = 0;
    try { last = Number(localStorage.getItem(KEY)) || 0; } catch { /* sin almacenamiento */ }
    if (Date.now() - last > EVERY_MS) { const t = setTimeout(sync, 0); return () => clearTimeout(t); }
  }, [perms.ready, types.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return { ...state, sync };
}
