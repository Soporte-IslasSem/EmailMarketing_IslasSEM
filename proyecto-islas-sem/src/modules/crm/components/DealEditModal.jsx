// Editar una negociación desde el Kanban (✎ de la tarjeta): datos principales, campos
// personalizados (todas las negociaciones) y campos propios de esta negociación,
// con "+ Crear campo" como en la ficha.
import { useState } from "react";
import CrmModal from "./CrmModal";
import { CustomFieldsForm } from "./CustomFields";
import { CreateFieldModal, ExtraFieldsEditor } from "./DealFields";
import { crmUpdate, useCrmCollection } from "../lib/crm";
import { CLIENT_TIERS } from "../lib/pipelines";
import { employeeEmailByName } from "../lib/owners";

export default function DealEditModal({ deal, orgId, onClose }) {
  const { items: employees } = useCrmCollection("employees");
  const [f, setF] = useState(() => ({
    title: deal.title || "", amount: deal.amount || 0, contact: deal.contact || "", company: deal.company || "",
    responsable: deal.responsable || "", clientType: deal.clientType || "nuevo", notes: deal.notes || "",
    custom: { ...(deal.custom || {}) }, extraFields: [...(deal.extraFields || [])],
  }));
  const [newField, setNewField] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const save = async () => {
    if (!f.title.trim()) return setError("Ponle un nombre a la negociación.");
    setSaving(true);
    try {
      await crmUpdate("deals", deal.id, {
        title: f.title.trim(), amount: Number(f.amount) || 0, contact: f.contact.trim(), company: f.company.trim(),
        responsable: f.responsable.trim(), ownerEmail: employeeEmailByName(employees, f.responsable) || deal.ownerEmail || "",
        clientType: f.clientType, notes: f.notes, custom: f.custom, extraFields: f.extraFields,
      });
      onClose();
    } catch (e) {
      setError("No se pudo guardar: " + e.message);
      setSaving(false);
    }
  };

  return (
    <CrmModal
      title="Editar negociación"
      onClose={onClose}
      maxWidth={640}
      footer={
        <>
          <button className="crm-btn ghost" onClick={onClose}>Cancelar</button>
          <button className="crm-btn" onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</button>
        </>
      }
    >
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: -6 }}>
        <span className="crm-link" style={{ fontSize: 12.5 }} onClick={() => setNewField(true)}>+ Crear campo</span>
      </div>
      <div className="crm-field"><label>Nombre</label><input value={f.title} onChange={set("title")} autoFocus /></div>
      <div className="crm-two">
        <div className="crm-field"><label>Importe (€)</label><input type="number" value={f.amount} onChange={set("amount")} /></div>
        <div className="crm-field"><label>Relación con el cliente</label>
          <select value={f.clientType} onChange={set("clientType")}>{Object.entries(CLIENT_TIERS).map(([k, t]) => <option key={k} value={k}>{t.icon} {t.label}</option>)}</select>
        </div>
      </div>
      <div className="crm-two">
        <div className="crm-field"><label>Contacto</label><input value={f.contact} onChange={set("contact")} /></div>
        <div className="crm-field"><label>Empresa</label><input value={f.company} onChange={set("company")} /></div>
      </div>
      <div className="crm-field"><label>Responsable</label>
        <input value={f.responsable} onChange={set("responsable")} list="dem-people" />
        <datalist id="dem-people">{employees.map((x) => <option key={x.id} value={`${x.firstName || ""} ${x.lastName || ""}`.trim() || x.email} />)}</datalist>
      </div>
      <div className="crm-field"><label>Comentario</label><textarea rows="2" value={f.notes} onChange={set("notes")} /></div>
      <CustomFieldsForm entity="deals" values={f.custom} onChange={(custom) => setF((x) => ({ ...x, custom }))} />
      <ExtraFieldsEditor value={f.extraFields} onChange={(extraFields) => setF((x) => ({ ...x, extraFields }))} />
      {error && <div style={{ background: "#fdeef1", color: "#b0304c", padding: "9px 12px", borderRadius: 8, fontSize: 13, marginTop: 12 }}>{error}</div>}
      {newField && (
        <CreateFieldModal orgId={orgId} onClose={() => setNewField(false)} onAddExtra={(x) => setF((y) => ({ ...y, extraFields: [...y.extraFields, x] }))} />
      )}
    </CrmModal>
  );
}
