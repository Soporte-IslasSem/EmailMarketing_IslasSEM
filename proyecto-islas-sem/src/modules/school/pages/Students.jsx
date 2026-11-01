// Escuela › Alumnado prácticas: alumnos inscritos, filtros por curso/estado/empresa, su CV en PDF
// y asignación a empresas de prácticas.
import { useMemo, useState } from "react";
import { arrayRemove, arrayUnion } from "firebase/firestore";
import CrmModal from "../../crm/components/CrmModal";
import { useCrmCollection, crmCreate, crmUpdate, crmRemove, fmtDate } from "../../crm/lib/crm";
import { exportCsv } from "../../crm/lib/exportCsv";
import CvFields from "../components/CvFields";
import { EMPTY_CV, STATUSES, statusClass, fullName, openCv, regenerateCv, publicFormUrl } from "../lib/school";
import "../../crm/crm.styles.css";
import "../school.css";

export default function Students() {
  const { items: students, loading, orgId } = useCrmCollection("students");
  const { items: courses } = useCrmCollection("schoolCourses");
  const { items: placements } = useCrmCollection("schoolPlacements");
  const [course, setCourse] = useState("");
  const [status, setStatus] = useState("");
  const [placement, setPlacement] = useState("");
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [edit, setEdit] = useState(null);
  const [assignTo, setAssignTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const placementsOf = (id) => placements.filter((p) => (p.studentIds || []).includes(id));
  const counts = useMemo(() => {
    const c = {};
    students.forEach((s) => { c[s.courseId] = (c[s.courseId] || 0) + 1; });
    return c;
  }, [students]);
  const rows = useMemo(() => {
    const t = term.trim().toLowerCase();
    return students
      .filter((s) => !course || s.courseId === course)
      .filter((s) => !status || (s.status || "Nuevo") === status)
      .filter((s) => !placement || (placement === "__none" ? !placementsOf(s.id).length : placementsOf(s.id).some((p) => p.id === placement)))
      .filter((s) => !t || [fullName(s), s.email, s.phone, s.city, s.courseName, s.headline, ...(s.specialties || [])].some((v) => String(v || "").toLowerCase().includes(t)))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, placements, course, status, placement, term]);

  const toggle = (id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const assign = async () => {
    const p = placements.find((x) => x.id === assignTo);
    if (!p || !selected.size) return;
    const ids = [...selected].filter((id) => !(p.studentIds || []).includes(id));
    const total = (p.studentIds || []).length + ids.length;
    if (p.slots && total > p.slots && !window.confirm(`${p.companyName} pidió ${p.slots} alumno(s) y tendría ${total}. ¿Asignar igualmente?`)) return;
    setBusy(true);
    try {
      const now = Date.now();
      await crmUpdate("schoolPlacements", p.id, { studentIds: arrayUnion(...ids), ...Object.fromEntries(ids.map((id) => [`assignedAt.${id}`, now])) });
      await Promise.all(ids.map((id) => {
        const s = students.find((x) => x.id === id);
        return ["Nuevo", "Disponible", undefined, ""].includes(s?.status) ? crmUpdate("students", id, { status: "Asignado" }) : null;
      }));
      setSelected(new Set());
      setAssignTo("");
    } catch (e) {
      alert("No se pudo asignar: " + e.message);
    } finally {
      setBusy(false);
    }
  };
  const unassign = async (p, id) => {
    if (!window.confirm(`¿Quitar a este alumno de ${p.companyName}? Dejará de verlo en su página.`)) return;
    await crmUpdate("schoolPlacements", p.id, { studentIds: arrayRemove(id) });
  };

  const remove = async (s) => {
    if (!window.confirm(`¿Eliminar a ${fullName(s)}? Va a la papelera del CRM.`)) return;
    await Promise.all(placementsOf(s.id).map((p) => crmUpdate("schoolPlacements", p.id, { studentIds: arrayRemove(s.id) })));
    await crmRemove("students", s.id);
  };

  const copyForm = () => {
    navigator.clipboard?.writeText(publicFormUrl()).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); });
  };

  return (
    <div className="crm">
      <div className="crm__top">
        <div>
          <h1>Alumnado prácticas</h1>
          <p>Inscritos en los cursos de la escuela · {students.length} alumnos · su CV se genera solo al inscribirse</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="crm-btn ghost" onClick={copyForm} title={publicFormUrl()}>{copied ? "✓ Enlace copiado" : "🔗 Enlace del formulario de alta"}</button>
          <button className="crm-btn ghost" disabled={!rows.length} onClick={() => exportCsv("alumnado", rows, [
            ["Nombre", (s) => s.firstName], ["Apellidos", (s) => s.lastName], ["Email", (s) => s.email], ["Teléfono", (s) => s.phone],
            ["Curso", (s) => s.courseName], ["Estado", (s) => s.status || "Nuevo"], ["Ciudad", (s) => s.city], ["Coche", (s) => (s.hasCar ? "Sí" : "No")],
            ["Especialidades", (s) => s.specialties], ["Empresas", (s) => placementsOf(s.id).map((p) => p.companyName)], ["Alta", (s) => fmtDate(s.createdAt)],
          ])}>⬇ Exportar ({rows.length})</button>
          <button className="crm-btn" onClick={() => setEdit({ ...EMPTY_CV, courseId: courses[0]?.id || "", status: "Disponible" })}>+ Añadir alumno</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        <button className={`crm-chip ${!course ? "info" : ""}`} style={{ cursor: "pointer", border: course ? "1px solid var(--crm-line)" : "none" }} onClick={() => setCourse("")}>Todos ({students.length})</button>
        {courses.map((c) => (
          <button key={c.id} className={`crm-chip ${course === c.id ? "info" : ""}`} style={{ cursor: "pointer", border: course === c.id ? "none" : "1px solid var(--crm-line)" }} onClick={() => setCourse(c.id)}>
            {c.name} ({counts[c.id] || 0})
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <input className="crm-search" style={{ margin: 0, flex: 1, minWidth: 220 }} placeholder="Buscar por nombre, email, ciudad, especialidad…" value={term} onChange={(e) => setTerm(e.target.value)} />
        <select className="crm-search" style={{ margin: 0, maxWidth: 180 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos los estados</option>
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="crm-search" style={{ margin: 0, maxWidth: 220 }} value={placement} onChange={(e) => setPlacement(e.target.value)}>
          <option value="">Todas las empresas</option>
          <option value="__none">— Sin empresa asignada —</option>
          {placements.map((p) => <option key={p.id} value={p.id}>{p.companyName}</option>)}
        </select>
        <span style={{ fontSize: 13, color: "var(--crm-muted)" }}>{rows.length} resultados</span>
      </div>

      {selected.size > 0 && (
        <div className="crm-panel" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "10px 14px" }}>
          <b>{selected.size} seleccionado(s)</b>
          <span style={{ flex: 1 }} />
          <select className="crm-search" style={{ margin: 0, maxWidth: 280 }} value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
            <option value="">Asignar a la empresa…</option>
            {placements.filter((p) => p.active !== false).map((p) => (
              <option key={p.id} value={p.id}>{p.companyName} · {(p.studentIds || []).length}/{p.slots || "∞"} plazas</option>
            ))}
          </select>
          <button className="crm-btn sm" disabled={!assignTo || busy} onClick={assign}>{busy ? "Asignando…" : "Asignar"}</button>
          <button className="crm-btn ghost sm" onClick={() => setSelected(new Set())}>Quitar selección</button>
        </div>
      )}

      {loading ? <div className="crm-loading">Cargando…</div> : (
        <table className="crm-table">
          <thead>
            <tr>
              <th style={{ width: 30 }}><input type="checkbox" checked={allOn} onChange={() => setSelected(allOn ? new Set() : new Set(rows.map((r) => r.id)))} /></th>
              <th>Alumno</th><th>Curso</th><th>Especialidades</th><th>Estado</th><th>Empresa</th><th>Alta</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((s) => (
              <tr key={s.id}>
                <td><input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} /></td>
                <td>
                  <span className="crm-link" onClick={() => setEdit(s)}><b>{fullName(s)}</b></span>
                  <div style={{ fontSize: 12, color: "var(--crm-muted)" }}>{[s.email, s.phone].filter(Boolean).join(" · ")}</div>
                  <div style={{ fontSize: 12, color: "var(--crm-muted)" }}>{[s.city, s.hasCar && "🚗 coche"].filter(Boolean).join(" · ")}</div>
                </td>
                <td>{s.courseName || "—"}</td>
                <td style={{ maxWidth: 220 }}>{(s.specialties || []).slice(0, 4).map((x) => <span key={x} className="crm-chip" style={{ marginRight: 4 }}>{x}</span>)}</td>
                <td>
                  <select className={`crm-chip ${statusClass(s.status || "Nuevo")}`} style={{ border: "none", cursor: "pointer" }} value={s.status || "Nuevo"} onChange={(e) => crmUpdate("students", s.id, { status: e.target.value })}>
                    {STATUSES.map((x) => <option key={x}>{x}</option>)}
                  </select>
                </td>
                <td>
                  {placementsOf(s.id).length ? placementsOf(s.id).map((p) => (
                    <div key={p.id} style={{ fontSize: 13 }}>{p.companyName} <span title="Quitar de esta empresa" style={{ cursor: "pointer", color: "#b0304c" }} onClick={() => unassign(p, s.id)}>✕</span></div>
                  )) : <span style={{ color: "var(--crm-muted)" }}>—</span>}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>{fmtDate(s.createdAt)}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <button className="crm-btn ghost sm" onClick={() => openCv(s.id).catch((e) => alert(e.message))}>📄 CV</button>{" "}
                  <button className="crm-btn ghost sm" onClick={() => setEdit(s)}>✏️</button>{" "}
                  <button className="crm-btn ghost sm" onClick={() => remove(s)}>🗑</button>
                </td>
              </tr>
            )) : <tr><td colSpan="8" className="crm-empty">{students.length ? "Ningún alumno con estos filtros." : "Aún no hay alumnos. Comparte el enlace del formulario de alta."}</td></tr>}
          </tbody>
        </table>
      )}

      {edit && <StudentModal student={edit} courses={courses} orgId={orgId} onClose={() => setEdit(null)} />}
    </div>
  );
}

function StudentModal({ student, courses, orgId, onClose }) {
  const isNew = !student.id;
  const [cv, setCv] = useState(() => ({ ...EMPTY_CV, ...student }));
  const [courseId, setCourseId] = useState(student.courseId || "");
  const [status, setStatus] = useState(student.status || "Nuevo");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const save = async () => {
    setErr("");
    if (!cv.firstName.trim() || !cv.email.trim()) return setErr("Nombre y email son obligatorios.");
    const c = courses.find((x) => x.id === courseId);
    const data = {
      firstName: cv.firstName.trim(), lastName: cv.lastName.trim(), email: cv.email.trim().toLowerCase(), phone: cv.phone, city: cv.city, hasCar: !!cv.hasCar,
      headline: cv.headline, specialties: cv.specialties, profile: cv.profile, experience: cv.experience, education: cv.education,
      skills: cv.skills, competencies: cv.competencies, languages: cv.languages, courseId, courseName: c?.name || "", status,
    };
    setBusy("Guardando…");
    try {
      const id = isNew ? (await crmCreate("students", orgId, { ...data, source: "Alta manual" })).id : (await crmUpdate("students", student.id, data), student.id);
      setBusy("Creando el CV…");
      await regenerateCv(id);
      onClose();
    } catch (e) {
      setErr(e.message);
      setBusy("");
    }
  };
  return (
    <CrmModal title={isNew ? "Añadir alumno" : fullName(student)} onClose={onClose} maxWidth={760}
      footer={<>
        {!isNew && <button className="crm-btn ghost" onClick={() => openCv(student.id).catch((e) => alert(e.message))} style={{ marginRight: "auto" }}>📄 Ver CV actual</button>}
        <button className="crm-btn ghost" onClick={onClose}>Cancelar</button>
        <button className="crm-btn" onClick={save} disabled={!!busy}>{busy || "Guardar y regenerar CV"}</button>
      </>}>
      {err && <div style={{ background: "#fdeef1", color: "#b0304c", padding: "9px 12px", borderRadius: 8, fontSize: 13, marginBottom: 10 }}>{err}</div>}
      <div className="sc-cv">
        <div className="sc-two">
          <label>Curso<select value={courseId} onChange={(e) => setCourseId(e.target.value)}><option value="">—</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label>Estado<select value={status} onChange={(e) => setStatus(e.target.value)}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></label>
        </div>
      </div>
      <CvFields value={cv} onChange={setCv} />
      {!isNew && student.consentAt && <p style={{ fontSize: 12, color: "var(--crm-muted)" }}>Consentimiento RGPD aceptado el {fmtDate(student.consentAt)} (formulario web).</p>}
    </CrmModal>
  );
}
