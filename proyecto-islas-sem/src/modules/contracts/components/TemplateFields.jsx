// De dónde sale cada hueco [..] de una plantilla: datos del cliente, de su empresa, de la
// negociación, de ISLAS SEM, un campo de formulario, un valor fijo o "preguntar al enviar".
import { SOURCE_LABELS } from "../lib/docx";

export default function TemplateFields({ fields, counts = {}, onChange }) {
  const set = (i, patch) => onChange(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  if (!fields.length) return <p style={{ color: "var(--crm-muted)", fontSize: 13 }}>Este documento no tiene huecos entre corchetes [..]: se enviará tal cual.</p>;
  return (
    <table className="crm-table" style={{ fontSize: 13 }}>
      <thead><tr><th>Hueco del documento</th><th>Se rellena con</th></tr></thead>
      <tbody>
        {fields.map((f, i) => (
          <tr key={f.key}>
            <td style={{ maxWidth: 260 }}>
              <code style={{ background: "#fff1d6", padding: "1px 4px", borderRadius: 4 }}>{f.key}</code>
              {counts[f.key] > 1 && <div style={{ color: "#8a5a00", fontSize: 11.5, marginTop: 3 }}>⚠ Aparece {counts[f.key]} veces: tendrá el mismo valor en todas. Si son datos distintos, ponles nombres distintos en el Word.</div>}
            </td>
            <td>
              <select value={f.source} onChange={(e) => set(i, { source: e.target.value, value: "" })} style={{ width: "100%" }}>
                {SOURCE_LABELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              {(f.source === "fixed" || f.source === "form") && (
                <input value={f.value || ""} onChange={(e) => set(i, { value: e.target.value })} style={{ width: "100%", marginTop: 4 }}
                  placeholder={f.source === "form" ? "Nombre exacto del campo del formulario (ej.: Nombre del escultor)" : "Valor que se pondrá siempre"} />
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
