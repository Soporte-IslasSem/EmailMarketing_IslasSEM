// Contratos de un cliente o de una negociación: estado, PDF firmados y "Enviar contrato a firmar".
import { useCallback, useEffect, useState } from "react";
import SendContractModal from "./SendContractModal";
import { contractsApi, STATUS, statusOf, fmtDate, fmtDay, openContractFile, darDeBaja } from "../lib/api";

export default function ContractsPanel({ contactId, dealId, canSend = true }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);

  const load = useCallback(() => {
    const q = dealId ? `dealId=${encodeURIComponent(dealId)}` : `contactId=${encodeURIComponent(contactId || "")}`;
    contractsApi(`list?${q}`).then((r) => { setItems(r.contracts); setError(""); }).catch((e) => { setItems([]); setError(e.message); });
  }, [contactId, dealId]);
  useEffect(() => { load(); }, [load]);

  const cancel = async (c) => {
    if (!window.confirm(`¿Anular "${c.title}"? El enlace de firma dejará de funcionar.`)) return;
    try { await contractsApi("cancel", { id: c.id }); load(); } catch (e) { alert(e.message); }
  };

  return (
    <div className="crm-panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h4 style={{ margin: 0 }}>✍️ Contratos {items?.length ? `(${items.length})` : ""}</h4>
        {canSend && <button className="crm-btn sm" onClick={() => setShow(true)}>Enviar contrato a firmar</button>}
      </div>
      {error && <p style={{ color: "#b0304c", fontSize: 13 }}>{error}</p>}
      {items === null ? <p style={{ fontSize: 13, color: "var(--crm-muted)" }}>Cargando…</p> : items.length ? items.map((c) => (
        <div key={c.id} style={{ borderTop: "1px solid var(--crm-line,#eef3f3)", padding: "8px 0", fontSize: 13.5 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <b>{c.title}</b>
            <span className={`crm-chip ${STATUS[statusOf(c)]?.cls || ""}`}>{STATUS[statusOf(c)]?.label || c.status}</span>
          </div>
          <div style={{ color: "var(--crm-muted)", fontSize: 12.5 }}>
            Enviado {fmtDate(c.createdAt)}{c.sentBy ? ` por ${c.sentBy}` : c.fromRule ? " automáticamente" : ""}{c.viewedAt ? ` · recibido ${fmtDate(c.viewedAt)}` : ""}{c.completedAt ? ` · firmado ${fmtDate(c.completedAt)}` : ""} · ID {c.code}
            {c.baja && <div>De baja {fmtDate(c.baja.at)} por {c.baja.by}: {c.baja.reason} · se conserva hasta {fmtDay(c.baja.retainUntil)}</div>}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
            {c.docs.map((d) => (d.signed
              ? <span key={d.i} className="crm-link" onClick={() => openContractFile(c.id, d.i)}>📄 {d.name} (firmado)</span>
              : <span key={d.i} style={{ color: "var(--crm-muted)" }}>📄 {d.name}</span>))}
            {c.status !== "completed" && c.status !== "cancelled" && !c.baja && <span className="crm-link" style={{ color: "#b0304c" }} onClick={() => cancel(c)}>Anular</span>}
            {!c.baja && <span className="crm-link" style={{ color: "#b0304c" }} onClick={async () => (await darDeBaja(c)) && load()}>Dar de baja</span>}
          </div>
        </div>
      )) : <p style={{ fontSize: 13, color: "var(--crm-muted)", margin: "8px 0 0" }}>Sin contratos todavía.</p>}
      {show && <SendContractModal contactId={contactId} dealId={dealId} onClose={() => setShow(false)} onSent={load} />}
    </div>
  );
}
