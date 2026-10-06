import { useMemo, useState } from "react";
import CrmModal from "../components/CrmModal";
import { useCrmCollection, crmCreate, crmUpdate } from "../lib/crm";
import { CF_ENTITIES, CF_TYPES, slugKey } from "../lib/customFields";
import "../crm.styles.css";

const empty = { label: "", type: "text", options: "" };

// Ajustes de CRM: campos personalizados por entidad (equivalente a los UF_* de Bitrix).
export default function CrmSettings() {
  const { items, loading, orgId } = useCrmCollection("customFields");
  const [entity, setEntity] = useState("contacts");
  const [edit, setEdit] = useState(null); // null | {} (nuevo) | campo
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");

  const fields = useMemo(
    () => items.filter((f) => f.entity === entity && !f.archived).sort((a, b) => (a.sort || 0) - (b.sort || 0)),
    [items, entity]
  );

  const open = (f) => {
    setError("");
    setEdit(f || {});
    setForm(f ? { label: f.label, type: f.type, options: (f.options || []).join("\n") } : empty);
  };

  const save = async () => {
    const label = form.label.trim();
    if (!label) return setError("Pon un nombre al campo.");
    const options = form.options.split("\n").map((o) => o.trim()).filter(Boolean);
    if (form.type === "select" && !options.length) return setError("Añade al menos una opción (una por línea).");
    if (edit.id) {
      await crmUpdate("customFields", edit.id, { label, type: form.type, options });
    } else {
      // la clave no cambia nunca (los valores guardados dependen de ella)
      let key = slugKey(label);
      const taken = new Set(items.filter((f) => f.entity === entity).map((f) => f.key));
      for (let i = 2; taken.has(key); i++) key = `${slugKey(label)}_${i}`;
      await crmCreate("customFields", orgId, { entity, label, key, type: form.type, options, sort: fields.length });
    }
    setEdit(null);
  };

  const move = async (idx, dir) => {
    const a = fields[idx], b = fields[idx + dir];
    if (!a || !b) return;
    await Promise.all([crmUpdate("customFields", a.id, { sort: idx + dir }), crmUpdate("customFields", b.id, { sort: idx })]);
  };

  // Archivar (no borrar): los valores ya guardados en las fichas se conservan.
  const archive = (f) =>
    window.confirm(`¿Quitar el campo "${f.label}"? Los datos ya guardados se conservan pero dejarán de mostrarse.`) &&
    crmUpdate("customFields", f.id, { archived: true });

  return (
    <div className="crm">
      <div className="crm__top">
        <div>
          <h1>Ajustes de CRM</h1>
          <p>Campos personalizados: añade a cada ficha los datos propios de tu negocio.</p>
        </div>
        <button className="crm-btn" onClick={() => open(null)}>+ Nuevo campo</button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {CF_ENTITIES.map((e) => (
          <button key={e.id} className={`crm-btn sm ${entity === e.id ? "" : "ghost"}`} onClick={() => setEntity(e.id)}>
            {e.label} ({items.filter((f) => f.entity === e.id && !f.archived).length})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="crm-loading">Cargando…</div>
      ) : (
        <table className="crm-table">
          <thead>
            <tr><th>Orden</th><th>Campo</th><th>Tipo</th><th>Opciones</th><th></th></tr>
          </thead>
          <tbody>
            {fields.length ? fields.map((f, i) => (
              <tr key={f.id}>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="crm-btn ghost sm" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>{" "}
                  <button className="crm-btn ghost sm" disabled={i === fields.length - 1} onClick={() => move(i, 1)}>↓</button>
                </td>
                <td style={{ fontWeight: 600 }}>{f.label}</td>
                <td>{CF_TYPES.find((t) => t.id === f.type)?.label || f.type}</td>
                <td style={{ fontSize: 13, color: "var(--crm-muted)" }}>{(f.options || []).join(" · ") || "—"}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <button className="crm-btn ghost sm" onClick={() => open(f)}>Editar</button>{" "}
                  <button className="crm-btn ghost sm" onClick={() => archive(f)}>✕</button>
                </td>
              </tr>
            )) : (
              <tr><td colSpan="5" className="crm-empty">Sin campos personalizados en {CF_ENTITIES.find((e) => e.id === entity).label.toLowerCase()}.</td></tr>
            )}
          </tbody>
        </table>
      )}

      {edit && (
        <CrmModal
          title={edit.id ? "Editar campo" : `Nuevo campo · ${CF_ENTITIES.find((e) => e.id === entity).label}`}
          onClose={() => setEdit(null)}
          footer={
            <>
              <button className="crm-btn ghost" onClick={() => setEdit(null)}>Cancelar</button>
              <button className="crm-btn" onClick={save}>Guardar</button>
            </>
          }
        >
          <div className="crm-field"><label>Nombre del campo</label>
            <input autoFocus value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="p. ej. Nº de trabajadores" />
          </div>
          <div className="crm-field"><label>Tipo</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {CF_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          {form.type === "select" && (
            <div className="crm-field"><label>Opciones (una por línea)</label>
              <textarea rows="5" value={form.options} onChange={(e) => setForm({ ...form, options: e.target.value })} />
            </div>
          )}
          {error && <p style={{ color: "#b0304c", margin: "8px 0 0", fontSize: 13 }}>{error}</p>}
        </CrmModal>
      )}
    </div>
  );
}
