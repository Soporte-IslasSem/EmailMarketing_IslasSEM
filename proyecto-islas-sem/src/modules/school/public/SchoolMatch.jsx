// Página para cada empresa de prácticas (/practicas/:token): sus candidatos, su CV y "Pedir entrevista".
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { matchCvUrl, publicApi } from "../lib/school";
import "../school.css";

const initials = (n) => String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase();

export default function SchoolMatch() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [ask, setAsk] = useState(null); // alumno para pedir entrevista

  useEffect(() => {
    publicApi(`match/${encodeURIComponent(token)}`).then(setData).catch((e) => setErr(e.message));
  }, [token]);
  useEffect(() => {
    if (data) document.title = `Candidatos para ${data.company.name} · ${data.school}`;
    const m = document.createElement("meta");
    m.name = "robots"; m.content = "noindex, nofollow";
    document.head.appendChild(m);
    return () => m.remove();
  }, [data]);

  if (err) return <div className="sc-page"><main className="sc-body" style={{ marginTop: 40 }}><div className="sc-card"><div className="sc-err">{err}</div></div></main></div>;
  if (!data) return <div className="sc-page"><main className="sc-body" style={{ marginTop: 40 }}><div className="sc-card">Cargando…</div></main></div>;

  const { brand, company, contact, students } = data;
  return (
    <div className="sc-page" style={{ "--sc-c": brand.color || "#136b68" }}>
      <header className="sc-hero">
        {brand.logoUrl && <img src={brand.logoUrl} alt={brand.name} />}
        <div><span className="sc-tag">{company.name}{company.city ? ` · ${company.city}` : ""}</span></div>
        <h1>Talento en prácticas para {company.name}</h1>
        {company.courses?.length > 0 && <div>{company.courses.map((c) => <span key={c} className="sc-pill">{c}</span>)}</div>}
      </header>
      <main className="sc-body">
        <div className="sc-card" style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <b>{contact.name ? `Tu contacto: ${contact.name}` : data.school}</b>
            <div className="sc-meta">Resolvemos dudas, ajustamos perfiles y coordinamos las entrevistas.</div>
            <div className="sc-meta">{[contact.email, contact.phone].filter(Boolean).join(" · ")}</div>
          </div>
          {contact.email && <a className="sc-btn" href={`mailto:${contact.email}`} style={{ textDecoration: "none" }}>Contactar</a>}
        </div>

        <div className="sc-card">
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <h2 style={{ margin: "0 0 4px" }}>Candidatos para {company.name}</h2>
            <span className="sc-chip"><b>{students.length}</b> perfil{students.length === 1 ? "" : "es"}{company.slots ? ` · ${company.slots} plaza${company.slots === 1 ? "" : "s"}` : ""}</span>
          </div>
          <p className="sc-meta" style={{ marginTop: 0 }}>Revisa el CV de cada perfil y, si encaja, pide una entrevista en menos de un minuto.</p>
          {students.length ? students.map((s) => (
            <div key={s.id} className="sc-cand">
              {s.isNew && <span className="sc-new">NUEVO</span>}
              <div className="sc-cand__av">{initials(s.name)}</div>
              <div className="sc-cand__main">
                <h3>{s.name}</h3>
                <div>{[s.course, ...s.specialties].filter(Boolean).map((x) => <span key={x} className="sc-chip">{x}</span>)}</div>
                <div className="sc-meta">{[s.hasCar && "🚗 Dispone de coche", s.city && `Ubicación: ${s.city}`].filter(Boolean).join(" · ")}</div>
              </div>
              <div className="sc-actions">
                {s.hasCv && <a className="sc-btn dark" href={matchCvUrl(token, s.id)} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>Ver CV</a>}
                <button className="sc-btn" onClick={() => setAsk(s)}>Pedir entrevista</button>
              </div>
            </div>
          )) : <p>Todavía no hay candidatos asignados. Te avisaremos en cuanto los haya.</p>}
        </div>
      </main>
      {ask && <InterviewModal token={token} student={ask} company={company.name} onClose={() => setAsk(null)} />}
    </div>
  );
}

function InterviewModal({ token, student, company, onClose }) {
  const [f, setF] = useState({ name: "", email: "", phone: "", message: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const send = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      await publicApi(`match/${encodeURIComponent(token)}/interview`, { method: "POST", body: { studentId: student.id, ...f } });
      setOk(true);
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,30,30,.55)", display: "grid", placeItems: "center", padding: 16, zIndex: 50 }}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={send} className="sc-card sc-cv" style={{ width: "100%", maxWidth: 480, margin: 0 }}>
        <h3 style={{ marginTop: 0 }}>Pedir entrevista con {student.name}</h3>
        {ok ? (
          <>
            <p>✅ Solicitud enviada. Te contactaremos para cerrar la entrevista.</p>
            <button type="button" className="sc-btn" onClick={onClose}>Cerrar</button>
          </>
        ) : (
          <>
            <p className="sc-meta" style={{ marginTop: 0 }}>{company}</p>
            <label>Tu nombre *<input value={f.name} onChange={set("name")} required maxLength={100} /></label>
            <div className="sc-two">
              <label>Email<input type="email" value={f.email} onChange={set("email")} maxLength={160} /></label>
              <label>Teléfono<input value={f.phone} onChange={set("phone")} maxLength={40} /></label>
            </div>
            <label>Mensaje <small>(días y horas que te vienen bien, etc.)</small><textarea rows={3} value={f.message} onChange={set("message")} maxLength={1500} /></label>
            {err && <div className="sc-err">{err}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="sc-btn ghost" onClick={onClose}>Cancelar</button>
              <button className="sc-btn" disabled={busy}>{busy ? "Enviando…" : "Enviar solicitud"}</button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
