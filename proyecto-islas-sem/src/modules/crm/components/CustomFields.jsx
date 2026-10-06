// Componentes de campos personalizados (definiciones y helpers en ../lib/customFields.js).
import { useCustomFields, formatCustom } from "../lib/customFields";

// Inputs para formularios de alta/edición. `values` = objeto custom; onChange(nuevoObjeto).
export function CustomFieldsForm({ entity, values, onChange }) {
  const { fields } = useCustomFields(entity);
  if (!fields.length) return null;
  const v = values || {};
  const set = (key, val) => onChange({ ...v, [key]: val });
  return (
    <div style={{ borderTop: "1px dashed #d8e4e4", marginTop: 10, paddingTop: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--crm-muted)", marginBottom: 6 }}>CAMPOS PERSONALIZADOS</div>
      <div className="crm-two" style={{ flexWrap: "wrap" }}>
        {fields.map((f) => (
          <div className="crm-field" key={f.id} style={{ minWidth: 200, flex: "1 1 45%" }}>
            <label>{f.label}</label>
            {f.type === "select" ? (
              <select value={v[f.key] || ""} onChange={(e) => set(f.key, e.target.value)}>
                <option value="">—</option>
                {(f.options || []).map((o) => <option key={o}>{o}</option>)}
              </select>
            ) : f.type === "checkbox" ? (
              <input type="checkbox" style={{ width: "auto" }} checked={!!v[f.key]} onChange={(e) => set(f.key, e.target.checked)} />
            ) : f.type === "textarea" ? (
              <textarea rows="2" value={v[f.key] || ""} onChange={(e) => set(f.key, e.target.value)} />
            ) : (
              <input
                type={f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "email" ? "email" : f.type === "url" ? "url" : "text"}
                value={v[f.key] ?? ""}
                onChange={(e) => set(f.key, f.type === "number" && e.target.value !== "" ? Number(e.target.value) : e.target.value)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Lista de solo lectura para las fichas (oculta los campos vacíos).
export function CustomFieldsView({ entity, values }) {
  const { fields } = useCustomFields(entity);
  const v = values || {};
  const shown = fields.filter((f) => v[f.key] !== undefined && v[f.key] !== "" && v[f.key] !== null);
  if (!shown.length) return null;
  return (
    <>
      {shown.map((f) => (
        <div className="row" key={f.id}><dt>{f.label}</dt><dd>{formatCustom(f, v[f.key])}</dd></div>
      ))}
    </>
  );
}
