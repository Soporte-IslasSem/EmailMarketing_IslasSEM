import { useMemo, useState } from "react";
import { useCrmCollection, crmRestore, fmtDate } from "../lib/crm";
import { deleteDoc, doc } from "firebase/firestore";
import { db } from "../../../config/firebaseConfig";
import "../crm.styles.css";

const LABEL = {
  contacts: "Contacto", companies: "Compañía", leads: "Prospecto", deals: "Negociación",
  products: "Producto", quotes: "Cotización", invoices: "Factura", employees: "Empleado",
  departments: "Departamento", salesteams: "Equipo", roles: "Rol", pipelines: "Embudo",
  crmForms: "Formulario",
};

export default function RecycleBin() {
  const { items, loading } = useCrmCollection("recyclebin");
  const [term, setTerm] = useState("");
  const [busy, setBusy] = useState("");

  const rows = useMemo(() => {
    const t = term.trim().toLowerCase();
    return items
      .filter((r) => !t || [r.label, LABEL[r.collection], r.deletedBy].some((v) => String(v || "").toLowerCase().includes(t)))
      .sort((a, b) => (b.deletedAt?.seconds || 0) - (a.deletedAt?.seconds || 0));
  }, [items, term]);

  const restore = async (r) => {
    setBusy(r.id);
    try { await crmRestore(r); } finally { setBusy(""); }
  };
  const purge = async (r) => {
    if (!window.confirm(`¿Eliminar "${r.label}" definitivamente? No se podrá recuperar.`)) return;
    await deleteDoc(doc(db, "recyclebin", r.id));
  };

  return (
    <div className="crm">
      <div className="crm__top">
        <div>
          <h1>Papelera de reciclaje</h1>
          <p>Todo lo eliminado del CRM queda aquí y se puede restaurar tal como estaba.</p>
        </div>
      </div>
      <input className="crm-search" placeholder="Buscar en la papelera…" value={term} onChange={(e) => setTerm(e.target.value)} />
      {loading ? (
        <div className="crm-loading">Cargando…</div>
      ) : (
        <table className="crm-table">
          <thead>
            <tr><th>Elemento</th><th>Tipo</th><th>Eliminado por</th><th>Fecha</th><th></th></tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((r) => (
              <tr key={r.id}>
                <td style={{ fontWeight: 600 }}>{r.label}</td>
                <td><span className="crm-chip">{LABEL[r.collection] || r.collection}</span></td>
                <td>{r.deletedBy || "—"}</td>
                <td>{fmtDate(r.deletedAt)}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <button className="crm-btn sm" disabled={busy === r.id} onClick={() => restore(r)}>{busy === r.id ? "Restaurando…" : "Restaurar"}</button>{" "}
                  <button className="crm-btn ghost sm" onClick={() => purge(r)}>Eliminar definitivamente</button>
                </td>
              </tr>
            )) : (
              <tr><td colSpan="5" className="crm-empty">La papelera está vacía.</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
