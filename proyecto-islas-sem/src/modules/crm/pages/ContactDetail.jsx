import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useCrmCollection, crmGet, crmCreate, crmUpdate, money, fmtDate, ACTIVITY_TYPES } from "../lib/crm";
import { RELATIONS } from "../lib/clientTypes";
import ClientAssignRows from "../components/ClientAssign";
import { usePerms } from "../lib/permissions";
import { useOrg } from "../lib/useOrg";
import { CustomFieldsForm, CustomFieldsView } from "../components/CustomFields";
import { CreateFieldModal, ExtraFieldsEditor } from "../components/DealFields";
import "../crm.styles.css";
import { submissionLabel, submissionEntries } from "../../forms/public/builtinForms";

// Datos de la ficha que se pueden editar: [campo, etiqueta, tipo de input].
const EDIT_FIELDS = [
  ["firstName", "Nombre"], ["lastName", "Apellidos"], ["email", "Email", "email"], ["phone", "Teléfono", "tel"],
  ["whatsapp", "WhatsApp", "tel"], ["dni", "DNI / NIF"], ["company", "Empresa"], ["role", "Cargo"], ["area", "Área / departamento"],
  ["address", "Dirección"], ["city", "Ciudad"], ["province", "Provincia"], ["notes", "Notas"],
];

export default function ContactDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { orgId } = useOrg();
  const [contact, setContact] = useState(null);
  const [loading, setLoading] = useState(true);

  const { items: activities } = useCrmCollection("activities");
  const { items: deals } = useCrmCollection("deals");
  const perms = usePerms();
  const { items: formSubs } = useCrmCollection("formSubmissions");

  const [note, setNote] = useState("");
  const [noteType, setNoteType] = useState("Nota");
  // Edición de la ficha: datos, campos personalizados y campos solo de este contacto.
  const [edit, setEdit] = useState(null); // null | borrador
  const [newField, setNewField] = useState(false);
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const draftOf = (c) => ({
    ...Object.fromEntries(EDIT_FIELDS.map(([k]) => [k, c[k] || ""])),
    tags: (c.tags || []).join(", "),
    custom: { ...(c.custom || {}) },
    extraFields: (c.extraFields || []).map((f) => ({ ...f })),
  });
  const startEdit = () => { setEditError(""); setEdit(draftOf(contact)); };
  const setE = (k) => (e) => setEdit((x) => ({ ...x, [k]: e.target.value }));
  const saveEdit = async () => {
    const email = edit.email.trim().toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return setEditError("El email no es válido.");
    if (!edit.firstName.trim() && !email) return setEditError("Pon al menos el nombre o el email.");
    const patch = {
      ...Object.fromEntries(EDIT_FIELDS.map(([k]) => [k, String(edit[k] || "").trim()])),
      email,
      tags: edit.tags.split(",").map((t) => t.trim()).filter(Boolean),
      custom: edit.custom,
      extraFields: edit.extraFields.filter((f) => String(f.label || "").trim()),
    };
    setSavingEdit(true);
    try {
      await crmUpdate("contacts", id, patch);
      setContact((c) => ({ ...c, ...patch }));
      setEdit(null);
    } catch (e) {
      setEditError(e.code === "permission-denied" ? "Tu rol no permite editar este contacto." : "No se pudo guardar: " + e.message);
    } finally {
      setSavingEdit(false);
    }
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

  if (perms.ready && !perms.can("contacts", "read", contact)) return <div className="crm"><div className="crm-panel">🔒 No tienes acceso a este registro (tu rol solo ve los suyos).</div><button className="crm-btn ghost" onClick={() => navigate("/dashboard/crm/contacts")}>← Contactos</button></div>;
  const ro = perms.ready && !perms.can("contacts", "edit", contact);

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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <h4 style={{ margin: 0 }}>Información</h4>
              {!ro && !edit && (
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="crm-btn ghost sm" onClick={() => setNewField(true)}>+ Añadir campo</button>
                  <button className="crm-btn sm" onClick={startEdit}>✏️ Editar datos</button>
                </div>
              )}
            </div>
            {ro && <p style={{ fontSize: 12.5, color: "var(--crm-muted)", margin: "8px 0" }}>🔒 Solo lectura: tu rol no permite editar este registro.</p>}
            {edit ? (
              <div style={{ marginTop: 10 }}>
                <div className="crm-two" style={{ flexWrap: "wrap" }}>
                  {EDIT_FIELDS.filter(([k]) => k !== "notes").map(([k, label, type]) => (
                    <div className="crm-field" key={k} style={{ minWidth: 200, flex: "1 1 45%" }}>
                      <label>{label}</label>
                      <input type={type || "text"} value={edit[k]} onChange={setE(k)} />
                    </div>
                  ))}
                </div>
                <div className="crm-field"><label>Etiquetas (separadas por coma)</label><input value={edit.tags} onChange={setE("tags")} /></div>
                <div className="crm-field"><label>Notas</label><textarea rows="2" value={edit.notes} onChange={setE("notes")} /></div>
                <CustomFieldsForm onlyFilled entity="contacts" values={edit.custom} onChange={(custom) => setEdit((x) => ({ ...x, custom }))} />
                <ExtraFieldsEditor entity="contacts" value={edit.extraFields} onChange={(extraFields) => setEdit((x) => ({ ...x, extraFields }))} />
                {editError && <p style={{ color: "#b0304c", margin: "8px 0 0" }}>{editError}</p>}
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <button className="crm-btn sm" onClick={saveEdit} disabled={savingEdit}>{savingEdit ? "Guardando…" : "Guardar"}</button>
                  <button className="crm-btn ghost sm" onClick={() => setNewField(true)}>+ Añadir campo</button>
                  <button className="crm-btn ghost sm" onClick={() => setEdit(null)}>Cancelar</button>
                </div>
              </div>
            ) : (
            <fieldset disabled={ro} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <dl className="crm-dl">
              <div className="row"><dt>ID cliente</dt><dd>{contact.clientId || "—"}</dd></div>
              <div className="row"><dt>Email</dt><dd>{contact.email || "—"}</dd></div>
              <div className="row"><dt>Teléfono</dt><dd>{contact.phone || "—"}</dd></div>
              {contact.whatsapp && contact.whatsapp !== contact.phone && <div className="row"><dt>WhatsApp</dt><dd>{contact.whatsapp}</dd></div>}
              <div className="row"><dt>DNI/NIF</dt><dd>{contact.dni || "—"}</dd></div>
              <div className="row"><dt>Empresa</dt><dd>{contact.companyId ? <span className="crm-link" onClick={() => navigate(`/dashboard/crm/companies/${contact.companyId}`)}>{contact.company || "Ver empresa"}</span> : contact.company || "—"}</dd></div>
              {(contact.role || contact.area) && <div className="row"><dt>Cargo / área</dt><dd>{[contact.role, contact.area].filter(Boolean).join(" · ")}</dd></div>}
              <div className="row"><dt>Dirección</dt><dd>{contact.address || "—"}</dd></div>
              <div className="row"><dt>Ciudad</dt><dd>{contact.city || "—"}{contact.province ? ` · ${contact.province}` : ""}</dd></div>
              <ClientAssignRows collection="contacts" item={contact} onChange={(patch) => setContact((c) => ({ ...c, ...patch }))} />
              <div className="row"><dt>Relación</dt><dd>
                <select value={contact.relation || ""} onChange={(e) => setField({ relation: e.target.value })} style={{ fontSize: 12.5, padding: "3px 6px", border: "1px solid #dfe7e7", borderRadius: 6 }}>
                  <option value="">—</option>
                  {RELATIONS.map((r) => <option key={r.id} value={r.id}>{r.icon} {r.label}</option>)}
                </select>
              </dd></div>
              {(contact.tags || []).length > 0 && <div className="row"><dt>Etiquetas</dt><dd style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>{contact.tags.map((t) => <span key={t} className="crm-chip">{t}</span>)}</dd></div>}
              <div className="row"><dt>Alta</dt><dd>{fmtDate(contact.createdAt)}</dd></div>
              <CustomFieldsView entity="contacts" values={contact.custom} />
              {(contact.extraFields || []).filter((f) => f.value !== "" && f.value !== undefined && f.value !== null).map((f, i) => (
                <div className="row" key={`x${i}`}><dt>{f.label}</dt><dd>{f.type === "checkbox" ? (f.value ? "Sí" : "No") : String(f.value)}</dd></div>
              ))}
            </dl>
            </fieldset>
            )}
            {!edit && contact.notes && (
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
      {newField && (
        <CreateFieldModal
          entity="contacts"
          orgId={orgId}
          onClose={() => setNewField(false)}
          onAddExtra={(f) => setEdit((x) => { const d = x || draftOf(contact); return { ...d, extraFields: [...d.extraFields, f] }; })}
        />
      )}
    </div>
  );
}
