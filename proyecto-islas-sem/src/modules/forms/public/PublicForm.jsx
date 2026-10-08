// Formularios PÚBLICOS rellenables (sin login): los fijos replicados del Bitrix real de
// ISLAS SEM (Orden de Domiciliación SEPA y Solicitud Datos Jurídicos, en builtinForms.js)
// y los creados en CRM › Formularios (se cargan de /api/forms/def/:id). Diseño clavado al prototipo:
// título centrado, nombre del campo DENTRO del input (placeholder), consentimiento
// con subtítulo teal + checkbox.
// Envío: con VITE_RECAPTCHA_SITE_KEY configurada, pasa por reCAPTCHA v3 y el backend
// (que verifica el token y guarda). Sin ella, escribe directo en Firestore (formSubmissions).
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../../../config/firebaseConfig";
import { BUILTIN_FORMS } from "./builtinForms";

const DEFAULT_ORG_ID = "islas-sem";
const RECAPTCHA_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || "";
const API_BASE = import.meta.env.VITE_API_BASE || "https://email-marketing.islassem.com/api";

function loadRecaptcha() {
  if (!RECAPTCHA_KEY || document.getElementById("recaptcha-v3")) return;
  const s = document.createElement("script");
  s.id = "recaptcha-v3";
  s.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_KEY}`;
  s.async = true;
  document.head.appendChild(s);
}

function recaptchaToken() {
  return new Promise((resolve, reject) => {
    const g = window.grecaptcha;
    if (!g) return reject(new Error("reCAPTCHA no cargó"));
    g.ready(() => g.execute(RECAPTCHA_KEY, { action: "form_submit" }).then(resolve, reject));
  });
}

// Texto RGPD del modal de privacidad (idéntico al prototipo).
const RGPD = [
  ["Responsable: Islas SEM, SLU Dirección:", "c/Párroco Hernández Benítez 7, Bajo, Oficina 0 – 35200 Telde (Las Palmas) – correo electrónico: miempresa@protegesusdatos.com – teléfono: 828 074 620"],
  ["Finalidad:", "gestionar la petición del interesado/a"],
  ["Publicidad:", "no le haremos publicidad sin su consentimiento"],
  ["Legitimación:", "consentimiento de la interesada/o"],
  ["Cesión de datos:", "los destinatarios serán colaboradores/as y/o por obligación legal"],
  ["Conservación de los datos:", "por un tiempo indefinido y/o según relación contractual"],
  ["Derechos del interesado:", "tienen derecho al acceso, supresión, limitación, eliminación, portabilidad de sus datos ejerciéndolos en la dirección, teléfono o correo electrónico de la empresa, en caso de no ser atendida su petición puede ejercer sus derechos ante la Agencia Española de Protección de Datos"],
];

// Forma común para pintar cualquier formulario: fijo original, fijo editado o creado.
function normalize(def, builtin) {
  if (!def) {
    return {
      title: builtin.title, desc: builtin.desc, btn: "ENVIAR", color: "#1A9190", bg: "#FFFFFF",
      consentTitle: builtin.consentTitle, successMessage: "",
      fields: builtin.fields, checks: [{ k: builtin.consentCheck, req: true }],
    };
  }
  const all = def.fields || [];
  return {
    title: def.title, desc: def.desc ?? def.description ?? "", btn: def.btn || "ENVIAR",
    color: def.color || "#1A9190", bg: def.bg || "#FFFFFF",
    consentTitle: def.consentTitle || "", successMessage: def.successMessage || "",
    fields: all.filter((f) => f.type !== "check"), checks: all.filter((f) => f.type === "check"),
  };
}

export default function PublicForm() {
  const params = useParams();
  const formType = params.formType === "legal" ? "juridicos" : params.formType;
  const dealId = params.dealId;
  const builtin = BUILTIN_FORMS[formType];
  // Definición del servidor (formularios creados y versiones editadas de SEPA/Jurídicos).
  const [remote, setRemote] = useState({ type: null, status: "loading", def: null });
  const [values, setValues] = useState({});
  const [accepted, setAccepted] = useState({}); // casillas de consentimiento aceptadas
  const [privacyFor, setPrivacyFor] = useState(null); // casilla cuyo modal RGPD está abierto
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(loadRecaptcha, []);
  useEffect(() => {
    let alive = true;
    fetch(`${API_BASE}/forms/def/${encodeURIComponent(formType || "")}`)
      .then((r) => r.json())
      .then((out) => alive && setRemote({ type: formType, status: out.ok ? "ok" : "missing", def: out.ok ? out.form : null }))
      .catch(() => alive && setRemote({ type: formType, status: "missing", def: null }));
    return () => { alive = false; };
  }, [formType]);

  const status = remote.type === formType ? remote.status : "loading";
  if (status === "loading") return <Shell><p style={{ textAlign: "center", color: "#8a9a9a" }}>Cargando formulario…</p></Shell>;
  const cfg = status === "ok" ? normalize(remote.def, builtin) : builtin ? normalize(null, builtin) : null;
  if (!cfg) return <Shell><p style={{ textAlign: "center" }}>Formulario no encontrado.</p></Shell>;
  if (done) {
    return (
      <Shell bg={cfg.bg}>
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <div style={{ fontSize: 46 }}>✅</div>
          <h2 style={{ color: cfg.color }}>¡Recibido, gracias!</h2>
          <p style={{ color: "#5b6b6a", whiteSpace: "pre-line" }}>{cfg.successMessage || "Hemos registrado tu formulario. Nuestro equipo continuará con el proceso."}</p>
        </div>
      </Shell>
    );
  }

  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));
  const ph = (f) => f.k + (f.req ? " *" : "");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const missing = cfg.fields.filter((f) => f.req && !String(values[f.k] || "").trim());
    if (missing.length) { setError(`Falta rellenar: ${missing.map((m) => m.k).join(", ")}`); return; }
    if (cfg.checks.some((c) => c.req && !accepted[c.k])) { setError("Debes aceptar el consentimiento."); return; }
    // Las casillas viajan como "Sí" (los formularios fijos originales no las guardan como campo).
    const data = { ...values };
    if (status === "ok") cfg.checks.forEach((c) => { data[c.k] = accepted[c.k] ? "Sí" : ""; });
    setSending(true);
    try {
      if (RECAPTCHA_KEY) {
        const token = await recaptchaToken();
        const r = await fetch(`${API_BASE}/forms/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ formType, dealId: dealId || "", data, recaptchaToken: token }),
        });
        const out = await r.json().catch(() => ({}));
        if (!r.ok || !out.ok) throw new Error(out.error || `HTTP ${r.status}`);
      } else {
        await addDoc(collection(db, "formSubmissions"), {
          orgId: DEFAULT_ORG_ID, formType, dealId: dealId || "",
          data, status: "recibido", createdAt: serverTimestamp(),
        });
      }
      setDone(true);
    } catch (err) {
      setError("No se pudo enviar. Inténtalo de nuevo. (" + (err.code || err.message) + ")");
    } finally { setSending(false); }
  };

  return (
    <Shell bg={cfg.bg}>
      <h1 style={{ color: cfg.color, fontSize: 19, margin: "0 0 4px", textAlign: "center", lineHeight: 1.3 }}>{cfg.title}</h1>
      {cfg.desc && <p style={{ color: "#8a9a9a", fontSize: 13, textAlign: "center", margin: "0 0 20px" }}>{cfg.desc}</p>}
      <form onSubmit={submit}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {cfg.fields.map((f) =>
            f.type === "select" ? (
              <select key={f.k} value={values[f.k] || ""} onChange={set(f.k)} style={{ ...inp, color: values[f.k] ? "#2a3a3a" : "#8fbfbf" }}>
                <option value="">{ph(f)}</option>
                {(f.options || []).map((o) => <option key={o} value={o} style={{ color: "#2a3a3a" }}>{o}</option>)}
              </select>
            ) : f.type === "textarea" ? (
              <textarea key={f.k} value={values[f.k] || ""} onChange={set(f.k)} placeholder={ph(f)} rows={4} style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} />
            ) : f.type === "date" ? (
              // El input de fecha no muestra placeholder: el nombre del campo va encima.
              <label key={f.k} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "#5b8f8f" }}>
                {ph(f)}
                <input type="date" value={values[f.k] || ""} onChange={set(f.k)} style={inp} />
              </label>
            ) : (
              <input key={f.k} type={f.type || "text"} value={values[f.k] || ""} onChange={set(f.k)} placeholder={ph(f)} style={inp} />
            )
          )}
        </div>

        {cfg.checks.length > 0 && (
          <>
            {cfg.consentTitle && <h3 style={{ color: cfg.color, fontSize: 15, margin: "22px 0 10px" }}>{cfg.consentTitle}</h3>}
            {cfg.checks.map((c) => (
              <label key={c.k} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, color: "#3a4a4a", cursor: "pointer", marginTop: cfg.consentTitle ? 0 : 16, marginBottom: 6 }}>
                <input
                  type="checkbox"
                  checked={!!accepted[c.k]}
                  readOnly
                  onClick={(e) => { e.preventDefault(); if (accepted[c.k]) setAccepted((a) => ({ ...a, [c.k]: false })); else setPrivacyFor(c.k); }}
                  style={{ marginTop: 3 }}
                />
                <span>{c.k}{c.req && <span style={{ color: "#e05a5a" }}> *</span>}</span>
              </label>
            ))}
          </>
        )}

        {privacyFor && (
          <PrivacyModal
            onAccept={() => { setAccepted((a) => ({ ...a, [privacyFor]: true })); setPrivacyFor(null); }}
            onReject={() => { setAccepted((a) => ({ ...a, [privacyFor]: false })); setPrivacyFor(null); }}
          />
        )}

        {error && <div style={{ background: "#fdeef1", color: "#b0304c", padding: "9px 12px", borderRadius: 8, fontSize: 13, margin: "14px 0" }}>{error}</div>}
        <button type="submit" disabled={sending} style={{ ...btn, background: cfg.color, marginTop: 16 }}>{sending ? "Enviando…" : cfg.btn}</button>
        <p style={{ fontSize: 11, color: "#9aa8a8", marginTop: 16, textAlign: "center" }}>
          Tus datos se tratan conforme al RGPD para la gestión de tu relación con ISLAS SEM SLU.
          {RECAPTCHA_KEY && (
            <>
              <br />Protegido por reCAPTCHA de Google: se aplican su{" "}
              <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer" style={{ color: "#9aa8a8" }}>Política de Privacidad</a> y{" "}
              <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer" style={{ color: "#9aa8a8" }}>Términos</a>.
            </>
          )}
        </p>
      </form>
    </Shell>
  );
}

function PrivacyModal({ onAccept, onReject }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 1000 }}>
      <div style={{ position: "relative", background: "#0f2630", color: "#e6eef0", maxWidth: 680, width: "100%", maxHeight: "88vh", overflowY: "auto", borderRadius: 16, padding: "30px 34px" }}>
        <button type="button" onClick={onReject} aria-label="Cerrar"
          style={{ position: "absolute", top: 14, right: 16, width: 30, height: 30, borderRadius: "50%", border: "1px solid #2f6b6b", background: "transparent", color: "#4fd1c5", cursor: "pointer", fontSize: 15 }}>✕</button>
        {RGPD.map(([label, text], i) => (
          <p key={i} style={{ fontSize: 13.5, lineHeight: 1.55, margin: "0 0 14px" }}>
            <b style={{ color: "#4fd1c5" }}>{label}</b> {text}
          </p>
        ))}
        <p style={{ fontSize: 13.5, margin: "4px 0 22px" }}>
          He leído y acepto <a href="https://islassem.com/politicas-de-privacidad" target="_blank" rel="noreferrer" style={{ color: "#7db8ff" }}>Políticas de Privacidad</a>
        </p>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <button type="button" onClick={onAccept} style={{ flex: "1 1 220px", background: "#1A9190", color: "#fff", border: "none", borderRadius: 10, padding: "13px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>Acepto</button>
          <button type="button" onClick={onReject} style={{ flex: "0 0 auto", background: "transparent", color: "#e6eef0", border: "none", padding: "13px 22px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>No acepto</button>
        </div>
      </div>
    </div>
  );
}

function Shell({ children, bg = "#fff" }) {
  return (
    <div style={{ minHeight: "100vh", background: "#eef3f3", padding: "32px 16px", boxSizing: "border-box" }}>
      <style>{`.pf-card input::placeholder,.pf-card select:invalid{color:#8fbfbf}`}</style>
      <div className="pf-card" style={{ maxWidth: 470, margin: "0 auto", background: bg, borderRadius: 14, padding: "28px 26px 24px", boxShadow: "0 6px 24px rgba(0,0,0,.08)" }}>
        {children}
      </div>
    </div>
  );
}

const inp = { width: "100%", boxSizing: "border-box", border: "1px solid #e3e5e5", borderRadius: 10, padding: "12px 14px", fontSize: 14, background: "#f3f4f4", outline: "none" };
const btn = { display: "block", width: "100%", background: "#1A9190", color: "#fff", border: "none", borderRadius: 10, padding: "13px 26px", fontSize: 15, fontWeight: 700, cursor: "pointer", letterSpacing: ".3px" };
