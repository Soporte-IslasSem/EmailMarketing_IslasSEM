import { useMemo, useState } from "react";
import CrmModal from "../components/CrmModal";
import { useCrmCollection, crmCreate, crmUpdate, crmRemove, money, fmtDate } from "../lib/crm";
import { downloadDocPDF, openDocPDF } from "../lib/pdf";
import "../crm.styles.css";

// Componente reutilizable para Cotizaciones y Facturas (mismo patrón, distinto tipo).
const CONFIG = {
  quotes: {
    title: "Cotizaciones",
    subtitle: "Presupuestos enviados a clientes (aunque vengan por teléfono o reunión).",
    prefix: "CT",
    statuses: ["Borrador", "Enviada", "Aceptada", "Rechazada"],
    numberLabel: "Nº cotización",
    newLabel: "Nueva cotización",
  },
  invoices: {
    title: "Facturas",
    subtitle: "Facturas emitidas y su estado de cobro.",
    prefix: "FT",
    statuses: ["Pendiente", "Pagada", "Vencida", "Anulada"],
    numberLabel: "Nº factura",
    newLabel: "Nueva factura",
  },
};

const statusClass = (s) =>
  ["Aceptada", "Pagada"].includes(s) ? "ok" : ["Rechazada", "Vencida", "Anulada"].includes(s) ? "bad" : ["Enviada", "Pendiente"].includes(s) ? "info" : "warn";

export default function SalesDocs({ type }) {
  const cfg = CONFIG[type];
  const { items, loading, orgId } = useCrmCollection(type);
  const { items: contacts } = useCrmCollection("contacts");
  const [term, setTerm] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ number: "", client: "", concept: "", amount: 0, status: cfg.statuses[0] });

  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    const rows = [...items].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    if (!t) return rows;
    return rows.filter((q) => [q.number, q.client, q.concept, q.status].filter(Boolean).some((v) => String(v).toLowerCase().includes(t)));
  }, [items, term]);

  const openNew = () => {
    setForm({ number: `${cfg.prefix}-${1000 + items.length + 1}`, client: "", concept: "", amount: 0, status: cfg.statuses[0] });
    setShowNew(true);
  };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.client.trim() && !form.concept.trim()) return;
    setSaving(true);
    try {
      await crmCreate(type, orgId, { ...form, amount: Number(form.amount) || 0 });
      setShowNew(false);
    } catch (e) {
      alert("No se pudo guardar: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const total = filtered.reduce((a, q) => a + (Number(q.amount) || 0), 0);

  return (
    <div className="crm">
      <div className="crm__top">
        <div>
          <h1>{cfg.title}</h1>
          <p>{cfg.subtitle} · Total: {money(total)}</p>
        </div>
        <button className="crm-btn" onClick={openNew}>+ {cfg.newLabel}</button>
      </div>

      <input className="crm-search" placeholder={`Buscar ${cfg.title.toLowerCase()}…`} value={term} onChange={(e) => setTerm(e.target.value)} />

      {loading ? (
        <div className="crm-loading">Cargando…</div>
      ) : (
        <table className="crm-table">
          <thead>
            <tr><th>{cfg.numberLabel}</th><th>Cliente</th><th>Concepto</th><th>Importe</th><th>Estado</th><th>Fecha</th><th></th></tr>
          </thead>
          <tbody>
            {filtered.length ? (
              filtered.map((q) => (
                <tr key={q.id}>
                  <td><b>{q.number}</b></td>
                  <td>{q.client || "—"}</td>
                  <td>{q.concept || "—"}</td>
                  <td>{money(q.amount)}</td>
                  <td>
                    <select className="crm-chip" value={q.status} onChange={(e) => crmUpdate(type, q.id, { status: e.target.value })} style={{ border: "none", cursor: "pointer" }}>
                      {cfg.statuses.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td>{fmtDate(q.createdAt)}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <button className="crm-btn ghost sm" onClick={() => openDocPDF(q, { isInvoice: type === "invoices" })} title="Previsualizar PDF">👁</button>{" "}
                    <button className="crm-btn sm" onClick={() => downloadDocPDF(q, { isInvoice: type === "invoices" })} title="Descargar PDF">📄</button>{" "}
                    <button className="crm-btn ghost sm" onClick={() => window.confirm("¿Eliminar?") && crmRemove(type, q.id)}>Eliminar</button>
                  </td>
                </tr>
              ))
            ) : (
              <tr><td colSpan="7" className="crm-empty">Aún no hay {cfg.title.toLowerCase()}.</td></tr>
            )}
          </tbody>
        </table>
      )}

      {showNew && (
        <CrmModal
          title={cfg.newLabel}
          onClose={() => setShowNew(false)}
          footer={
            <>
              <button className="crm-btn ghost" onClick={() => setShowNew(false)}>Cancelar</button>
              <button className="crm-btn" onClick={save} disabled={saving}>{saving ? "Guardando…" : "Crear"}</button>
            </>
          }
        >
          <div className="crm-two">
            <div className="crm-field"><label>{cfg.numberLabel}</label><input value={form.number} onChange={set("number")} /></div>
            <div className="crm-field"><label>Estado</label><select value={form.status} onChange={set("status")}>{cfg.statuses.map((s) => <option key={s}>{s}</option>)}</select></div>
          </div>
          <div className="crm-field"><label>Cliente</label>
            <input value={form.client} onChange={set("client")} list="crm-dl-clients" placeholder="Nombre del cliente" />
            <datalist id="crm-dl-clients">{contacts.map((c) => <option key={c.id} value={`${c.firstName || ""} ${c.lastName || ""}`.trim()} />)}</datalist>
          </div>
          <div className="crm-field"><label>Concepto</label><input value={form.concept} onChange={set("concept")} placeholder="Ej. SEO + SEM anual" /></div>
          <div className="crm-field"><label>Importe (€)</label><input type="number" value={form.amount} onChange={set("amount")} /></div>
        </CrmModal>
      )}
    </div>
  );
}
