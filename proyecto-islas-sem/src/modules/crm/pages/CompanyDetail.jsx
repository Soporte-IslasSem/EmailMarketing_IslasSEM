// Ficha de empresa (CRM › Clientes › Empresas › clic en una empresa): datos editables,
// RGPD, campos personalizados, sus contactos, negociaciones, formularios e historial.
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useCrmCollection, crmGet, crmCreate, crmUpdate, money, fmtDate, ACTIVITY_TYPES } from "../lib/crm";
import { useOrg } from "../lib/useOrg";
import { CustomFieldsForm, CustomFieldsView } from "../components/CustomFields";
import ClientAssignRows from "../components/ClientAssign";
import { submissionLabel, submissionEntries } from "../../forms/public/builtinForms";
import "../crm.styles.css";

const RGPD = ["Pendiente", "Firmado", "No aplica"];
const FIELDS = [
  ["name", "Nombre"], ["cif", "CIF/NIF"], ["iban", "IBAN"], ["industry", "Actividad / sector"],
  ["email", "Email"], ["phone", "Teléfono"], ["website", "Web"], ["address", "Dirección"],
  ["city", "Ciudad"], ["province", "Provincia"], ["community", "Comunidad"], ["employees", "Nº empleados"],
];
const norm = (s) => String(s || "").trim().toLowerCase();

export default function CompanyDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { orgId } = useOrg();
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState(null); // null | copia en edición
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [noteType, setNoteType] = useState("Nota");

  const { items: contacts } = useCrmCollection("contacts");
  const { items: deals } = useCrmCollection("deals");
  const { items: activities } = useCrmCollection("activities");
  const { items: formSubs } = useCrmCollection("formSubmissions");

  useEffect(() => {
    let alive = true;
    crmGet("companies", id).then((c) => { if (alive) { setCompany(c); setLoading(false); } });
    return () => { alive = false; };
  }, [id]);

  // Contactos de la empresa: vinculados por id o, en datos antiguos, por el nombre.
  const people = useMemo(
    () => (company ? contacts.filter((c) => c.companyId === id || (!c.companyId && company.name && norm(c.company) === norm(company.name))) : []),
    [contacts, company, id]
  );
  const peopleIds = useMemo(() => new Set(people.map((p) => p.id)), [people]);
  const relatedDeals = useMemo(
    () => deals.filter((d) => d.companyId === id || (d.contactId && peopleIds.has(d.contactId)) || (company?.name && norm(d.company) === norm(company.name))),
    [deals, id, peopleIds, company]
  );
  const dealIds = useMemo(() => new Set(relatedDeals.map((d) => d.id)), [relatedDeals]);
  const forms = useMemo(
    () => formSubs
      .filter((s) => (s.contactId && peopleIds.has(s.contactId)) || (s.dealId && dealIds.has(s.dealId)) || s.id === company?.rgpdSubmissionId)
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)),
    [formSubs, peopleIds, dealIds, company]
  );
  const timeline = useMemo(
    () => activities
      .filter((a) => (a.entity === "company" && a.entityId === id) || (a.contactId && peopleIds.has(a.contactId)) || (a.entity === "deal" && dealIds.has(a.entityId)))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)),
    [activities, id, peopleIds, dealIds]
  );

  const save = async () => {
    if (!String(edit.name || "").trim()) return;
    setSaving(true);
    try {
      const data = Object.fromEntries(FIELDS.map(([k]) => [k, String(edit[k] || "").trim()]));
      const rgpdChanged = edit.rgpd !== company.rgpd;
      Object.assign(data, {
        rgpd: edit.rgpd || "Pendiente", notes: edit.notes || "", custom: edit.custom || {},
        ...(rgpdChanged ? { rgpdAt: edit.rgpd === "Firmado" ? new Date() : null, rgpdSource: edit.rgpd === "Firmado" ? "Marcado a mano" : "" } : {}),
      });
      await crmUpdate("companies", id, data);
      setCompany((c) => ({ ...c, ...data }));
      setEdit(null);
    } catch (e) {
      alert("No se pudo guardar: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const addNote = async () => {
    if (!note.trim()) return;
    await crmCreate("activities", orgId, { type: noteType, title: note.trim(), entity: "company", entityId: id, contactId: "", done: noteType === "Nota" });
    setNote("");
  };

  if (loading) return <div className="crm"><div className="crm-loading">Cargando…</div></div>;
  if (!company) {
    return (
      <div className="crm">
        <p>Empresa no encontrada.</p>
        <button className="crm-btn ghost" onClick={() => navigate("/dashboard/crm/companies")}>← Volver a empresas</button>
      </div>
    );
  }

  const rgpd = company.rgpd || "Pendiente";
  const set = (k) => (e) => setEdit((x) => ({ ...x, [k]: e.target.value }));

  return (
    <div className="crm">
      <div className="crm__top">
        <div>
          <button className="crm-btn ghost sm" onClick={() => navigate("/dashboard/crm/companies")}>← Empresas</button>
          <h1 style={{ marginTop: 10 }}>{company.name || "(sin nombre)"}</h1>
          <p>
            {company.cif || "Sin CIF"} ·{" "}
            <span className={`crm-chip ${rgpd === "Firmado" ? "ok" : rgpd === "No aplica" ? "info" : "warn"}`}>RGPD: {rgpd}</span>
            {company.rgpdAt && <span style={{ fontSize: 12.5, color: "var(--crm-muted)" }}> · {fmtDate(company.rgpdAt)}{company.rgpdSource ? ` (${company.rgpdSource})` : ""}</span>}
          </p>
        </div>
        {!edit && <button className="crm-btn" onClick={() => setEdit({ ...company, custom: { ...(company.custom || {}) } })}>Editar</button>}
      </div>

      <div className="crm-detail">
        <div>
          <div className="crm-panel">
            <h4>Información</h4>
            {edit ? (
              <>
                <div className="crm-two">
                  {FIELDS.map(([k, l]) => (
                    <div className="crm-field" key={k}><label>{l}</label><input value={edit[k] || ""} onChange={set(k)} /></div>
                  ))}
                  <div className="crm-field">
                    <label>RGPD (protección de datos)</label>
                    <select value={edit.rgpd || "Pendiente"} onChange={set("rgpd")}>{RGPD.map((r) => <option key={r}>{r}</option>)}</select>
                  </div>
                </div>
                <div className="crm-field"><label>Notas</label><textarea rows={3} value={edit.notes || ""} onChange={set("notes")} /></div>
                <CustomFieldsForm entity="companies" values={edit.custom || {}} onChange={(custom) => setEdit((x) => ({ ...x, custom }))} />
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button className="crm-btn" onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</button>
                  <button className="crm-btn ghost" onClick={() => setEdit(null)}>Cancelar</button>
                </div>
              </>
            ) : (
              <dl className="crm-dl">
                {FIELDS.filter(([k]) => k !== "name").map(([k, l]) => (
                  <div className="row" key={k}><dt>{l}</dt><dd>{company[k] || "—"}</dd></div>
                ))}
                <ClientAssignRows collection="companies" item={company} onChange={(patch) => setCompany((c) => ({ ...c, ...patch }))} />
                <div className="row"><dt>Origen</dt><dd>{company.source || (company.importedFrom === "bitrix24" ? "Bitrix24" : "—")}</dd></div>
                <div className="row"><dt>Alta</dt><dd>{fmtDate(company.createdAt)}</dd></div>
                {company.notes && <div className="row"><dt>Notas</dt><dd style={{ whiteSpace: "pre-wrap" }}>{company.notes}</dd></div>}
                <CustomFieldsView entity="companies" values={company.custom} />
              </dl>
            )}
          </div>

          <div className="crm-panel">
            <h4>Contactos ({people.length})</h4>
            {people.length ? people.map((p) => (
              <div key={p.id} className="crm-dl" style={{ borderBottom: "1px solid var(--crm-line,#eef3f3)", padding: "6px 0" }}>
                <span className="crm-link" onClick={() => navigate(`/dashboard/crm/contacts/${p.id}`)}>
                  {`${p.firstName || ""} ${p.lastName || ""}`.trim() || p.email || "(sin nombre)"}
                </span>
                <span style={{ color: "var(--crm-muted)", fontSize: 13 }}>{[p.role, p.email, p.phone].filter(Boolean).join(" · ")}</span>
              </div>
            )) : <p style={{ color: "var(--crm-muted)", fontSize: 13.5, margin: 0 }}>Sin contactos vinculados.</p>}
          </div>

          <div className="crm-panel">
            <h4>Negociaciones ({relatedDeals.length})</h4>
            {relatedDeals.length ? relatedDeals.map((d) => (
              <div key={d.id} className="crm-dl" style={{ borderBottom: "1px solid var(--crm-line,#eef3f3)", padding: "6px 0" }}>
                <span className="crm-link" onClick={() => navigate(`/dashboard/crm/deals/${d.id}`)}>{d.title || "Negociación"}</span>
                <span style={{ color: "var(--crm-muted)", fontSize: 13 }}>{money(d.value)}{d.stage ? ` · ${d.stage}` : ""}</span>
              </div>
            )) : <p style={{ color: "var(--crm-muted)", fontSize: 13.5, margin: 0 }}>Sin negociaciones.</p>}
          </div>

          {forms.length > 0 && (
            <div className="crm-panel">
              <h4>📋 Formularios recibidos ({forms.length})</h4>
              {forms.map((s) => (
                <details key={s.id} style={{ borderBottom: "1px solid var(--crm-line,#eef3f3)", padding: "8px 0" }}>
                  <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 13.5 }}>
                    {submissionLabel(s)}<span style={{ color: "var(--crm-muted)", fontWeight: 400, fontSize: 12 }}> · {fmtDate(s.createdAt)}</span>
                  </summary>
                  <dl className="crm-dl" style={{ marginTop: 8 }}>
                    {submissionEntries(s).map(([k, v]) => <div className="row" key={k}><dt>{k}</dt><dd>{String(v) || "—"}</dd></div>)}
                  </dl>
                </details>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="crm-panel">
            <h4>Registrar actividad</h4>
            <div style={{ display: "flex", gap: 8 }}>
              <select value={noteType} onChange={(e) => setNoteType(e.target.value)} style={{ maxWidth: 130 }}>
                {ACTIVITY_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Escribe una nota o tarea…" style={{ flex: 1 }} />
              <button className="crm-btn sm" onClick={addNote}>Añadir</button>
            </div>
          </div>
          <div className="crm-panel">
            <h4>Historial ({timeline.length})</h4>
            {timeline.length ? (
              <ul className="crm-timeline">
                {timeline.slice(0, 100).map((a) => (
                  <li key={a.id} className="crm-tl-item">
                    <span className="dot" />
                    <div className="tl-t">{a.type}: {a.title}</div>
                    <div style={{ fontSize: 12, color: "var(--crm-muted)" }}>{fmtDate(a.createdAt)}</div>
                  </li>
                ))}
              </ul>
            ) : <p style={{ color: "var(--crm-muted)", fontSize: 13.5, margin: 0 }}>Sin actividad todavía.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
