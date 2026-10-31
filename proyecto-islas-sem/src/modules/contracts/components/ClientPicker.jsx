import { useMemo, useState } from "react";
import CrmModal from "../../crm/components/CrmModal";
import { useCrmCollection } from "../../crm/lib/crm";
import { usePerms } from "../../crm/lib/permissions";

// Elegir a quién se envía: el cliente (buscador) y, si se quiere, una de sus negociaciones abiertas
// (así, al firmar, queda en esa negociación).
export default function ClientPicker({ onClose, onPick, title = "Enviar contrato · elegir cliente" }) {
  const perms = usePerms();
  const { items: allContacts, loading } = useCrmCollection("contacts");
  const { items: deals } = useCrmCollection("deals");
  const contacts = useMemo(() => perms.visible("contacts", allContacts), [perms, allContacts]);
  const [term, setTerm] = useState("");
  const [contact, setContact] = useState(null);
  const [dealId, setDealId] = useState("");
  const name = (c) => `${c.firstName || ""} ${c.lastName || ""}`.trim();
  const found = useMemo(() => {
    const t = term.trim().toLowerCase();
    if (!t) return [];
    return contacts.filter((c) => [name(c), c.email, c.company, c.clientId, c.dni].filter(Boolean).some((v) => String(v).toLowerCase().includes(t))).slice(0, 30);
  }, [contacts, term]);
  const open = contact ? deals.filter((d) => d.contactId === contact.id && d.status !== "ganado" && d.status !== "perdido") : [];
  return (
    <CrmModal title={title} onClose={onClose} maxWidth={620}
      footer={<><button className="crm-btn ghost" onClick={contact ? () => setContact(null) : onClose}>{contact ? "← Otro cliente" : "Cancelar"}</button>
        {contact && <button className="crm-btn" onClick={() => onPick({ contactId: contact.id, dealId })}>Continuar →</button>}</>}>
      {!contact ? (
        <>
          <input autoFocus className="crm-search" style={{ margin: "0 0 10px", width: "100%", maxWidth: "none" }} placeholder="Busca por nombre, email, empresa, ID o DNI…" value={term} onChange={(e) => setTerm(e.target.value)} />
          {loading ? <p>Cargando clientes…</p> : !term.trim() ? <p style={{ color: "var(--crm-muted)", fontSize: 13 }}>Escribe para buscar el cliente.</p> : found.length ? found.map((c) => (
            <div key={c.id} onClick={() => { setContact(c); setDealId(""); }} style={{ padding: "8px 6px", borderBottom: "1px solid var(--crm-line,#eef3f3)", cursor: "pointer" }}>
              <b>{name(c) || "(sin nombre)"}</b> <span style={{ color: "var(--crm-muted)", fontSize: 12.5 }}>{c.clientId || ""}</span>
              <div style={{ fontSize: 12.5, color: c.email ? "var(--crm-muted)" : "#b0304c" }}>{c.email || "Sin email: no se le puede enviar"}{c.company ? ` · ${c.company}` : ""}</div>
            </div>
          )) : <p style={{ color: "var(--crm-muted)", fontSize: 13 }}>Ningún cliente coincide.</p>}
        </>
      ) : (
        <>
          <p style={{ margin: "0 0 10px" }}><b>{name(contact) || "(sin nombre)"}</b> · {contact.email || <span style={{ color: "#b0304c" }}>sin email (añádelo en su ficha antes de enviar)</span>}</p>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>¿Va ligado a una negociación?</div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0", cursor: "pointer" }}>
            <input type="radio" style={{ width: "auto" }} checked={!dealId} onChange={() => setDealId("")} /> No, solo al cliente
          </label>
          {open.map((d) => (
            <label key={d.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0", cursor: "pointer" }}>
              <input type="radio" style={{ width: "auto" }} checked={dealId === d.id} onChange={() => setDealId(d.id)} /> {d.title}
            </label>
          ))}
          {!open.length && <p style={{ fontSize: 12.5, color: "var(--crm-muted)", margin: "4px 0 0" }}>Este cliente no tiene negociaciones abiertas.</p>}
        </>
      )}
    </CrmModal>
  );
}
