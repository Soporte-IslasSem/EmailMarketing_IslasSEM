// "+ Crear campo" de las negociaciones (como el prototipo / Bitrix).
// Un campo nuevo puede ser:
// - Para todas las negociaciones: se guarda como campo personalizado (customFields,
//   entidad "deals") y aparece en todas las fichas.
// - Solo para esta negociación: se guarda dentro del documento en `extraFields`
//   ([{ label, type, value }]), sin tocar al resto.
import { useState } from "react";
import CrmModal from "./CrmModal";
import { crmCreate } from "../lib/crm";
import { CF_TYPES, slugKey, useCustomFields } from "../lib/customFields";

const EXTRA_TYPES = CF_TYPES.filter((t) => t.id !== "select");

export function CreateFieldModal({ orgId, onClose, onAddExtra }) {
  const { fields } = useCustomFields("deals");
  const [form, setForm] = useState({ label: "", type: "text", options: "", scope: "all" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const types = form.scope === "all" ? CF_TYPES : EXTRA_TYPES;

  const save = async () => {
    const label = form.label.trim();
    if (!label) return setError("Pon un nombre al campo.");
    if (form.scope === "one") {
      onAddExtra({ label, type: form.type === "select" ? "text" : form.type, value: form.type === "checkbox" ? false : "" });
      return onClose();
    }
    const options = form.options.split("\n").map((o) => o.trim()).filter(Boolean);
    if (form.type === "select" && !options.length) return setError("Añade al menos una opción (una por línea).");
    setSaving(true);
    try {
      let key = slugKey(label);
      const taken = new Set(fields.map((f) => f.key));
      for (let i = 2; taken.has(key); i++) key = `${slugKey(label)}_${i}`;
      await crmCreate("customFields", orgId, { entity: "deals", label, key, type: form.type, options, sort: fields.length });
      onClose();
    } catch (e) {
      setError("No se pudo crear el campo: " + e.message);
      setSaving(false);
    }
  };

  return (
    <CrmModal
      title="Crear campo"
      onClose={onClose}
      footer={
        <>
          <button className="crm-btn ghost" onClick={onClose}>Cancelar</button>
          <button className="crm-btn" onClick={save} disabled={saving}>{saving ? "Guardando…" : "Crear campo"}</button>
        </>
      }
    >
      <div className="crm-field"><label>Nombre del campo</label><input value={form.label} onChange={set("label")} autoFocus placeholder="Ej. Nº de trabajadores, Web actual, Fecha de firma…" /></div>
      <div className="crm-field"><label>Tipo</label>
        <select value={form.type} onChange={set("type")}>{types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
      </div>
      {form.scope === "all" && form.type === "select" && (
        <div className="crm-field"><label>Opciones (una por línea)</label><textarea rows="4" value={form.options} onChange={set("options")} /></div>
      )}
      <div className="crm-field"><label>¿Dónde se usa?</label>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 400 }}>
          <input type="radio" style={{ width: "auto" }} checked={form.scope === "all"} onChange={() => setForm((f) => ({ ...f, scope: "all" }))} />
          En todas las negociaciones
        </label>
        {onAddExtra && (
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 400 }}>
            <input type="radio" style={{ width: "auto" }} checked={form.scope === "one"} onChange={() => setForm((f) => ({ ...f, scope: "one", type: f.type === "select" ? "text" : f.type }))} />
            Solo en esta negociación
          </label>
        )}
      </div>
      {error && <p style={{ color: "#b0304c", margin: 0 }}>{error}</p>}
    </CrmModal>
  );
}

// Campos extra de una sola negociación: valor editable y botón para quitarlos.
export function ExtraFieldsEditor({ value, onChange }) {
  const list = value || [];
  if (!list.length) return null;
  const setAt = (i, patch) => onChange(list.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  return (
    <div style={{ borderTop: "1px dashed #d8e4e4", marginTop: 10, paddingTop: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--crm-muted)", marginBottom: 6 }}>CAMPOS DE ESTA NEGOCIACIÓN</div>
      {list.map((f, i) => (
        <div className="crm-field" key={i}>
          <label style={{ display: "flex", justifyContent: "space-between" }}>
            {f.label}
            <span className="crm-link" style={{ fontWeight: 400 }} onClick={() => window.confirm(`¿Quitar el campo "${f.label}"?`) && onChange(list.filter((_, j) => j !== i))}>Quitar</span>
          </label>
          {f.type === "checkbox" ? (
            <input type="checkbox" style={{ width: "auto" }} checked={!!f.value} onChange={(e) => setAt(i, { value: e.target.checked })} />
          ) : f.type === "textarea" ? (
            <textarea rows="2" value={f.value || ""} onChange={(e) => setAt(i, { value: e.target.value })} />
          ) : (
            <input
              type={["number", "date", "email", "url"].includes(f.type) ? f.type : "text"}
              value={f.value ?? ""}
              onChange={(e) => setAt(i, { value: e.target.value })}
            />
          )}
        </div>
      ))}
    </div>
  );
}
