// Creador/editor de formularios públicos (CRM › Formularios). Guarda en crmForms y
// funcionan igual que SEPA / Datos Jurídicos: enlace /f/<id> (o /f/<id>/<negociación>),
// reCAPTCHA, consentimiento RGPD y vinculación automática a la ficha del cliente.
import { useState } from "react";
import CrmModal from "./CrmModal";
import { crmCreate, crmUpdate } from "../lib/crm";
import { EMPTY_FORM as EMPTY, FIELD_TYPES, FIELD_MAPS } from "../lib/formDraft";

export default function FormBuilderModal({ orgId, form, onClose, onSaved }) {
  const [d, setD] = useState(() => (form?.id ? { ...EMPTY, ...form, fields: form.fields.map((f) => ({ ...f })) } : form || { ...EMPTY, fields: EMPTY.fields.map((f) => ({ ...f })) }));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setD((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const setField = (i, patch) => setD((x) => ({ ...x, fields: x.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) }));
  const move = (i, dir) => setD((x) => {
    const fields = [...x.fields];
    const j = i + dir;
    if (j < 0 || j >= fields.length) return x;
    [fields[i], fields[j]] = [fields[j], fields[i]];
    return { ...x, fields };
  });
  const remove = (i) => setD((x) => ({ ...x, fields: x.fields.filter((_, j) => j !== i) }));
  const add = () => setD((x) => ({ ...x, fields: [...x.fields, { k: "", type: "text", req: false, maps: "" }] }));

  const hasEmail = d.fields.some((f) => f.maps === "email");

  const save = async () => {
    setError("");
    const fields = d.fields.map((f) => ({
      k: String(f.k || "").trim(),
      type: f.type || "text",
      req: !!f.req,
      maps: f.maps || "",
      ...(f.type === "select" ? { options: (f.options || []).map((o) => String(o).trim()).filter(Boolean) } : {}),
    }));
    if (!d.name.trim()) return setError("Ponle un nombre al formulario.");
    if (!fields.length) return setError("Añade al menos un campo.");
    if (fields.some((f) => !f.k)) return setError("Todos los campos necesitan un nombre.");
    const names = fields.map((f) => f.k.toLowerCase());
    const dup = names.find((n, i) => names.indexOf(n) !== i);
    if (dup) return setError(`Hay dos campos con el mismo nombre: "${fields[names.indexOf(dup)].k}".`);
    const noOpts = fields.find((f) => f.type === "select" && !f.options.length);
    if (noOpts) return setError(`El desplegable "${noOpts.k}" necesita al menos una opción.`);
    const maps = fields.map((f) => f.maps).filter(Boolean);
    const dupMap = maps.find((m, i) => maps.indexOf(m) !== i);
    if (dupMap) return setError(`Solo un campo puede guardarse como "${FIELD_MAPS.find((x) => x[0] === dupMap)[1]}".`);
    const emailMap = fields.find((f) => f.maps === "email");
    if (emailMap && emailMap.type !== "email") return setError(`El campo "${emailMap.k}" se guarda como email: ponle el tipo "Email".`);

    const data = {
      name: d.name.trim().slice(0, 120),
      title: (d.title || d.name).trim().slice(0, 200),
      description: (d.description || "").trim().slice(0, 500),
      consentTitle: (d.consentTitle || "").trim().slice(0, 200),
      consentCheck: (d.consentCheck || "").trim().slice(0, 300),
      successMessage: (d.successMessage || "").trim().slice(0, 500),
      active: d.active !== false,
      fields,
    };
    setSaving(true);
    try {
      if (form?.id) await crmUpdate("crmForms", form.id, data);
      else await crmCreate("crmForms", orgId, data);
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e.code === "permission-denied"
        ? "Sin permiso para guardar formularios: falta publicar las reglas de la base de datos."
        : "No se pudo guardar: " + (e.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <CrmModal
      title={form?.id ? `Editar formulario · ${form.name}` : "Nuevo formulario"}
      onClose={onClose}
      maxWidth={760}
      footer={
        <>
          <button className="crm-btn ghost" onClick={onClose}>Cancelar</button>
          <button className="crm-btn" onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar formulario"}</button>
        </>
      }
    >
      <div className="crm-field"><label>Nombre interno *</label><input value={d.name} onChange={set("name")} placeholder="Ej.: Solicitud de presupuesto" /></div>
      <div className="crm-field"><label>Título que ve el cliente</label><input value={d.title} onChange={set("title")} placeholder={d.name || "Igual que el nombre"} /></div>
      <div className="crm-field"><label>Descripción (debajo del título)</label><input value={d.description} onChange={set("description")} /></div>

      <h4 style={{ margin: "18px 0 8px" }}>Campos</h4>
      {d.fields.map((f, i) => (
        <div key={i} style={{ border: "1px solid #e3eaea", borderRadius: 10, padding: 10, marginBottom: 8, background: "#fbfdfd" }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr) minmax(0,1.4fr)", gap: 8 }}>
            <input value={f.k} onChange={(e) => setField(i, { k: e.target.value })} placeholder="Nombre del campo (lo ve el cliente)" style={inp} />
            <select value={f.type} onChange={(e) => setField(i, { type: e.target.value, ...(e.target.value === "select" && !f.options ? { options: [] } : {}) })} style={inp}>
              {FIELD_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select value={f.maps || ""} onChange={(e) => setField(i, { maps: e.target.value })} style={inp} title="Se copia a la ficha del contacto o prospecto">
              {FIELD_MAPS.map(([v, l]) => <option key={v} value={v}>{v ? `Ficha: ${l}` : l}</option>)}
            </select>
          </div>
          {f.type === "select" && (
            <textarea
              value={(f.options || []).join("\n")}
              onChange={(e) => setField(i, { options: e.target.value.split("\n") })}
              placeholder="Opciones del desplegable, una por línea"
              rows={3}
              style={{ ...inp, marginTop: 8, fontFamily: "inherit" }}
            />
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, fontSize: 13 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={!!f.req} onChange={(e) => setField(i, { req: e.target.checked })} /> Obligatorio
            </label>
            <span style={{ flex: 1 }} />
            <button className="crm-btn ghost sm" onClick={() => move(i, -1)} disabled={i === 0} title="Subir">↑</button>
            <button className="crm-btn ghost sm" onClick={() => move(i, 1)} disabled={i === d.fields.length - 1} title="Bajar">↓</button>
            <button className="crm-btn ghost sm" onClick={() => remove(i)} title="Quitar campo">✕</button>
          </div>
        </div>
      ))}
      <button className="crm-btn ghost sm" onClick={add}>+ Añadir campo</button>
      {!hasEmail && (
        <p style={{ fontSize: 12.5, color: "#a06a00", background: "#fff7e6", padding: "8px 10px", borderRadius: 8, marginTop: 10 }}>
          Sin un campo guardado como <b>Email del cliente</b>, las respuestas solo se asocian a un cliente si envías el
          enlace desde una negociación (o la etapa lo envía sola).
        </p>
      )}

      <h4 style={{ margin: "18px 0 8px" }}>Consentimiento y mensaje final</h4>
      <div className="crm-field"><label>Título del consentimiento</label><input value={d.consentTitle} onChange={set("consentTitle")} /></div>
      <div className="crm-field"><label>Texto de la casilla</label><input value={d.consentCheck} onChange={set("consentCheck")} /></div>
      <div className="crm-field"><label>Mensaje al enviar</label><textarea rows={2} value={d.successMessage} onChange={set("successMessage")} /></div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, cursor: "pointer" }}>
        <input type="checkbox" checked={d.active !== false} onChange={set("active")} /> Publicado (si lo desactivas, el enlace deja de funcionar)
      </label>

      {error && <div style={{ background: "#fdeef1", color: "#b0304c", padding: "9px 12px", borderRadius: 8, fontSize: 13, marginTop: 12 }}>{error}</div>}
    </CrmModal>
  );
}

const inp = { width: "100%", boxSizing: "border-box", border: "1px solid #dfe7e7", borderRadius: 8, padding: "8px 10px", fontSize: 13.5, background: "#fff" };
