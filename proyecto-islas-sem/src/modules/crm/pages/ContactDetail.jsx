import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useCrmCollection, crmGet, crmCreate, crmUpdate, logActivity, money, fmtDate, ACTIVITY_TYPES } from "../lib/crm";
import { RELATIONS } from "../lib/clientTypes";
import ClientAssignRows from "../components/ClientAssign";
import { useOrg } from "../lib/useOrg";
import { CustomFieldsForm, CustomFieldsView } from "../components/CustomFields";
import "../crm.styles.css";
import { submissionLabel, submissionEntries } from "../../forms/public/builtinForms";

export default function ContactDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { orgId } = useOrg();
  const [contact, setContact] = useState(null);
  const [loading, setLoading] = useState(true);

  const { items: activities } = useCrmCollection("activities");
  const { items: deals } = useCrmCollection("deals");
  const { items: formSubs } = useCrmCollection("formSubmissions");

  const [note, setNote] = useState("");
  const [noteType, setNoteType] = useState("Nota");
  const [editCustom, setEditCustom] = useState(null); // null | objeto en edición

  const saveCustom = async () => {
    await crmUpdate("contacts", id, { custom: editCustom });
    setContact((c) => ({ ...c, custom: editCustom }));
    setEditCustom(null);
  };

  useEffect(() => {
    let alive = true;
    crmGet("contacts", id).then((c) => {
      if (alive) {
        setContact(c);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [id]);

  const relatedDeals = useMemo(
    () => deals.filter((d) => d.contactId === id || (contact && d.contact === `${contact.firstName} ${contact.lastName}`.trim())),
    [deals, id, contact]
  );

  // Formularios rellenados (SEPA / Jurídicos) de cualquiera de sus negociaciones.
  const contactForms = useMemo(() => {
    const dealIds = new Set(relatedDeals.map((d) => d.id));
    return formSubs
      .filter((s) => dealIds.has(s.dealId) || s.contactId === id || (contact?.fromLeadId && s.leadId === contact.fromLeadId))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }, [formSubs, relatedDeals, id, contact]);

  // Timeline COMPLETO de la persona: sus notas + todo lo de sus negociaciones
  // (ofertas, cambios de etapa, automatizaciones, formularios enviados, cierres…).
  const timeline = useMemo(() => {
    const dealIds = new Set(relatedDeals.map((d) => d.id));
    return activities
      .filter(
        (a) =>
          a.contactId === id ||
          (a.entity === "contact" && a.entityId === id) ||
          // lo que llegó cuando aún era prospecto (correos, formularios)
          (contact?.fromLeadId && (a.leadId === contact.fromLeadId || (a.entity === "lead" && a.entityId === contact.fromLeadId))) ||
          (a.entity === "deal" && dealIds.has(a.entityId))
      )
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }, [activities, id, relatedDeals, contact]);

  const addNote = async () => {
    if (!note.trim()) return;
    await crmCreate("activities", orgId, {
      type: noteType,
      title: note.trim(),
      entity: "contact",
      entityId: id,
      contactId: id,
      done: noteType === "Nota",
    });
    setNote("");
  };

  if (loading) return <div className="crm"><div className="crm-loading">Cargando…</div></div>;
  if (!contact)
    return (
      <div className="crm">
        <p>Contacto no encontrado.</p>
        <button className="crm-btn ghost" onClick={() => navigate("/dashboard/crm/contacts")}>
          ← Volver a contactos
        </button>
      </div>
    );

  const name = `${contact.firstName || ""} ${contact.lastName || ""}`.trim() || "(sin nombre)";
  const setField = async (patch) => {
    await crmUpdate("contacts", id, patch);
    setContact((c) => ({ ...c, ...patch }));
  };

  return (
    <div className="crm">
      <div className="crm__top">
        <div>
          <button className="crm-btn ghost sm" onClick={() => navigate("/dashboard/crm/contacts")}>
            ← Contactos
          </button>
          <h1 style={{ marginTop: 10 }}>
            {name}
          </h1>
          <p>{contact.company || "Sin empresa"}</p>
        </div>
      </div>

      <div className="crm-detail">
        <div>
          <div className="crm-panel">
            <h4>Información</h4>
            <dl className="crm-dl">
              <div className="row"><dt>ID cliente</dt><dd>{contact.clientId || "—"}</dd></div>
              <div className="row"><dt>Email</dt><dd>{contact.email || "—"}</dd></div>
              <div className="row"><dt>Teléfono</dt><dd>{contact.phone || "—"}</dd></div>
              <div className="row"><dt>DNI/NIF</dt><dd>{contact.dni || "—"}</dd></div>
              <div className="row"><dt>Empresa</dt><dd>{contact.companyId ? <span className="crm-link" onClick={() => navigate(`/dashboard/crm/companies/${contact.companyId}`)}>{contact.company || "Ver empresa"}</span> : contact.company || "—"}</dd></div>
              <div className="row"><dt>Dirección</dt><dd>{contact.address || "—"}</dd></div>
              <div className="row"><dt>Ciudad</dt><dd>{contact.city || "—"}{contact.province ? ` · ${contact.province}` : ""}</dd></div>
              <ClientAssignRows collection="contacts" item={contact} onChange={(patch) => setContact((c) => ({ ...c, ...patch }))} />
              <div className="row"><dt>Relación</dt><dd>
                <select value={contact.relation || ""} onChange={(e) => setField({ relation: e.target.value })} style={{ fontSize: 12.5, padding: "3px 6px", border: "1px solid #dfe7e7", borderRadius: 6 }}>
                  <option value="">—</option>
                  {RELATIONS.map((r) => <option key={r.id} value={r.id}>{r.icon} {r.label}</option>)}
                </select>
              </dd></div>
              <div className="row"><dt>Alta</dt><dd>{fmtDate(contact.createdAt)}</dd></div>
              <CustomFieldsView entity="contacts" values={contact.custom} />
            </dl>
            {editCustom ? (
              <>
                <CustomFieldsForm entity="contacts" values={editCustom} onChange={setEditCustom} />
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button className="crm-btn sm" onClick={saveCustom}>Guardar</button>
                  <button className="crm-btn ghost sm" onClick={() => setEditCustom(null)}>Cancelar</button>
                </div>
              </>
            ) : (
              <button className="crm-btn ghost sm" style={{ marginTop: 8 }} onClick={() => setEditCustom({ ...(contact.custom || {}) })}>
                ✏️ Campos personalizados
              </button>
            )}
            {contact.notes && (
              <p style={{ marginTop: 12, color: "var(--crm-muted)", fontSize: 14 }}>{contact.notes}</p>
            )}
          </div>

          <div className="crm-panel">
            <h4>Negocios relacionados ({relatedDeals.length})</h4>
            {relatedDeals.length ? (
              relatedDeals.map((d) => (
                <div key={d.id} className="crm-dl">
                  <div className="row">
                    <dt>{d.title}</dt>
                    <dd>{money(d.amount)}</dd>
                  </div>
                </div>
              ))
            ) : (
              <p style={{ color: "var(--crm-muted)", fontSize: 14, margin: 0 }}>Sin negocios todavía.</p>
            )}
          </div>

          {contactForms.length > 0 && (
            <div className="crm-panel">
              <h4>📋 Formularios rellenados ({contactForms.length})</h4>
              {contactForms.map((s) => (
                <details key={s.id} style={{ borderBottom: "1px solid var(--crm-line,#eef3f3)", padding: "8px 0" }}>
                  <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 13.5 }}>
                    {submissionLabel(s)}
                    <span style={{ color: "var(--crm-muted)", fontWeight: 400, fontSize: 12 }}> · {fmtDate(s.createdAt)}</span>
                  </summary>
                  <dl className="crm-dl" style={{ marginTop: 8 }}>
                    {submissionEntries(s).map(([k, v]) => (
                      <div className="row" key={k}><dt style={{ textTransform: "capitalize" }}>{k}</dt><dd>{String(v) || "—"}</dd></div>
                    ))}
                  </dl>
                </details>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="crm-panel">
            <h4>Registrar actividad</h4>
            <div className="crm-field">
              <select value={noteType} onChange={(e) => setNoteType(e.target.value)}>
                {ACTIVITY_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="crm-field" style={{ marginTop: 10 }}>
              <textarea
                rows="2"
                placeholder="Escribe una nota, llamada, reunión…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <button className="crm-btn sm" style={{ marginTop: 10 }} onClick={addNote}>
              Añadir al timeline
            </button>
          </div>

          <div className="crm-panel">
            <h4>Timeline</h4>
            {timeline.length ? (
              <ul className="crm-timeline">
                {timeline.map((a) => (
                  <li key={a.id} className="crm-tl-item">
                    <span className="dot" />
                    <div className="tl-t">
                      {a.type}: {a.title}
                    </div>
                    {a.body && (
                      <details style={{ fontSize: 13, color: "var(--crm-muted)" }}>
                        <summary style={{ cursor: "pointer" }}>Ver correo{a.from ? ` de ${a.from}` : ""}</summary>
                        <div style={{ whiteSpace: "pre-wrap", maxHeight: 320, overflowY: "auto", marginTop: 6, color: "#2a3a3a" }}>{a.body}</div>
                      </details>
                    )}
                    <div className="tl-m">{fmtDate(a.createdAt)}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ color: "var(--crm-muted)", fontSize: 14, margin: 0 }}>
                Sin actividad registrada aún.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
