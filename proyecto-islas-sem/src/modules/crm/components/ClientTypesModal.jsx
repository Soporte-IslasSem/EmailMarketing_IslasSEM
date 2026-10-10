// Gestionar los tipos de cliente: añadir, renombrar, icono, color, ordenar y quitar.
import { useState } from "react";
import CrmModal from "./CrmModal";
import { saveClientTypes, newTypeId } from "../lib/clientTypes";

export default function ClientTypesModal({ orgId, types, counts, onClose }) {
  const [list, setList] = useState(() => types.map((t) => ({ ...t })));
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const upd = (i, patch) => setList((l) => l.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const move = (i, d) => setList((l) => { const j = i + d; if (j < 0 || j >= l.length) return l; const c = [...l]; [c[i], c[j]] = [c[j], c[i]]; return c; });
  const remove = (i) => {
    const t = list[i];
    const n = counts[t.id] || 0;
    if (n && !window.confirm(`"${t.label}" lo tienen ${n} clientes de esta lista. Si lo quitas, seguirán marcados con ese tipo hasta que les pongas otro. ¿Quitarlo de la lista?`)) return;
    setList((l) => l.filter((_, j) => j !== i));
  };
  const add = () => {
    const v = label.trim();
    if (!v) return;
    setList((l) => [...l, { id: newTypeId(v, l), label: v, icon: "", color: "#1a9190" }]);
    setLabel("");
  };
  const save = async () => {
    setError("");
    const clean = list.map((t) => ({ ...t, label: String(t.label || "").trim() })).filter((t) => t.label);
    if (!clean.length) return setError("Deja al menos un tipo.");
    const names = clean.map((t) => t.label.toLowerCase());
    if (names.some((n, i) => names.indexOf(n) !== i)) return setError("Hay dos tipos con el mismo nombre.");
    setSaving(true);
    try { await saveClientTypes(orgId, clean); onClose(); }
    catch (e) { setError("No se pudo guardar: " + e.message); }
    finally { setSaving(false); }
  };

  return (
    <CrmModal title="Tipos de cliente" onClose={onClose} maxWidth={620}
      footer={<><button className="crm-btn ghost" onClick={onClose}>Cancelar</button><button className="crm-btn" onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</button></>}>
      <p style={{ margin: "0 0 12px", fontSize: 13.5, color: "var(--crm-muted)" }}>
        Crea los tipos que uses (p. ej. RGPD, Kit Digital, Asesoría…). La lista es la misma para contactos y empresas; el orden es el que se usa al ordenar por tipo.
      </p>
      {list.map((t, i) => (
        <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <input value={t.icon || ""} onChange={(e) => upd(i, { icon: e.target.value.slice(0, 4) })} placeholder="🙂" title="Icono (emoji, opcional)" style={{ width: 46, textAlign: "center" }} />
          <input value={t.label} onChange={(e) => upd(i, { label: e.target.value })} style={{ flex: 1 }} />
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(t.color || "") ? t.color : "#1a9190"} onChange={(e) => upd(i, { color: e.target.value })} title="Color" style={{ width: 40, height: 34, padding: 2 }} />
          <span style={{ fontSize: 12, color: "var(--crm-muted)", minWidth: 60, textAlign: "right" }}>{counts[t.id] || 0} aquí</span>
          <button className="crm-btn ghost sm" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
          <button className="crm-btn ghost sm" onClick={() => move(i, 1)} disabled={i === list.length - 1}>↓</button>
          <button className="crm-btn ghost sm" onClick={() => remove(i)} title="Quitar">✕</button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Nuevo tipo, p. ej. Distribuidor" style={{ flex: 1 }} />
        <button className="crm-btn sm" onClick={add}>+ Añadir</button>
      </div>
      {error && <div style={{ background: "#fdeef1", color: "#b0304c", padding: "9px 12px", borderRadius: 8, fontSize: 13, marginTop: 12 }}>{error}</div>}
    </CrmModal>
  );
}
