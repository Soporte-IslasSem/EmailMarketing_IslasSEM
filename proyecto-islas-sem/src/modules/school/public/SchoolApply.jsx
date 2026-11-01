// Formulario público de alta del alumnado (/alumnado): elige curso, rellena su CV y el servidor
// le genera el currículum en PDF (sin foto) y se lo envía por correo.
import { useEffect, useState } from "react";
import CvFields from "../components/CvFields";
import { EMPTY_CV, ORG, publicApi } from "../lib/school";
import "../school.css";

const RECAPTCHA_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || "";
function loadRecaptcha() {
  if (!RECAPTCHA_KEY || document.getElementById("recaptcha-v3")) return;
  const s = document.createElement("script");
  s.id = "recaptcha-v3";
  s.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_KEY}`;
  s.async = true;
  document.head.appendChild(s);
}
const recaptchaToken = () => new Promise((resolve, reject) => {
  if (!RECAPTCHA_KEY) return resolve("");
  const g = window.grecaptcha;
  if (!g) return reject(new Error("reCAPTCHA no cargó"));
  g.ready(() => g.execute(RECAPTCHA_KEY, { action: "school_apply" }).then(resolve, reject));
});

export default function SchoolApply() {
  const [info, setInfo] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [courseId, setCourseId] = useState(() => new URLSearchParams(window.location.search).get("curso") || "");
  const [cv, setCv] = useState(EMPTY_CV);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    loadRecaptcha();
    publicApi(`courses?org=${ORG}`).then(setInfo).catch((e) => setLoadErr(e.message));
  }, []);
  useEffect(() => { if (info) document.title = `Inscripción · ${info.school}`; }, [info]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!courseId) return setError("Elige el curso.");
    if (!consent) return setError("Tienes que aceptar la política de privacidad.");
    setBusy(true);
    try {
      const recaptcha = await recaptchaToken().catch(() => "");
      await publicApi("apply", { method: "POST", body: { org: ORG, courseId, ...cv, consent: true, recaptchaToken: recaptcha } });
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const color = info?.brand?.color || "#136b68";
  return (
    <div className="sc-page" style={{ "--sc-c": color }}>
      <header className="sc-hero">
        {info?.brand?.logoUrl && <img src={info.brand.logoUrl} alt={info.brand.name} />}
        <div><span className="sc-tag">{info?.school || "Escuela"}</span></div>
        <h1>Inscripción de alumnado</h1>
        <p>Apúntate a un curso y crea tu currículum en un momento. Lo usaremos para presentarte a empresas que buscan alumnado en prácticas.</p>
      </header>
      <main className="sc-body">
        {loadErr ? (
          <div className="sc-card"><div className="sc-err">No se pudo cargar el formulario: {loadErr}</div></div>
        ) : done ? (
          <div className="sc-card" style={{ textAlign: "center" }}>
            <h2 style={{ marginTop: 0 }}>✅ ¡Inscripción recibida!</h2>
            <p>Te hemos enviado a <b>{cv.email}</b> tu currículum en PDF. Si quieres cambiar algo, responde a ese correo.</p>
            <p className="sc-meta">Revisa también la carpeta de spam o promociones.</p>
          </div>
        ) : !info ? (
          <div className="sc-card">Cargando…</div>
        ) : (
          <form onSubmit={submit}>
            <div className="sc-card sc-cv">
              <label>Curso *
                <select value={courseId} onChange={(e) => setCourseId(e.target.value)} required>
                  <option value="">Elige el curso…</option>
                  {info.courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              {info.courses.find((c) => c.id === courseId)?.description && <p className="sc-hint">{info.courses.find((c) => c.id === courseId).description}</p>}
            </div>
            <CvFields value={cv} onChange={setCv} />
            <div className="sc-card">
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, cursor: "pointer" }}>
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 3 }} />
                <span>
                  He leído y acepto la <a href="https://islassem.com/politicas-de-privacidad" target="_blank" rel="noreferrer">política de privacidad</a>, y que
                  mi currículum (sin mi email ni mi teléfono) se comparta con las empresas colaboradoras que buscan alumnado en prácticas.
                </span>
              </label>
              {error && <div className="sc-err">{error}</div>}
              <button className="sc-btn" type="submit" disabled={busy} style={{ marginTop: 12, width: "100%", padding: 14 }}>
                {busy ? "Enviando y creando tu CV…" : "Enviar inscripción"}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
