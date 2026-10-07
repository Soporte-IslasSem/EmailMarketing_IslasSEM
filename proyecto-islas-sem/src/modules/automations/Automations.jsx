// Automatizaciones de Email Marketing: secuencias de correos que se disparan cuando un
// suscriptor entra en una lista. El backend (lib/automations.js) inscribe a los nuevos
// suscriptores y envía cada paso por la cola de correo cuando llega su momento.
import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db } from "../../config/firebaseConfig";
import { useAuth } from "../../shared/hooks/useAuth";
import useLists from "../lists/hooks/useLists";
import useTemplates from "../templates/hooks/useTemplates";
import CrmModal from "../crm/components/CrmModal";
import "../crm/crm.styles.css";

const UNITS = [
  { id: "minutes", label: "minutos" },
  { id: "hours", label: "horas" },
  { id: "days", label: "días" },
];
const newStep = (first) => ({ delayValue: first ? 0 : 2, delayUnit: first ? "minutes" : "days", subject: "", templateId: "" });
const emptyForm = { name: "", listId: "", steps: [newStep(true)] };
// Al activar, solo cuentan los suscriptores que entren a partir de ahora.
const activationPatch = () => ({ active: true, activatedAt: Date.now(), cursor: Date.now() });
const listChangePatch = () => ({ cursor: Date.now() });

function describeDelay(step, i) {
  const n = Number(step.delayValue) || 0;
  const unit = UNITS.find((u) => u.id === step.delayUnit)?.label || "días";
  if (i === 0) return n ? `${n} ${unit} después de suscribirse` : "Nada más suscribirse";
  return `${n} ${unit} después del correo anterior`;
}

export default function Automations() {
  const { user } = useAuth();
  const { lists } = useLists();
  const { templates } = useTemplates();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState(null); // null | {} nuevo | automatización
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "automations"), where("userId", "==", user.uid));
    return onSnapshot(
      q,
      (snap) => { setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setLoading(false); },
      (err) => { console.error("[automations]", err); setLoading(false); }
    );
  }, [user]);

  const listName = useMemo(() => Object.fromEntries(lists.map((l) => [l.id, l.name])), [lists]);
  const templateName = useMemo(() => Object.fromEntries(templates.map((t) => [t.id, t.name])), [templates]);

  const open = (a) => {
    setError("");
    setEdit(a || {});
    setForm(a ? { name: a.name, listId: a.trigger?.listId || "", steps: a.steps?.length ? a.steps.map((s) => ({ ...s })) : [newStep(true)] } : emptyForm);
  };

  const setStep = (i, patch) => setForm((f) => ({ ...f, steps: f.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));

  const save = async () => {
    if (!form.name.trim()) return setError("Pon un nombre a la automatización.");
    if (!form.listId) return setError("Elige la lista que la dispara.");
    const bad = form.steps.findIndex((s) => !s.subject.trim() || !s.templateId);
    if (bad >= 0) return setError(`El correo ${bad + 1} necesita asunto y plantilla.`);
    setSaving(true);
    try {
      const data = {
        name: form.name.trim(),
        trigger: { type: "list_subscribe", listId: form.listId },
        steps: form.steps.map((s) => ({
          delayValue: Math.max(0, Number(s.delayValue) || 0),
          delayUnit: s.delayUnit,
          subject: s.subject.trim(),
          templateId: s.templateId,
        })),
        updatedAt: serverTimestamp(),
      };
      if (edit.id) {
        // Cambiar la lista reinicia el punto de partida (no se escribe a toda la lista nueva).
        if (edit.trigger?.listId !== form.listId) Object.assign(data, listChangePatch());
        await updateDoc(doc(db, "automations", edit.id), data);
      } else {
        await addDoc(collection(db, "automations"), {
          ...data, userId: user.uid, active: false, stats: { enrolled: 0, sent: 0 }, createdAt: serverTimestamp(),
        });
      }
      setEdit(null);
    } catch (e) {
      setError("No se pudo guardar: " + (e.code || e.message));
    } finally {
      setSaving(false);
    }
  };

  const toggle = (a) => updateDoc(doc(db, "automations", a.id), a.active ? { active: false } : activationPatch());

  const remove = (a) =>
    window.confirm(`¿Eliminar la automatización "${a.name}"? Los correos ya enviados no se ven afectados.`) &&
    deleteDoc(doc(db, "automations", a.id));

  return (
    <div className="crm">
      <div className="crm__top">
        <div>
          <h1>Automatizaciones</h1>
          <p>Secuencias de correos que se envían solas cuando alguien se suscribe a una lista (bienvenida, seguimiento…).</p>
        </div>
        <button className="crm-btn" onClick={() => open(null)}>+ Nueva automatización</button>
      </div>

      {loading ? (
        <div className="crm-loading">Cargando…</div>
      ) : items.length ? (
        <div style={{ display: "grid", gap: 14 }}>
          {items.map((a) => (
            <div key={a.id} className="crm-panel">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <h4 style={{ margin: 0 }}>
                    {a.name}{" "}
                    <span className={`crm-chip ${a.active ? "ok" : ""}`}>{a.active ? "Activa" : "Pausada"}</span>
                  </h4>
                  <p style={{ margin: "6px 0 0", color: "var(--crm-muted)", fontSize: 14 }}>
                    Se dispara al suscribirse a <b>{listName[a.trigger?.listId] || "una lista eliminada"}</b> ·{" "}
                    {a.stats?.enrolled || 0} inscritos · {a.stats?.sent || 0} correos enviados
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className={`crm-btn sm ${a.active ? "ghost" : ""}`} onClick={() => toggle(a)}>
                    {a.active ? "Pausar" : "Activar"}
                  </button>
                  <button className="crm-btn ghost sm" onClick={() => open(a)}>Editar</button>
                  <button className="crm-btn ghost sm" onClick={() => remove(a)}>✕</button>
                </div>
              </div>
              <ol style={{ margin: "12px 0 0", paddingLeft: 20, fontSize: 14 }}>
                {(a.steps || []).map((s, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>
                    <b>{s.subject}</b> — {templateName[s.templateId] || "plantilla eliminada"}{" "}
                    <span style={{ color: "var(--crm-muted)" }}>({describeDelay(s, i)})</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      ) : (
        <div className="crm-panel" style={{ textAlign: "center", padding: "40px 20px" }}>
          <p style={{ margin: "0 0 12px" }}>Aún no hay automatizaciones.</p>
          <p style={{ margin: 0, color: "var(--crm-muted)", fontSize: 14 }}>
            Ejemplo: al suscribirse a "Newsletter" → correo de bienvenida al momento → a los 3 días, un correo con vuestros servicios.
          </p>
        </div>
      )}

      {edit && (
        <CrmModal
          title={edit.id ? "Editar automatización" : "Nueva automatización"}
          onClose={() => setEdit(null)}
          maxWidth={720}
          footer={
            <>
              <button className="crm-btn ghost" onClick={() => setEdit(null)}>Cancelar</button>
              <button className="crm-btn" onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</button>
            </>
          }
        >
          <div className="crm-field">
            <label>Nombre</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="p. ej. Bienvenida newsletter" autoFocus />
          </div>
          <div className="crm-field">
            <label>Se dispara cuando alguien se suscribe a la lista…</label>
            <select value={form.listId} onChange={(e) => setForm({ ...form, listId: e.target.value })}>
              <option value="">— elegir lista —</option>
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>

          <h4 style={{ margin: "16px 0 8px" }}>Correos de la secuencia</h4>
          {form.steps.map((s, i) => (
            <div key={i} style={{ border: "1px solid #e3ecec", borderRadius: 10, padding: 12, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <b>Correo {i + 1}</b>
                {form.steps.length > 1 && (
                  <button className="crm-btn ghost sm" onClick={() => setForm((f) => ({ ...f, steps: f.steps.filter((_, j) => j !== i) }))}>Quitar</button>
                )}
              </div>
              <div className="crm-two">
                <div className="crm-field">
                  <label>{i === 0 ? "Esperar tras suscribirse" : "Esperar tras el correo anterior"}</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input type="number" min="0" style={{ width: 90 }} value={s.delayValue} onChange={(e) => setStep(i, { delayValue: e.target.value })} />
                    <select value={s.delayUnit} onChange={(e) => setStep(i, { delayUnit: e.target.value })}>
                      {UNITS.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="crm-field">
                  <label>Plantilla</label>
                  <select value={s.templateId} onChange={(e) => setStep(i, { templateId: e.target.value })}>
                    <option value="">— elegir plantilla —</option>
                    {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="crm-field">
                <label>Asunto</label>
                <input value={s.subject} onChange={(e) => setStep(i, { subject: e.target.value })} placeholder="p. ej. ¡Bienvenido a ISLAS SEM!" />
              </div>
            </div>
          ))}
          <button className="crm-btn ghost sm" onClick={() => setForm((f) => ({ ...f, steps: [...f.steps, newStep(false)] }))}>+ Añadir correo</button>
          {!templates.length && (
            <p style={{ color: "#b0304c", fontSize: 13 }}>Primero crea una plantilla en Email Marketing › Plantillas.</p>
          )}
          <p style={{ color: "var(--crm-muted)", fontSize: 12.5, marginTop: 12 }}>
            Se crea pausada. Al activarla solo se incluye a quien se suscriba a partir de ese momento. Los suscriptores dados de baja o rebotados se saltan.
          </p>
          {error && <p style={{ color: "#b0304c", fontSize: 13, margin: "8px 0 0" }}>{error}</p>}
        </CrmModal>
      )}
    </div>
  );
}
