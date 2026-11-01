// Escuela › Empresas de prácticas: empresas que se dieron de alta para coger alumnado, cuántos
// alumnos piden y de qué cursos, su enlace (/practicas/…) con los candidatos asignados y las
// solicitudes de entrevista que hacen desde ahí.
import { useMemo, useState } from "react";
import { arrayRemove, arrayUnion } from "firebase/firestore";
import CrmModal from "../../crm/components/CrmModal";
import { useCrmCollection, crmCreate, crmUpdate, crmRemove, fmtDate } from "../../crm/lib/crm";
import { useAuth } from "../../../shared/hooks/useAuth.jsx";
import { fullName, matchUrl, newPlacementToken, openCv } from "../lib/school";
import "../../crm/crm.styles.css";
import "../school.css";

const IV_STATUS = ["Nueva", "Contactada", "Entrevista fijada", "Aceptado/a", "Descartada"];

export default function Placements() {
  const { items: placements, loading, orgId } = useCrmCollection("schoolPlacements");
  const { items: students } = useCrmCollection("students");
  const { items: courses } = useCrmCollection("schoolCourses");
  const { items: interviews } = useCrmCollection("schoolInterviews");
  const [edit, setEdit] = useState(null);
  const [open, setOpen] = useState("");
  const [copied, setCopied] = useState("");

  const rows = useMemo(() => [...placements].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)), [placements]);
  const copy = (p) => navigator.clipboard?.writeText(matchUrl(p.token)).then(() => { setCopied(p.id); setTimeout(() => setCopied(""), 1800); });
  const remove = async (p) => {
    if (!window.confirm(`¿Eliminar ${p.companyName}? Su enlace dejará de funcionar. Va a la papelera del CRM.`)) return;
    await crmRemove("schoolPlacements", p.id);
  };

  return (
    <div className="crm">
      <div className="crm__top">
        <div>
          <h1>Empresas de prácticas</h1>
          <p>Empresas que cogen alumnado en prácticas: cuántos alumnos piden, a quién se los asignas y su página con los candidatos.</p>
        </div>
        <button className="crm-btn" onClick={() => setEdit({ companyName: "", city: "", slots: 1, courseIds: [], active: true })}>+ Añadir empresa</button>
      </div>

      {loading ? <div className="crm-loading">Cargando…</div> : (
        <table className="crm-table">
          <thead><tr><th>Empresa</th><th>Cursos que busca</th><th>Plazas</th><th>Entrevistas</th><th>Página de la empresa</th><th></th></tr></thead>
          <tbody>
            {rows.length ? rows.map((p) => {
              const ivs = interviews.filter((i) => i.placementId === p.id);
              const n = (p.studentIds || []).length;
              return [
                <tr key={p.id}>
                  <td>
                    <span className="crm-link" onClick={() => setOpen(open === p.id ? "" : p.id)}><b>{p.companyName}</b></span>
                    {p.active === false && <span className="crm-chip bad" style={{ marginLeft: 6 }}>Pausada</span>}
                    <div style={{ fontSize: 12, color: "var(--crm-muted)" }}>{[p.city, p.contactName, p.contactEmail].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td>{(p.courseNames || []).map((c) => <span key={c} className="crm-chip" style={{ marginRight: 4 }}>{c}</span>)}{!(p.courseNames || []).length && "Cualquiera"}</td>
                  <td><span className={`crm-chip ${p.slots && n >= p.slots ? "ok" : "warn"}`}>{n} / {p.slots || "∞"}</span></td>
                  <td>{ivs.length ? <span className={`crm-chip ${ivs.some((i) => i.status === "Nueva") ? "info" : ""}`}>{ivs.length}{ivs.some((i) => i.status === "Nueva") ? ` · ${ivs.filter((i) => i.status === "Nueva").length} nueva(s)` : ""}</span> : "—"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="crm-btn ghost sm" onClick={() => copy(p)}>{copied === p.id ? "✓ Copiado" : "🔗 Copiar enlace"}</button>{" "}
                    <a className="crm-btn ghost sm" href={matchUrl(p.token)} target="_blank" rel="noreferrer">Abrir ↗</a>
                  </td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <button className="crm-btn ghost sm" onClick={() => setOpen(open === p.id ? "" : p.id)}>{open === p.id ? "Cerrar" : "Alumnos"}</button>{" "}
                    <button className="crm-btn ghost sm" onClick={() => setEdit(p)}>✏️</button>{" "}
                    <button className="crm-btn ghost sm" onClick={() => remove(p)}>🗑</button>
                  </td>
                </tr>,
                open === p.id && (
                  <tr key={p.id + "-d"}><td colSpan="6" style={{ background: "#f7fafa" }}>
                    <PlacementDetail p={p} students={students} interviews={ivs} />
                  </td></tr>
                ),
              ];
            }) : <tr><td colSpan="6" className="crm-empty">Aún no hay empresas. Añade la primera para asignarle alumnado y mandarle su enlace.</td></tr>}
          </tbody>
        </table>
      )}

      {edit && <PlacementModal p={edit} courses={courses} orgId={orgId} onClose={() => setEdit(null)} />}
    </div>
  );
}

function PlacementDetail({ p, students, interviews }) {
  const [pick, setPick] = useState("");
  const assigned = (p.studentIds || []).map((id) => students.find((s) => s.id === id)).filter(Boolean);
  const candidates = students
    .filter((s) => !(p.studentIds || []).includes(s.id) && !["Finalizado", "Descartado", "En prácticas"].includes(s.status))
    .filter((s) => !(p.courseIds || []).length || (p.courseIds || []).includes(s.courseId))
    .sort((a, b) => fullName(a).localeCompare(fullName(b)));
  const add = async () => {
    if (!pick) return;
    await crmUpdate("schoolPlacements", p.id, { studentIds: arrayUnion(pick), [`assignedAt.${pick}`]: Date.now() });
    const s = students.find((x) => x.id === pick);
    if (["Nuevo", "Disponible", undefined, ""].includes(s?.status)) await crmUpdate("students", pick, { status: "Asignado" });
    setPick("");
  };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16 }}>
      <div>
        <h4 style={{ margin: "4px 0 8px" }}>Alumnos asignados ({assigned.length}/{p.slots || "∞"}) <small style={{ fontWeight: 400, color: "var(--crm-muted)" }}>— los ve en su página</small></h4>
        {assigned.map((s) => (
          <div key={s.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "5px 0", borderBottom: "1px solid var(--crm-line)" }}>
            <span style={{ flex: 1 }}><b>{fullName(s)}</b> <span style={{ fontSize: 12, color: "var(--crm-muted)" }}>{s.courseName} · {s.status || "Nuevo"}</span></span>
            <button className="crm-btn ghost sm" onClick={() => openCv(s.id).catch((e) => alert(e.message))}>📄 CV</button>
            <button className="crm-btn ghost sm" onClick={() => window.confirm("¿Quitar de esta empresa?") && crmUpdate("schoolPlacements", p.id, { studentIds: arrayRemove(s.id) })}>✕</button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <select className="crm-search" style={{ margin: 0, flex: 1 }} value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Añadir alumno{(p.courseIds || []).length ? " (de sus cursos)" : ""}…</option>
            {candidates.map((s) => <option key={s.id} value={s.id}>{fullName(s)} · {s.courseName}{s.city ? ` · ${s.city}` : ""}</option>)}
          </select>
          <button className="crm-btn sm" disabled={!pick} onClick={add}>Añadir</button>
        </div>
      </div>
      <div>
        <h4 style={{ margin: "4px 0 8px" }}>Solicitudes de entrevista ({interviews.length})</h4>
        {interviews.length ? [...interviews].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).map((i) => (
          <div key={i.id} style={{ padding: "6px 0", borderBottom: "1px solid var(--crm-line)", fontSize: 13 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <b style={{ flex: 1 }}>{i.studentName}</b>
              <select className="crm-chip" style={{ border: "none", cursor: "pointer" }} value={i.status || "Nueva"} onChange={(e) => crmUpdate("schoolInterviews", i.id, { status: e.target.value })}>
                {IV_STATUS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ color: "var(--crm-muted)" }}>{fmtDate(i.createdAt)} · {[i.name, i.email, i.phone].filter(Boolean).join(" · ")}</div>
            {i.message && <div style={{ whiteSpace: "pre-wrap" }}>{i.message}</div>}
          </div>
        )) : <p style={{ color: "var(--crm-muted)", fontSize: 13 }}>Ninguna todavía. Llegan desde su página (botón «Pedir entrevista») y te avisamos por correo.</p>}
      </div>
    </div>
  );
}

function PlacementModal({ p, courses, orgId, onClose }) {
  const { user } = useAuth();
  const { items: companies } = useCrmCollection("companies");
  const [f, setF] = useState({
    companyName: p.companyName || "", city: p.city || "", slots: p.slots ?? 1, courseIds: p.courseIds || [], active: p.active !== false,
    contactName: p.contactName || "", contactEmail: p.contactEmail || "", contactPhone: p.contactPhone || "",
    managerName: p.managerName || "", managerEmail: p.managerEmail || user?.email || "", managerPhone: p.managerPhone || "", notes: p.notes || "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const toggleCourse = (id) => setF((x) => ({ ...x, courseIds: x.courseIds.includes(id) ? x.courseIds.filter((c) => c !== id) : [...x.courseIds, id] }));
  const save = async () => {
    if (!f.companyName.trim()) return setErr("Escribe el nombre de la empresa.");
    setBusy(true); setErr("");
    try {
      const company = companies.find((c) => String(c.name || "").trim().toLowerCase() === f.companyName.trim().toLowerCase());
      const data = {
        ...f, companyName: f.companyName.trim(), slots: Math.max(0, parseInt(f.slots, 10) || 0), companyId: company?.id || "",
        courseNames: f.courseIds.map((id) => courses.find((c) => c.id === id)?.name).filter(Boolean),
        contactEmail: f.contactEmail.trim().toLowerCase(), managerEmail: f.managerEmail.trim().toLowerCase(),
      };
      if (p.id) await crmUpdate("schoolPlacements", p.id, data);
      else await crmCreate("schoolPlacements", orgId, { ...data, token: await newPlacementToken(), studentIds: [], assignedAt: {} });
      onClose();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };
  return (
    <CrmModal title={p.id ? `Editar · ${p.companyName}` : "Añadir empresa de prácticas"} onClose={onClose} maxWidth={680}
      footer={<><button className="crm-btn ghost" onClick={onClose}>Cancelar</button><button className="crm-btn" onClick={save} disabled={busy}>{busy ? "Guardando…" : "Guardar"}</button></>}>
      {err && <div style={{ background: "#fdeef1", color: "#b0304c", padding: "9px 12px", borderRadius: 8, fontSize: 13, marginBottom: 10 }}>{err}</div>}
      <div className="sc-cv">
        <div className="sc-two">
          <label>Empresa *<input value={f.companyName} onChange={set("companyName")} list="sc-companies" placeholder="Nombre de la empresa" />
            <datalist id="sc-companies">{companies.map((c) => <option key={c.id} value={c.name} />)}</datalist>
          </label>
          <label>Ciudad<input value={f.city} onChange={set("city")} /></label>
        </div>
        <div className="sc-two">
          <label>Nº de alumnos que pide<input type="number" min="0" value={f.slots} onChange={set("slots")} /></label>
          <label className="sc-check"><input type="checkbox" checked={f.active} onChange={set("active")} /> Activa (su enlace funciona)</label>
        </div>
        <label>Cursos que le interesan <small>(sin marcar = cualquiera)</small></label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {courses.map((c) => (
            <button type="button" key={c.id} className={`crm-chip ${f.courseIds.includes(c.id) ? "info" : ""}`} style={{ cursor: "pointer", border: f.courseIds.includes(c.id) ? "none" : "1px solid var(--crm-line)" }} onClick={() => toggleCourse(c.id)}>
              {f.courseIds.includes(c.id) ? "✓ " : ""}{c.name}
            </button>
          ))}
          {!courses.length && <span style={{ fontSize: 13, color: "var(--crm-muted)" }}>Crea antes los cursos en Escuela › Cursos.</span>}
        </div>
        <fieldset className="sc-fs"><legend>Persona de contacto en la empresa</legend>
          <div className="sc-two">
            <label>Nombre<input value={f.contactName} onChange={set("contactName")} /></label>
            <label>Email<input type="email" value={f.contactEmail} onChange={set("contactEmail")} /></label>
          </div>
          <label>Teléfono<input value={f.contactPhone} onChange={set("contactPhone")} /></label>
        </fieldset>
        <fieldset className="sc-fs"><legend>Quién la atiende en la escuela <small style={{ fontWeight: 400 }}>(sale en su página y recibe las solicitudes)</small></legend>
          <div className="sc-two">
            <label>Nombre<input value={f.managerName} onChange={set("managerName")} /></label>
            <label>Email<input type="email" value={f.managerEmail} onChange={set("managerEmail")} /></label>
          </div>
          <label>Teléfono<input value={f.managerPhone} onChange={set("managerPhone")} /></label>
        </fieldset>
        <label>Notas internas<textarea rows={2} value={f.notes} onChange={set("notes")} /></label>
      </div>
    </CrmModal>
  );
}
