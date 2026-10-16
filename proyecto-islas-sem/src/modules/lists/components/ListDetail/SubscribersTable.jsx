// Suscriptores de una lista: búsqueda, selección y eliminación (uno o varios).
// - En las listas de un tipo de cliente, quitar a alguien le quita ese tipo en el CRM.
// - En las otras listas automáticas del CRM, quitar a alguien lo apunta en list.excludedEmails
//   para que la sincronización no lo vuelva a añadir.
// - En la lista "Bajas" se ve de qué lista venía cada uno y cuándo se dio de baja; quitarlo
//   de aquí hace que vuelva a poder recibir campañas.
// - El nombre se puede poner o corregir con un clic. Si ese email es un contacto del CRM, se
//   cambia en su ficha (y de ahí en todas sus listas); si no, en todas las listas donde esté.
import { useEffect, useMemo, useRef, useState } from "react";
import { collection, query, where, onSnapshot, doc, getDoc, getDocs, writeBatch, updateDoc, increment, arrayUnion, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../../../../config/firebaseConfig";
import { isTypeList, removeFromTypeList, normEmail } from "../../lib/crmLink";
import { useOrg } from "../../../crm/lib/useOrg";
import "./SubscribersTable.styles.css";

const STATUS_LABEL = {
  subscribed: "Suscrito",
  unsubscribed: "Dado de baja",
  bounced: "Rebotado",
  invalid: "No válido",
  pending: "Pendiente de confirmar",
};
const PAGE = 20;
const fmt = (v) => {
  const d = v?.toDate ? v.toDate() : typeof v === "number" ? new Date(v) : null;
  return d ? d.toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }) : "";
};

export default function SubscribersTable({ listId }) {
  const [subscribers, setSubscribers] = useState([]);
  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [term, setTerm] = useState("");
  const [sel, setSel] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null); // { id, value } del nombre que se está escribiendo
  const { orgId } = useOrg();
  const cancelEdit = useRef(false); // Esc: no guardar al perder el foco

  useEffect(() => {
    getDoc(doc(db, "lists", listId)).then((s) => setList(s.exists() ? { id: s.id, ...s.data() } : null)).catch(() => {});
    const q = query(collection(db, "subscribers"), where("listId", "==", listId), where("userId", "==", auth.currentUser.uid));
    return onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (b.unsubscribedAt || b.createdAt?.toMillis?.() || 0) - (a.unsubscribedAt || a.createdAt?.toMillis?.() || 0));
      setSubscribers(data);
      setLoading(false);
    });
  }, [listId]);

  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    return t ? subscribers.filter((s) => [s.email, s.name, s.fromListName].some((v) => String(v || "").toLowerCase().includes(t))) : subscribers;
  }, [subscribers, term]);

  if (loading) return <p className="loading-msg">Cargando suscriptores...</p>;
  if (!subscribers.length) return <div className="empty-state"><p>No hay suscriptores en esta lista todavía.</p></div>;

  const isBajas = !!list?.bajas;
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const current = Math.min(page, pages);
  const items = filtered.slice((current - 1) * PAGE, current * PAGE);
  const allPage = items.length > 0 && items.every((s) => sel.has(s.id));
  const toggle = (id) => setSel((x) => { const n = new Set(x); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const togglePage = () => setSel((x) => { const n = new Set(x); items.forEach((s) => (allPage ? n.delete(s.id) : n.add(s.id))); return n; });

  // Nombre: en la ficha del CRM si el email es un contacto (la sincronización lo pasa a sus
  // listas del CRM) y, además, en todas las suscripciones de ese email en sus listas.
  const saveName = async (s, raw) => {
    setEditing(null);
    const name = String(raw || "").trim().replace(/\s+/g, " ");
    if (name === (s.name || "")) return;
    const email = normEmail(s.email);
    const uid = auth.currentUser.uid;
    try {
      let contactRef = null;
      if (s.contactId) {
        const c = await getDoc(doc(db, "contacts", s.contactId)).catch(() => null);
        if (c?.exists()) contactRef = c.ref;
      }
      if (!contactRef && orgId && email) {
        const found = await getDocs(query(collection(db, "contacts"), where("orgId", "==", orgId), where("email", "==", email))).catch(() => null);
        contactRef = found?.docs[0]?.ref || null;
      }
      if (contactRef) {
        const [firstName, ...rest] = name.split(" ");
        await updateDoc(contactRef, { firstName: firstName || "", lastName: rest.join(" "), updatedAt: serverTimestamp() });
      }
      const subs = email ? (await getDocs(query(collection(db, "subscribers"), where("userId", "==", uid), where("email", "==", email)))).docs : [];
      const b = writeBatch(db);
      const refs = new Map(subs.map((d) => [d.id, d.ref]));
      refs.set(s.id, doc(db, "subscribers", s.id));
      refs.forEach((ref) => b.update(ref, { name }));
      await b.commit();
    } catch (e) {
      alert(e.code === "permission-denied" ? "Tu rol no permite cambiar el nombre de este contacto." : "No se pudo guardar el nombre: " + e.message);
    }
  };

  const remove = async (ids) => {
    const victims = subscribers.filter((s) => ids.includes(s.id));
    if (!victims.length) return;
    const msg = isBajas
      ? `¿Quitar ${victims.length} de la lista de bajas? Volverán a poder recibir campañas si están en alguna lista.`
      : isTypeList(list)
        ? `¿Quitar ${victims.length} de "${list.name}"?\n\nEsta lista es un tipo de cliente del CRM: a esos contactos se les quita el tipo "${list.name}" (el contacto no se borra).`
        : `¿Eliminar ${victims.length} suscriptor(es) de "${list?.name || "esta lista"}"?${list?.crm ? "\n\nEs una lista automática del CRM: no se volverán a añadir solos." : ""}`;
    if (!window.confirm(msg)) return;
    setBusy(true);
    try {
      if (isTypeList(list)) {
        await removeFromTypeList({ ...list, id: listId }, victims);
        setSel(new Set());
        return;
      }
      for (let i = 0; i < victims.length; i += 400) {
        const b = writeBatch(db);
        victims.slice(i, i + 400).forEach((s) => b.delete(doc(db, "subscribers", s.id)));
        await b.commit();
      }
      await updateDoc(doc(db, "lists", listId), {
        subscribersCount: increment(-victims.length),
        ...(list?.crm ? { excludedEmails: arrayUnion(...victims.map((s) => String(s.email).toLowerCase())) } : {}),
      });
      setSel(new Set());
    } catch (e) {
      alert("No se pudo eliminar: " + e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="SubscribersTable">
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        <input
          placeholder="Buscar por email o nombre…" value={term} onChange={(e) => { setTerm(e.target.value); setPage(1); }}
          style={{ flex: 1, minWidth: 220, border: "1px solid #dfe7e7", borderRadius: 8, padding: "8px 10px", fontSize: 13.5 }}
        />
        <span style={{ fontSize: 13, color: "#6b7d7d" }}>{filtered.length} de {subscribers.length}</span>
        {sel.size > 0 && (
          <>
            {sel.size < filtered.length && <button className="Pagination__btn" onClick={() => setSel(new Set(filtered.map((s) => s.id)))}>Seleccionar los {filtered.length}</button>}
            <button className="Pagination__btn" style={{ color: "#b0304c", borderColor: "#f0c9d2" }} disabled={busy} onClick={() => remove([...sel])}>
              🗑 {isBajas ? "Quitar de bajas" : "Eliminar"} ({sel.size})
            </button>
            <button className="Pagination__btn" onClick={() => setSel(new Set())}>Quitar selección</button>
          </>
        )}
      </div>

      <table>
        <thead>
          <tr>
            <th style={{ width: 30 }}><input type="checkbox" checked={allPage} onChange={togglePage} title="Seleccionar esta página" /></th>
            <th>Email</th>
            <th>Nombre</th>
            <th>Estado</th>
            {isBajas && <th>Venía de</th>}
            <th>{isBajas ? "Fecha de baja" : "Fecha alta"}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((s) => (
            <tr key={s.id} style={sel.has(s.id) ? { background: "#f1f9f8" } : undefined}>
              <td><input type="checkbox" checked={sel.has(s.id)} onChange={() => toggle(s.id)} /></td>
              <td>{s.email}</td>
              <td>
                {editing?.id === s.id ? (
                  <input
                    autoFocus value={editing.value} placeholder="Nombre y apellidos"
                    onChange={(e) => setEditing({ id: s.id, value: e.target.value })}
                    onBlur={() => { if (cancelEdit.current) { cancelEdit.current = false; return; } saveName(s, editing.value); }}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { cancelEdit.current = true; setEditing(null); } }}
                    style={{ width: "100%", minWidth: 140, border: "1px solid #bcd6d4", borderRadius: 6, padding: "4px 7px", fontSize: 13.5 }}
                  />
                ) : (
                  <button type="button" className="SubscribersTable__name" onClick={() => { cancelEdit.current = false; setEditing({ id: s.id, value: s.name || "" }); }} title="Poner o cambiar el nombre (se guarda también en el CRM)">
                    {s.name || <span className="SubscribersTable__noname">+ Añadir nombre</span>} <span className="SubscribersTable__pen">✎</span>
                  </button>
                )}
              </td>
              <td>{STATUS_LABEL[s.status] || s.status}</td>
              {isBajas && <td>{s.fromListName || "—"}</td>}
              <td>{fmt(isBajas ? s.unsubscribedAt : s.createdAt)}</td>
              <td style={{ textAlign: "right" }}>
                <button className="Pagination__btn" disabled={busy} title={isBajas ? "Quitar de bajas" : "Eliminar de la lista"} onClick={() => remove([s.id])}>🗑</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="Pagination bottom">
        <button className="Pagination__btn" disabled={current === 1} onClick={() => setPage(current - 1)}>Anterior</button>
        <span className="Pagination__info">Página {current} de {pages}</span>
        <button className="Pagination__btn" disabled={current === pages} onClick={() => setPage(current + 1)}>Siguiente</button>
      </div>
    </div>
  );
}
