import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import CrmModal from "../components/CrmModal";
import { useCrmCollection, crmCreate, crmUpdate, crmRemove, money, fmtDate } from "../lib/crm";
import { usePerms } from "../lib/permissions";
import { downloadDocPDF, openDocPDF } from "../lib/pdf";
import { uploadInvoicePdf, openInvoicePdf, sendInvoice } from "../lib/invoicesApi";
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
    subtitle: "Facturas emitidas: el PDF, a qué cliente pertenecen y su estado de cobro.",
    prefix: "FT",
    statuses: ["Pendiente", "Pagada", "Vencida", "Anulada"],
    numberLabel: "Nº factura",
    newLabel: "Nueva factura",
  },
};

const statusClass = (s) =>
  ["Aceptada", "Pagada"].includes(s) ? "ok" : ["Rechazada", "Vencida", "Anulada"].includes(s) ? "bad" : ["Enviada", "Pendiente"].includes(s) ? "info" : "warn";
const personName = (c) => `${c.firstName || ""} ${c.lastName || ""}`.trim() || c.email || "Cliente";

// Buscador de cliente: la factura queda ligada a la ficha (contactId), no solo a un nombre escrito.
function ClientField({ contacts, value, onChange }) {
  const [term, setTerm] = useState("");
  const chosen = value ? contacts.find((c) => c.id === value) : null;
  const found = useMemo(() => {
    const t = term.trim().toLowerCase();
    if (!t) return [];
    return contacts.filter((c) => [personName(c), c.email, c.company, c.clientId, c.dni].filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(t))).slice(0, 8);
  }, [contacts, term]);
  if (chosen) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", border: "1px solid var(--crm-line,#e3eaea)", borderRadius: 8 }}>
        <div style={{ flex: 1 }}>
          <b>{personName(chosen)}</b>{chosen.company ? ` · ${chosen.company}` : ""}
          <div style={{ fontSize: 12, color: "var(--crm-muted)" }}>{chosen.email || "sin email"}{chosen.clientId ? ` · ${chosen.clientId}` : ""}</div>
        </div>
        <button type="button" className="crm-btn ghost sm" onClick={() => { onChange(null); setTerm(""); }}>Cambiar</button>
      </div>
    );
  }
  return (
    <div>
      <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Busca el cliente por nombre, email, empresa, ID o DNI…" />
      {found.length > 0 && (
        <div style={{ border: "1px solid var(--crm-line,#e3eaea)", borderRadius: 8, marginTop: 4, maxHeight: 220, overflowY: "auto" }}>
          {found.map((c) => (
            <div key={c.id} onClick={() => onChange(c)} style={{ padding: "7px 10px", cursor: "pointer", borderBottom: "1px solid var(--crm-line,#eef3f3)" }}>
              <b>{personName(c)}</b>{c.company ? ` · ${c.company}` : ""} <span style={{ fontSize: 12, color: "var(--crm-muted)" }}>{c.email}</span>
            </div>
          ))}
        </div>
      )}
      {term.trim() && !found.length && <p style={{ fontSize: 12, color: "var(--crm-muted)", margin: "4px 0 0" }}>No hay ningún contacto con ese dato. Créalo antes en Contactos.</p>}
    </div>
  );
}

export default function SalesDocs({ type }) {
  const cfg = CONFIG[type];
  const isInvoice = type === "invoices";
  const navigate = useNavigate();
  const { items: all, loading, orgId } = useCrmCollection(type);
  const perms = usePerms();
  const items = useMemo(() => perms.visible(type, all), [perms, all, type]);
  const { items: contacts } = useCrmCollection("contacts");
  const [term, setTerm] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(null);
  const [pdfFile, setPdfFile] = useState(null);
  const [sending, setSending] = useState(null); // factura que se va a enviar
  const [busyId, setBusyId] = useState("");
  const pdfInput = useRef(null);
  const rowPdfFor = useRef(null);

  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    const rows = [...items].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    if (!t) return rows;
    return rows.filter((q) => [q.number, q.client, q.clientEmail, q.concept, q.status].filter(Boolean).some((v) => String(v).toLowerCase().includes(t)));
  }, [items, term]);

  const openNew = () => {
    setForm({ number: `${cfg.prefix}-${1000 + items.length + 1}`, contact: null, concept: "", amount: 0, status: cfg.statuses[0] });
    setPdfFile(null);
    setError("");
    setShowNew(true);
  };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setError("");
    if (isInvoice && !form.contact) return setError("Elige el cliente de la factura.");
    if (isInvoice && !pdfFile) return setError("Sube el PDF de la factura.");
    if (!form.contact && !form.concept.trim()) return setError("Elige el cliente o escribe el concepto.");
    setSaving(true);
    try {
      const pdf = isInvoice ? await uploadInvoicePdf(pdfFile) : null;
      const c = form.contact || {};
      await crmCreate(type, orgId, {
        number: form.number, status: form.status, concept: form.concept, amount: Number(form.amount) || 0,
        client: form.contact ? personName(c) : "", clientEmail: c.email || "", contactId: c.id || "", company: c.company || "", companyId: c.companyId || "",
        ...(pdf ? { pdf } : {}),
      });
      setShowNew(false);
    } catch (e) {
      setError("No se pudo guardar: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  // Subir (o cambiar) el PDF de una factura ya creada.
  const attachPdf = async (file) => {
    const q = rowPdfFor.current;
    rowPdfFor.current = null;
    if (!file || !q) return;
    setBusyId(q.id);
    try {
      const pdf = await uploadInvoicePdf(file);
      await crmUpdate(type, q.id, { pdf });
    } catch (e) {
      alert(e.message);
    } finally {
      setBusyId("");
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
        {perms.can(type, "add") && <button className="crm-btn" onClick={openNew}>+ {cfg.newLabel}</button>}
      </div>

      <input className="crm-search" placeholder={`Buscar ${cfg.title.toLowerCase()}…`} value={term} onChange={(e) => setTerm(e.target.value)} />
      <input ref={pdfInput} type="file" accept="application/pdf,.pdf" style={{ display: "none" }} onChange={(e) => { attachPdf(e.target.files?.[0]); e.target.value = ""; }} />

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
                  <td>
                    {q.contactId
                      ? <span className="crm-link" onClick={() => navigate(`/dashboard/crm/contacts/${q.contactId}`)}>{q.client || "Ver cliente"}</span>
                      : <>{q.client || "—"}{isInvoice && <div style={{ fontSize: 12, color: "#b26b00" }}>⚠ sin ficha de cliente</div>}</>}
                    {q.clientEmail && <div style={{ fontSize: 12, color: "var(--crm-muted)" }}>{q.clientEmail}</div>}
                  </td>
                  <td>{q.concept || "—"}</td>
                  <td>{money(q.amount)}</td>
                  <td>
                    <select className={`crm-chip ${statusClass(q.status)}`} value={q.status} onChange={(e) => crmUpdate(type, q.id, { status: e.target.value })} style={{ border: "none", cursor: "pointer" }}>
                      {cfg.statuses.map((s) => <option key={s}>{s}</option>)}
                    </select>
                    {q.sentAt && <div style={{ fontSize: 12, color: "var(--crm-muted)", marginTop: 3 }}>✉ Enviada {fmtDate(q.sentAt)}</div>}
                  </td>
                  <td>{fmtDate(q.createdAt)}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {isInvoice && q.pdf ? (
                      <>
                        <button className="crm-btn ghost sm" onClick={() => openInvoicePdf(q.pdf).catch((e) => alert(e.message))} title={q.pdf.name}>📎 Ver PDF</button>{" "}
                        {perms.can(type, "edit", q) && <button className="crm-btn sm" onClick={() => setSending(q)}>✉ Enviar</button>}{" "}
                      </>
                    ) : isInvoice ? (
                      perms.can(type, "edit", q) && <button className="crm-btn ghost sm" disabled={busyId === q.id} onClick={() => { rowPdfFor.current = q; pdfInput.current?.click(); }}>{busyId === q.id ? "Subiendo…" : "⬆ Subir PDF"}</button>
                    ) : (
                      <>
                        <button className="crm-btn ghost sm" onClick={() => openDocPDF(q, { isInvoice })} title="Previsualizar PDF">👁</button>{" "}
                        <button className="crm-btn sm" onClick={() => downloadDocPDF(q, { isInvoice })} title="Descargar PDF">📄</button>
                      </>
                    )}{" "}
                    {perms.can(type, "delete", q) && <button className="crm-btn ghost sm" onClick={() => window.confirm("¿Eliminar?") && crmRemove(type, q.id)}>Eliminar</button>}
                  </td>
                </tr>
              ))
            ) : (
              <tr><td colSpan="7" className="crm-empty">Aún no hay {cfg.title.toLowerCase()}.</td></tr>
            )}
          </tbody>
        </table>
      )}

      {showNew && form && (
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
          {error && <div style={{ background: "#fdeef1", color: "#b0304c", padding: "9px 12px", borderRadius: 8, fontSize: 13, marginBottom: 10 }}>{error}</div>}
          <div className="crm-two">
            <div className="crm-field"><label>{cfg.numberLabel}</label><input value={form.number} onChange={set("number")} /></div>
            <div className="crm-field"><label>Estado</label><select value={form.status} onChange={set("status")}>{cfg.statuses.map((s) => <option key={s}>{s}</option>)}</select></div>
          </div>
          <div className="crm-field"><label>Cliente</label>
            <ClientField contacts={perms.visible("contacts", contacts)} value={form.contact?.id || ""} onChange={(c) => setForm((f) => ({ ...f, contact: c }))} />
          </div>
          {isInvoice && (
            <div className="crm-field"><label>Factura en PDF</label>
              <input type="file" accept="application/pdf,.pdf" onChange={(e) => setPdfFile(e.target.files?.[0] || null)} />
            </div>
          )}
          <div className="crm-field"><label>Concepto</label><input value={form.concept} onChange={set("concept")} placeholder="Ej. SEO + SEM anual" /></div>
          <div className="crm-field"><label>Importe (€)</label><input type="number" value={form.amount} onChange={set("amount")} /></div>
        </CrmModal>
      )}

      {sending && <SendInvoiceModal invoice={sending} contacts={contacts} onClose={() => setSending(null)} />}
    </div>
  );
}

function SendInvoiceModal({ invoice, contacts, onClose }) {
  const c = invoice.contactId ? contacts.find((x) => x.id === invoice.contactId) : null;
  const [to, setTo] = useState(c?.email || invoice.clientEmail || "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const go = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await sendInvoice(invoice.id, { to, message });
      setDone(r.to);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <CrmModal title={`Enviar factura ${invoice.number || ""}`} onClose={onClose}
      footer={done ? <button className="crm-btn" onClick={onClose}>Cerrar</button> : (
        <><button className="crm-btn ghost" onClick={onClose}>Cancelar</button>
          <button className="crm-btn" onClick={go} disabled={busy || !to.trim()}>{busy ? "Enviando…" : "✉ Enviar al cliente"}</button></>
      )}>
      {done ? (
        <p>✅ Factura puesta en la cola de envío para <b>{done}</b>, con el PDF adjunto. La verás en la Bandeja de salida.</p>
      ) : (
        <>
          {error && <div style={{ background: "#fdeef1", color: "#b0304c", padding: "9px 12px", borderRadius: 8, fontSize: 13, marginBottom: 10 }}>{error}</div>}
          <p style={{ marginTop: 0 }}>Se envía por correo con el PDF <b>{invoice.pdf?.name}</b> adjunto{invoice.sentAt ? <> (ya se envió el {fmtDate(invoice.sentAt)} a {invoice.sentTo})</> : null}.</p>
          <div className="crm-field"><label>Para (email del cliente)</label><input value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div className="crm-field"><label>Mensaje <small>(opcional; si lo dejas vacío va uno estándar)</small></label>
            <textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Te enviamos adjunta la factura…" />
          </div>
        </>
      )}
    </CrmModal>
  );
}
