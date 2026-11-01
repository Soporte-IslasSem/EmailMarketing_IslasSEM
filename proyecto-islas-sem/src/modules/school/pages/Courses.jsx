// Escuela › Cursos: los cursos a los que se puede matricular el alumnado (salen en el formulario
// de alta) y lo que se estudia en cada uno (sale en el CV). Ajustes de la escuela (email de avisos).
import { useEffect, useMemo, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../../config/firebaseConfig";
import CrmModal from "../../crm/components/CrmModal";
import { useCrmCollection, crmCreate, crmUpdate, crmRemove } from "../../crm/lib/crm";
import { publicFormUrl } from "../lib/school";
import "../../crm/crm.styles.css";
import "../school.css";

// Los que pidió el cliente para empezar (se pueden cambiar o añadir más).
const STARTER = ["Comunicación Visual", "Diseño Gráfico", "Community Manager", "Social Media Marketing"];

export default function Courses() {
  const { items, loading, orgId } = useCrmCollection("schoolCourses");
  const { items: students } = useCrmCollection("students");
  const [edit, setEdit] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const rows = useMemo(() => [...items].sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || String(a.name).localeCompare(String(b.name))), [items]);

  const seed = async () => {
    setSeeding(true);
    try {
      const have = new Set(items.map((c) => String(c.name).toLowerCase()));
      let i = items.length;
      for (const name of STARTER) if (!have.has(name.toLowerCase())) await crmCreate("schoolCourses", orgId, { name, description: "", active: true, order: i++, modules: [] });
    } finally {
      setSeeding(false);
    }
  };
  const remove = async (c) => {
    const n = students.filter((s) => s.courseId === c.id).length;
    if (!window.confirm(n ? `${c.name} tiene ${n} alumno(s). Si lo eliminas, ellos se quedan pero sin curso en el formulario. ¿Mejor desactivarlo? Pulsa Aceptar para eliminarlo igualmente.` : `¿Eliminar ${c.name}?`)) return;
    await crmRemove("schoolCourses", c.id);
  };

  return (
    <div className="crm">
      <div className="crm__top">
        <div>
          <h1>Cursos de la escuela</h1>
          <p>Los cursos activos salen en el formulario de alta del alumnado; lo que se estudia en cada uno sale en su CV.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {STARTER.some((n) => !items.some((c) => String(c.name).toLowerCase() === n.toLowerCase())) && !loading && (
            <button className="crm-btn ghost" onClick={seed} disabled={seeding}>{seeding ? "Creando…" : "Crear los cursos iniciales"}</button>
          )}
          <button className="crm-btn" onClick={() => setEdit({ name: "", description: "", active: true, modules: [] })}>+ Nuevo curso</button>
        </div>
      </div>

      {loading ? <div className="crm-loading">Cargando…</div> : (
        <table className="crm-table">
          <thead><tr><th>Curso</th><th>Alumnos</th><th>Qué se estudia</th><th>Formulario</th><th></th></tr></thead>
          <tbody>
            {rows.length ? rows.map((c) => (
              <tr key={c.id}>
                <td><span className="crm-link" onClick={() => setEdit(c)}><b>{c.name}</b></span>{c.active === false && <span className="crm-chip bad" style={{ marginLeft: 6 }}>Desactivado</span>}
                  {c.description && <div style={{ fontSize: 12, color: "var(--crm-muted)" }}>{c.description}</div>}</td>
                <td>{students.filter((s) => s.courseId === c.id).length}</td>
                <td style={{ fontSize: 13 }}>{(c.modules || []).map((m) => m.title).join(", ") || <span style={{ color: "var(--crm-muted)" }}>—</span>}</td>
                <td><a className="crm-btn ghost sm" href={`${publicFormUrl()}?curso=${c.id}`} target="_blank" rel="noreferrer" title="Formulario con este curso ya elegido">Abrir ↗</a></td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <button className="crm-btn ghost sm" onClick={() => crmUpdate("schoolCourses", c.id, { active: c.active === false })}>{c.active === false ? "Activar" : "Desactivar"}</button>{" "}
                  <button className="crm-btn ghost sm" onClick={() => setEdit(c)}>✏️</button>{" "}
                  <button className="crm-btn ghost sm" onClick={() => remove(c)}>🗑</button>
                </td>
              </tr>
            )) : <tr><td colSpan="5" className="crm-empty">Aún no hay cursos. Pulsa «Crear los cursos iniciales» (Comunicación Visual, Diseño Gráfico, Community Manager y Social Media Marketing).</td></tr>}
          </tbody>
        </table>
      )}

      <SchoolSettings orgId={orgId} />
      {edit && <CourseModal c={edit} orgId={orgId} order={items.length} onClose={() => setEdit(null)} />}
    </div>
  );
}

function SchoolSettings({ orgId }) {
  const [s, setS] = useState(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!orgId) return;
    getDoc(doc(db, "schoolSettings", orgId)).then((d) => setS({ schoolName: "", notifyEmail: "", ...(d.data() || {}) })).catch(() => setS({ schoolName: "", notifyEmail: "" }));
  }, [orgId]);
  if (!s) return null;
  const save = async () => {
    await setDoc(doc(db, "schoolSettings", orgId), { schoolName: s.schoolName.trim(), notifyEmail: s.notifyEmail.trim().toLowerCase(), updatedAt: new Date() }, { merge: true });
    setSaved(true); setTimeout(() => setSaved(false), 1800);
  };
  return (
    <div className="crm-panel sc-cv" style={{ marginTop: 18 }}>
      <h4 style={{ marginTop: 0 }}>Ajustes de la escuela</h4>
      <div className="sc-two">
        <label>Nombre de la escuela <small>(sale en el formulario y en los correos)</small><input value={s.schoolName} onChange={(e) => setS({ ...s, schoolName: e.target.value })} placeholder="Escuela ISLAS SEM" /></label>
        <label>Email que recibe los avisos <small>(altas y solicitudes de entrevista)</small><input type="email" value={s.notifyEmail} onChange={(e) => setS({ ...s, notifyEmail: e.target.value })} placeholder="marketing@islassem.com" /></label>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button className="crm-btn sm" onClick={save}>{saved ? "✓ Guardado" : "Guardar"}</button>
        <span style={{ fontSize: 13, color: "var(--crm-muted)" }}>Formulario de alta: <a href={publicFormUrl()} target="_blank" rel="noreferrer">{publicFormUrl()}</a></span>
      </div>
    </div>
  );
}

function CourseModal({ c, orgId, order, onClose }) {
  const [f, setF] = useState({ name: c.name || "", description: c.description || "", active: c.active !== false, modules: c.modules || [] });
  const [busy, setBusy] = useState(false);
  const setM = (i, patch) => setF((x) => ({ ...x, modules: x.modules.map((m, j) => (j === i ? { ...m, ...patch } : m)) }));
  const save = async () => {
    if (!f.name.trim()) return;
    setBusy(true);
    const data = { ...f, name: f.name.trim(), modules: f.modules.filter((m) => String(m.title || "").trim()).map((m) => ({ title: m.title.trim(), tools: String(m.tools || "").trim() })) };
    try {
      if (c.id) await crmUpdate("schoolCourses", c.id, data);
      else await crmCreate("schoolCourses", orgId, { ...data, order });
      onClose();
    } catch (e) { alert(e.message); setBusy(false); }
  };
  return (
    <CrmModal title={c.id ? `Editar · ${c.name}` : "Nuevo curso"} onClose={onClose} maxWidth={640}
      footer={<><button className="crm-btn ghost" onClick={onClose}>Cancelar</button><button className="crm-btn" onClick={save} disabled={busy || !f.name.trim()}>{busy ? "Guardando…" : "Guardar"}</button></>}>
      <div className="sc-cv">
        <label>Nombre del curso *<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></label>
        <label>Descripción corta <small>(sale en el formulario al elegirlo)</small><input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
        <label className="sc-check" style={{ paddingTop: 0 }}><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Activo (sale en el formulario de alta)</label>
        <fieldset className="sc-fs"><legend>Qué se estudia <small style={{ fontWeight: 400 }}>(sale en el CV del alumno)</small></legend>
          {f.modules.map((m, i) => (
            <div key={i} className="sc-row"><div className="sc-row__body sc-two">
              <label>Módulo<input value={m.title} onChange={(e) => setM(i, { title: e.target.value })} placeholder="Ej. Diseño gráfico" /></label>
              <label>Herramientas<input value={m.tools} onChange={(e) => setM(i, { tools: e.target.value })} placeholder="Ej. Photoshop, Illustrator, Canva" /></label>
            </div><button type="button" className="sc-x" onClick={() => setF({ ...f, modules: f.modules.filter((_, j) => j !== i) })}>✕</button></div>
          ))}
          {f.modules.length < 12 && <button type="button" className="sc-add" onClick={() => setF({ ...f, modules: [...f.modules, { title: "", tools: "" }] })}>+ Añadir módulo</button>}
        </fieldset>
      </div>
    </CrmModal>
  );
}
