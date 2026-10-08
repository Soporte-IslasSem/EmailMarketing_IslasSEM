import { useMemo, useState } from "react";
import { useCrmCollection, crmRemove, crmUpdate } from "../lib/crm";
import { BUILTIN_FORMS, BUILTIN_LIST } from "../../forms/public/builtinForms";
import FormBuilderModal from "../components/FormBuilderModal";
import { formDraftFrom } from "../lib/formDraft";
import "../crm.styles.css";

// Formularios públicos rellenables: los dos fijos replicados del Bitrix de ISLAS SEM
// (SEPA / Datos Jurídicos) y los creados aquí (colección crmForms). Todos funcionan igual.
export default function CrmForms() {
  const { items: subs } = useCrmCollection("formSubmissions");
  const { items: custom, orgId } = useCrmCollection("crmForms");
  const [copied, setCopied] = useState("");
  const [editing, setEditing] = useState(null); // null | {} (nuevo) | borrador (duplicado) | form (con id)

  const base = typeof window !== "undefined" ? window.location.origin : "";
  const counts = useMemo(() => {
    const c = {};
    subs.forEach((s) => { c[s.formType] = (c[s.formType] || 0) + 1; });
    return c;
  }, [subs]);
  const sorted = useMemo(
    () => [...custom].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)),
    [custom]
  );

  const linkFor = (type) => `${base}/f/${type}`;
  const copy = async (type) => {
    try { await navigator.clipboard.writeText(linkFor(type)); setCopied(type); setTimeout(() => setCopied(""), 1500); }
    catch { window.prompt("Copia el enlace:", linkFor(type)); }
  };
  const duplicate = (src, name) => setEditing(formDraftFrom(src, `${name} (copia)`));
  const remove = async (f) => {
    if (!window.confirm(`¿Eliminar el formulario "${f.name}"? El enlace dejará de funcionar. Las respuestas recibidas se conservan y puedes restaurarlo desde la Papelera.`)) return;
    await crmRemove("crmForms", f.id);
  };

  const actions = (type, extra) => (
    <td style={{ whiteSpace: "nowrap" }}>
      <a className="crm-btn ghost sm" href={linkFor(type)} target="_blank" rel="noreferrer">Ver / Rellenar</a>{" "}
      <button className="crm-btn sm" onClick={() => copy(type)}>{copied === type ? "¡Copiado!" : "Copiar enlace"}</button>{" "}
      {extra}
    </td>
  );

  return (
    <div className="crm">
      <div className="crm__top">
        <div>
          <h1>Formularios</h1>
          <p>Formularios públicos rellenables · se envían al cliente y vuelven a su ficha.</p>
        </div>
        <button className="crm-btn" onClick={() => setEditing({})}>+ Crear formulario</button>
      </div>

      <table className="crm-table">
        <thead>
          <tr><th>Nombre</th><th>Estado</th><th>Respuestas</th><th>Campos</th><th>Enlace</th></tr>
        </thead>
        <tbody>
          {BUILTIN_LIST.map((f) => (
            <tr key={f.type}>
              <td><b>{f.name}</b><div style={{ fontSize: 12, color: "var(--crm-muted)" }}>Formulario fijo · {f.list}</div></td>
              <td><span className="crm-chip ok">Publicado</span></td>
              <td style={{ fontVariant: "tabular-nums" }}>{counts[f.type] || 0}</td>
              <td>{BUILTIN_FORMS[f.type].fields.length}</td>
              {actions(f.type, <button className="crm-btn ghost sm" onClick={() => duplicate(BUILTIN_FORMS[f.type], f.short)}>Duplicar</button>)}
            </tr>
          ))}
          {sorted.map((f) => (
            <tr key={f.id}>
              <td><b>{f.name}</b><div style={{ fontSize: 12, color: "var(--crm-muted)" }}>Creado por ti</div></td>
              <td>
                {f.active === false
                  ? <button className="crm-chip warn" style={{ border: 0, cursor: "pointer" }} title="Pulsa para publicar" onClick={() => crmUpdate("crmForms", f.id, { active: true })}>Desactivado</button>
                  : <span className="crm-chip ok">Publicado</span>}
              </td>
              <td style={{ fontVariant: "tabular-nums" }}>{counts[f.id] || 0}</td>
              <td>{(f.fields || []).length}</td>
              {actions(f.id, (
                <>
                  <button className="crm-btn ghost sm" onClick={() => setEditing(f)}>Editar</button>{" "}
                  <button className="crm-btn ghost sm" onClick={() => duplicate(f, f.name)}>Duplicar</button>{" "}
                  <button className="crm-btn ghost sm" onClick={() => remove(f)} title="Eliminar">🗑</button>
                </>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="crm-panel" style={{ marginTop: 16 }}>
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--crm-muted)" }}>
          💡 Para que un formulario se envíe <b>solo</b> cuando una negociación entra en una etapa, añade en
          <b> Automatización de ventas</b> una regla "Enviar formulario/documento" y elige el formulario. También puedes
          copiar el enlace y enviarlo a mano. Las respuestas quedan registradas en la <b>ficha del contacto y de la negociación</b>
          {" "}(o crean un prospecto si el email no existe).
        </p>
      </div>

      {editing && (
        <FormBuilderModal
          orgId={orgId}
          form={Object.keys(editing).length ? editing : null}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
