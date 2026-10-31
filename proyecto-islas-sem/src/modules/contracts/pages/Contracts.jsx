// CRM › Ventas › Contratos: todos los contratos, las plantillas (.DOCX con huecos [..] o PDF)
// y los ajustes de firma de ISLAS SEM (empresa, firmante y su firma dibujada).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import CrmModal from "../../crm/components/CrmModal";
import ContractView from "../components/ContractView";
import TemplateFields from "../components/TemplateFields";
import SignaturePad from "../components/SignaturePad";
import SendContractModal from "../components/SendContractModal";
import { useCrmCollection } from "../../crm/lib/crm";
import { usePerms } from "../../crm/lib/permissions";
import { contractsApi, toBase64, STATUS, statusOf, fmtDate, fmtDay, openContractFile, darDeBaja } from "../lib/api";
import { blocksFromDocx, holesOf, holeCounts, guessSource } from "../lib/docx";
import "../../crm/crm.styles.css";
import "../components/contracts.css";

const TABS = [["contracts", "Contratos"], ["templates", "Plantillas"], ["settings", "Ajustes de firma"]];

export default function Contracts() {
  const [tab, setTab] = useState("contracts");
  return (
    <div className="crm">
      <div className="crm__top">
        <div>
          <h1>Contratos</h1>
          <p>Documentos para firmar con firma dibujada y huella de las dos partes.</p>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {TABS.map(([k, l]) => <button key={k} className={`crm-btn ${tab === k ? "" : "ghost"} sm`} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === "contracts" && <AllContracts />}
      {tab === "templates" && <Templates />}
      {tab === "settings" && <Settings />}
    </div>
  );
}

/* ------------------------------------------------------------------ todos los contratos */

function AllContracts() {
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [status, setStatus] = useState("");
  const [term, setTerm] = useState("");
  const [error, setError] = useState("");
  const [picking, setPicking] = useState(false); // elegir cliente para enviar un contrato
  const [sendTo, setSendTo] = useState(null); // { contactId, dealId }
  const load = useCallback(() => contractsApi("list").then((r) => setItems(r.contracts)).catch((e) => { setItems([]); setError(e.message); }), []);
  useEffect(() => { load(); }, [load]);
  // Sin filtro: todos menos los dados de baja (esos se ven eligiendo "De baja").
  const rows = useMemo(() => (items || []).filter((c) => (status ? statusOf(c) === status : !c.baja)
    && (!term || [c.title, c.clientName, c.clientEmail, c.code].join(" ").toLowerCase().includes(term.toLowerCase()))), [items, status, term]);
  return (
    <>
      <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <input className="crm-search" style={{ margin: 0, flex: 1, minWidth: 220 }} placeholder="Buscar por cliente, documento o ID…" value={term} onChange={(e) => setTerm(e.target.value)} />
        <select className="crm-search" style={{ margin: 0, maxWidth: 200 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos los estados</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button className="crm-btn" onClick={() => setPicking(true)}>✍️ Enviar contrato</button>
      </div>
      {picking && <ClientPicker onClose={() => setPicking(false)} onPick={(x) => { setPicking(false); setSendTo(x); }} />}
      {sendTo && <SendContractModal contactId={sendTo.contactId} dealId={sendTo.dealId} onClose={() => setSendTo(null)} onSent={load} />}
      {error && <div className="cf-err">{error}</div>}
      <table className="crm-table">
        <thead><tr><th>Documento</th><th>Cliente</th><th>Estado</th><th>Enviado</th><th>Recibido</th><th>Firmado</th><th>ID</th><th></th></tr></thead>
        <tbody>
          {items === null ? <tr><td colSpan="8" className="crm-empty">Cargando…</td></tr> : rows.length ? rows.map((c) => (
            <tr key={c.id}>
              <td>
                <div style={{ fontWeight: 600 }}>{c.title}</div>
                {c.docs.filter((d) => d.signed).map((d) => <div key={d.i}><span className="crm-link" style={{ fontSize: 12.5 }} onClick={() => openContractFile(c.id, d.i)}>📄 {d.name} (firmado)</span></div>)}
              </td>
              <td>
                {c.contactId ? <span className="crm-link" onClick={() => navigate(`/dashboard/crm/contacts/${c.contactId}`)}>{c.clientName || c.clientEmail}</span> : c.clientName || c.clientEmail}
                <div style={{ fontSize: 12, color: "var(--crm-muted)" }}>{c.clientEmail}</div>
              </td>
              <td>
                <span className={`crm-chip ${STATUS[statusOf(c)]?.cls || ""}`}>{STATUS[statusOf(c)]?.label || c.status}</span>
                {c.baja && (
                  <div style={{ fontSize: 12, color: "var(--crm-muted)", marginTop: 3, maxWidth: 230 }}>
                    {fmtDate(c.baja.at)} · {c.baja.by}<br />Motivo: {c.baja.reason}<br />Estaba: {STATUS[c.status]?.label || c.status}<br />Se conserva hasta {fmtDay(c.baja.retainUntil)}
                  </div>
                )}
              </td>
              <td style={{ whiteSpace: "nowrap" }}>{fmtDate(c.createdAt)}<div style={{ fontSize: 12, color: "var(--crm-muted)" }}>{c.sentBy || (c.fromRule ? "Automático" : "")}</div></td>
              <td style={{ whiteSpace: "nowrap" }}>{fmtDate(c.viewedAt)}</td>
              <td style={{ whiteSpace: "nowrap" }}>{fmtDate(c.completedAt)}</td>
              <td><code>{c.code}</code></td>
              <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                {!c.baja && <button className="crm-btn ghost sm" onClick={async () => (await darDeBaja(c)) && load()}>Dar de baja</button>}
              </td>
            </tr>
          )) : <tr><td colSpan="8" className="crm-empty">{items.length ? (status ? "Ningún contrato con estos filtros." : "No hay contratos activos. Los dados de baja se ven eligiendo «De baja».") : "Aún no se ha enviado ningún contrato. Se envían desde la ficha del cliente, desde una negociación o con una regla de Automatización."}</td></tr>}
        </tbody>
      </table>
    </>
  );
}

// Elegir a quién se envía: el cliente (buscador) y, si se quiere, una de sus negociaciones abiertas
// (así, al firmar, queda en esa negociación).
function ClientPicker({ onClose, onPick }) {
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
    <CrmModal title="Enviar contrato · elegir cliente" onClose={onClose} maxWidth={620}
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

/* ------------------------------------------------------------------ plantillas */

function Templates() {
  const [items, setItems] = useState(null);
  const [edit, setEdit] = useState(null); // plantilla en edición (nueva o existente)
  const [error, setError] = useState("");
  const load = useCallback(() => contractsApi("templates").then((r) => setItems(r.templates)).catch((e) => { setItems([]); setError(e.message); }), []);
  useEffect(() => { load(); }, [load]);
  const archive = async (t) => {
    if (!window.confirm(`¿Quitar la plantilla "${t.name}"? Los contratos ya enviados no cambian. Si alguna regla de Automatización la usa, deja de enviarla.`)) return;
    try { await contractsApi("templates/archive", { id: t.id }); load(); } catch (e) { alert(e.message); }
  };
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 10, flexWrap: "wrap" }}>
        <p style={{ margin: 0, color: "var(--crm-muted)", fontSize: 13.5 }}>Sube un <b>.docx</b> con los datos que cambian entre corchetes (ej.: [Nombre del Cliente]) o un <b>PDF</b> que se firma tal cual.<br />
          🔒 Configurar o quitar una plantilla solo afecta a los envíos <b>nuevos</b>: cada contrato enviado o firmado guarda su propia copia del documento y no cambia.</p>
        <button className="crm-btn" onClick={() => setEdit({})}>⬆ Subir plantilla</button>
      </div>
      {error && <div className="cf-err">{error}</div>}
      <table className="crm-table">
        <thead><tr><th>Plantilla</th><th>Tipo</th><th>Huecos</th><th>Actualizada</th><th></th></tr></thead>
        <tbody>
          {items === null ? <tr><td colSpan="5" className="crm-empty">Cargando…</td></tr> : items.length ? items.map((t) => (
            <tr key={t.id}>
              <td style={{ fontWeight: 600 }}>{t.name}</td>
              <td>{t.kind === "pdf" ? "PDF" : "Word"}</td>
              <td>{t.kind === "pdf" ? "—" : `${(t.fields || []).length} (${(t.fields || []).filter((f) => f.source === "ask").length} se preguntan al enviar)`}</td>
              <td>{fmtDate(t.updatedAt || t.createdAt)}</td>
              <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                {t.kind !== "pdf" && <button className="crm-btn ghost sm" onClick={() => setEdit(t)}>Configurar</button>}{" "}
                <button className="crm-btn ghost sm" onClick={() => archive(t)}>Quitar</button>
              </td>
            </tr>
          )) : <tr><td colSpan="5" className="crm-empty">Aún no hay plantillas.</td></tr>}
        </tbody>
      </table>
      {edit && <TemplateEditor template={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </>
  );
}

function TemplateEditor({ template, onClose, onSaved }) {
  const isNew = !template.id;
  const [name, setName] = useState(template.name || "");
  const [kind, setKind] = useState(template.kind || "");
  const [blocks, setBlocks] = useState(template.preview || null);
  const [fields, setFields] = useState(template.fields || []);
  const [pdf, setPdf] = useState(null);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const file = useRef(null);
  const counts = useMemo(() => (blocks ? holeCounts(blocks) : {}), [blocks]);

  const pick = async (f) => {
    setError("");
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) return setError("El archivo pasa de 10 MB");
    if (!name) setName(f.name.replace(/\.(docx|pdf)$/i, ""));
    if (/\.pdf$/i.test(f.name)) { setKind("pdf"); setPdf(f); setBlocks(null); setFields([]); return; }
    if (!/\.docx$/i.test(f.name)) return setError("Solo .docx (Word) o .pdf");
    try {
      const b = await blocksFromDocx(f);
      if (!b.length) return setError("El documento está vacío");
      setKind("docx"); setBlocks(b);
      setFields(holesOf(b).map((key) => ({ key, source: guessSource(key) })));
    } catch (e) { setError(e.message); }
  };

  const save = async () => {
    setError("");
    if (!name.trim()) return setError("Ponle un nombre");
    if (isNew && !kind) return setError("Elige el archivo");
    setBusy(true);
    try {
      await contractsApi("templates", isNew
        ? { name, kind, ...(kind === "pdf" ? { data: await toBase64(pdf) } : { blocks, fields }) }
        : { id: template.id, name, fields });
      onSaved();
    } catch (e) { setError(e.message); setBusy(false); }
  };

  return (
    <CrmModal title={isNew ? "Subir plantilla" : `Configurar · ${template.name}`} onClose={onClose} maxWidth={820}
      footer={<><button className="crm-btn ghost" onClick={onClose}>Cancelar</button><button className="crm-btn" onClick={save} disabled={busy}>{busy ? "Guardando…" : "Guardar plantilla"}</button></>}>
      <div className="crm-field"><label>Nombre de la plantilla</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Hoja de Encargo · Wikipedia" /></div>
      {isNew && (
        <div className="crm-field">
          <label>Documento</label>
          <input ref={file} type="file" accept=".docx,.pdf" onChange={(e) => pick(e.target.files?.[0])} />
        </div>
      )}
      {kind === "pdf" && <p style={{ fontSize: 13, color: "var(--crm-muted)" }}>PDF: se enviará tal cual. Al firmar se añade una hoja de firmas con la huella y el certificado.</p>}
      {kind === "docx" && blocks && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "6px 0" }}>
            <b style={{ fontSize: 13.5 }}>¿De dónde sale cada dato?</b>
            <button className="crm-btn ghost sm" onClick={() => setPreview((p) => !p)}>{preview ? "Ocultar documento" : "👁 Ver documento"}</button>
          </div>
          <p style={{ fontSize: 12.5, color: "var(--crm-muted)", margin: "0 0 8px" }}>El sistema propone el origen de cada hueco; revísalo y cámbialo si hace falta. Lo que elijas se usará cada vez que envíes esta plantilla (al enviar a mano siempre se puede cambiar).</p>
          <TemplateFields fields={fields} counts={counts} onChange={setFields} />
          {preview && <div className="ctr-public__paper" style={{ marginTop: 10 }}><ContractView blocks={blocks} values={{}} /></div>}
        </>
      )}
      {error && <div className="cf-err" style={{ marginTop: 10 }}>{error}</div>}
    </CrmModal>
  );
}

/* ------------------------------------------------------------------ ajustes de firma */

function Settings() {
  const [s, setS] = useState(null);
  const [sig, setSig] = useState("");
  const [redraw, setRedraw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const load = useCallback(() => contractsApi("settings").then((r) => setS(r.settings)).catch((e) => setMsg(e.message)), []);
  useEffect(() => { load(); }, [load]);
  if (!s) return <p>{msg || "Cargando…"}</p>;
  const set = (group, k) => (e) => setS((x) => ({ ...x, [group]: { ...(x[group] || {}), [k]: e.target.value } }));
  const save = async () => {
    setMsg("");
    if (!s.company?.name || !s.signer?.name) return setMsg("Rellena al menos la razón social y el nombre del firmante.");
    if (!s.hasSignature && !sig) return setMsg("Dibuja la firma del firmante.");
    setBusy(true);
    try {
      await contractsApi("settings", { company: s.company, signer: s.signer, notifyEmail: s.notifyEmail, ...(sig ? { signature: sig } : {}) });
      setSig(""); setRedraw(false);
      await load(); // vuelve a leer lo guardado (con la firma) para enseñar lo que de verdad quedó
      setMsg("✓ Guardado");
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="crm-panel" style={{ maxWidth: 760 }}>
      <h4>Empresa (el "Prestador" de los contratos)</h4>
      <div className="crm-two" style={{ flexWrap: "wrap" }}>
        <div className="crm-field" style={{ flex: "1 1 45%" }}><label>Razón social</label><input value={s.company?.name || ""} onChange={set("company", "name")} placeholder="Tu empresa, S.L." /></div>
        <div className="crm-field" style={{ flex: "1 1 45%" }}><label>CIF</label><input value={s.company?.cif || ""} onChange={set("company", "cif")} /></div>
      </div>
      <div className="crm-field"><label>Domicilio</label><input value={s.company?.address || ""} onChange={set("company", "address")} /></div>
      <h4 style={{ marginTop: 16 }}>Firmante de tu empresa</h4>
      <div className="crm-two" style={{ flexWrap: "wrap" }}>
        <div className="crm-field" style={{ flex: "1 1 45%" }}><label>Nombre completo</label><input value={s.signer?.name || ""} onChange={set("signer", "name")} /></div>
        <div className="crm-field" style={{ flex: "1 1 45%" }}><label>DNI / NIF</label><input value={s.signer?.dni || ""} onChange={set("signer", "dni")} /></div>
        <div className="crm-field" style={{ flex: "1 1 45%" }}><label>Cargo</label><input value={s.signer?.role || ""} onChange={set("signer", "role")} placeholder="Ej.: Administradora" /></div>
        <div className="crm-field" style={{ flex: "1 1 45%" }}><label>Email del firmante</label><input type="email" value={s.signer?.email || ""} onChange={set("signer", "email")} /></div>
      </div>
      <div className="crm-field"><label>Enviar copia de los contratos firmados a</label><input type="email" value={s.notifyEmail || ""} onChange={(e) => setS((x) => ({ ...x, notifyEmail: e.target.value }))} placeholder="Si lo dejas vacío, al firmante (o a quien envió el contrato)" /></div>
      <h4 style={{ marginTop: 16 }}>Firma</h4>
      {s.hasSignature && !redraw ? (
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ border: "1px solid var(--crm-line,#dfe8e8)", borderRadius: 10, background: "#fff", padding: 8, minWidth: 260, minHeight: 90, display: "grid", placeItems: "center" }}>
            {s.signatureUrl ? <img src={s.signatureUrl} alt="Firma guardada" style={{ maxWidth: 320, maxHeight: 130 }} /> : <span style={{ fontSize: 13, color: "var(--crm-muted)" }}>Firma guardada</span>}
          </div>
          <div>
            <p style={{ fontSize: 13, color: "#136B68", margin: "0 0 8px" }}>✓ Esta es la firma guardada. Se pone en cada contrato que envía tu empresa.</p>
            <button className="crm-btn ghost sm" onClick={() => { setRedraw(true); setMsg(""); }}>✏️ Cambiar firma</button>
          </div>
        </div>
      ) : (
        <>
          <p style={{ fontSize: 13, color: "var(--crm-muted)", margin: "0 0 8px" }}>
            {s.hasSignature ? "Dibuja la nueva firma y pulsa Guardar. Si no guardas, se queda la anterior." : "Dibuja la firma del firmante. Se pondrá en cada contrato que envíe tu empresa, junto con la huella de quién lo envía, su IP y la fecha y hora."}
          </p>
          <SignaturePad onChange={setSig} />
          {s.hasSignature && <button className="crm-btn ghost sm" style={{ marginTop: 6 }} onClick={() => { setRedraw(false); setSig(""); }}>Cancelar cambio de firma</button>}
        </>
      )}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12 }}>
        <button className="crm-btn" onClick={save} disabled={busy}>{busy ? "Guardando…" : "Guardar ajustes"}</button>
        {msg && <span style={{ fontSize: 13, color: msg.startsWith("✓") ? "#136B68" : "#b0304c" }}>{msg}</span>}
      </div>
    </div>
  );
}
