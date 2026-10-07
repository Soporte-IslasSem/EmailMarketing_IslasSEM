// Formularios PÚBLICOS rellenables (sin login), IDÉNTICOS a los del prototipo
// (replicados del Bitrix real de ISLAS SEM): Orden de Domiciliación SEPA y
// Solicitud Datos Jurídicos del Representante. Diseño clavado al prototipo:
// título centrado, nombre del campo DENTRO del input (placeholder), consentimiento
// con subtítulo teal + checkbox.
// Envío: con VITE_RECAPTCHA_SITE_KEY configurada, pasa por reCAPTCHA v3 y el backend
// (que verifica el token y guarda). Sin ella, escribe directo en Firestore (formSubmissions).
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../../../config/firebaseConfig";

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

const FORMS = {
  sepa: {
    title: "ORDEN DE DOMICILIACIÓN DE ADEUDO SEPA",
    desc: "Aceptación del adeudo sepa",
    consentTitle: "Aceptación Domiciliación Bancaria",
    consentCheck: "Al hacer clic en un botón de envío, acepto el consentimiento",
    fields: [
      { k: "Nombre Completo del titular de la cuenta o titulares", req: false },
      { k: "Apellidos Representante Legal del titular de la cuenta", req: false },
      { k: "Denominación de la Sociedad y/o autónomo", req: true },
      { k: "IBAN", req: true },
      { k: "SWIFT BIC", req: false },
      { k: "Dirección de la Sucursal Bancaria", req: false },
      { k: "Teléfono de la Sucursal Bancaria", req: false, type: "tel" },
      { k: "Signatario de autorizaciones de la cuenta (la persona que firma)", req: false },
      { k: "Aceptado por (Nombre y Apellidos de la persona que está firmando)", req: false },
    ],
  },
  juridicos: {
    title: "SOLICITUD DATOS JURÍDICOS DEL REPRESENTANTE / CONTRATOS LEGALES",
    desc: "Tratamiento de datos en cumplimiento de la protección de datos",
    consentTitle: "Aceptación del Tratamiento y la Protección de Datos",
    consentCheck: "Al hacer clic en un botón de envío, acepta el consentimiento",
    fields: [
      { k: "Nombre Representante Legal", req: true },
      { k: "Apellidos Representante Legal", req: true },
      { k: "DNI Representante Legal", req: true },
      { k: "Teléfono directo del Representante Legal", req: true, type: "tel" },
      { k: "E-mail directo del Representante Legal", req: true, type: "email" },
      { k: "Denominación de la Sociedad y/o Autónoma", req: true },
      { k: "CIF/NIF", req: true },
      { k: "Dirección Fiscal completa", req: true },
      { k: "Provincia", req: true },
      { k: "Teléfono de facturación", req: true, type: "tel" },
      { k: "Correo electrónico de facturación", req: true, type: "email" },
      { k: "Correo electrónico Protección de datos", req: true, type: "email" },
      { k: "N° empleados-as Jornada Completa", req: true },
      { k: "Actividad Empresarial", req: true },
      { k: "¿Qué producto está interesado/a?", req: false, type: "select", options: ["PÁGINA WEB", "TIENDA ONLINE", "CRM - CENTRO RELACIÓN DE CLIENTES", "REDES SOCIALES", "SEO Y POSICIONAMIENTO WEB", "FACTURACIÓN", "INTELIGENCIA ECONÓMICA NEGOCIOS", "OFICINA VIRTUAL"] },
      { k: "Programación Personalizada", req: false, type: "select", options: ["Programación por horas", "Aplicación Web", "Aplicación Móvil", "Solución Incidencia Técnica"] },
      { k: "Consultoría y Asesoramiento", req: false, type: "select", options: ["Ventas Digitales", "Inteligencia Artificial"] },
    ],
  },
};

export default function PublicForm() {
  const params = useParams();
  const formType = params.formType === "legal" ? "juridicos" : params.formType;
  const dealId = params.dealId;
  const cfg = FORMS[formType];
  const [values, setValues] = useState({});
  const [consent, setConsent] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(loadRecaptcha, []);

  if (!cfg) return <Shell><p style={{ textAlign: "center" }}>Formulario no encontrado.</p></Shell>;
  if (done) {
    return (
      <Shell>
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <div style={{ fontSize: 46 }}>✅</div>
          <h2 style={{ color: "#1A9190" }}>¡Recibido, gracias!</h2>
          <p style={{ color: "#5b6b6a" }}>Hemos registrado tu formulario. Nuestro equipo continuará con el proceso.</p>
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
    if (!consent) { setError("Debes aceptar el consentimiento."); return; }
    setSending(true);
    try {
      if (RECAPTCHA_KEY) {
        const token = await recaptchaToken();
        const r = await fetch(`${API_BASE}/forms/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ formType, dealId: dealId || "", data: values, recaptchaToken: token }),
        });
        const out = await r.json().catch(() => ({}));
        if (!r.ok || !out.ok) throw new Error(out.error || `HTTP ${r.status}`);
      } else {
        await addDoc(collection(db, "formSubmissions"), {
          orgId: DEFAULT_ORG_ID, formType, dealId: dealId || "",
          data: values, status: "recibido", createdAt: serverTimestamp(),
        });
      }
      setDone(true);
    } catch (err) {
      setError("No se pudo enviar. Inténtalo de nuevo. (" + (err.code || err.message) + ")");
    } finally { setSending(false); }
  };

  return (
    <Shell>
      <h1 style={{ color: "#1A9190", fontSize: 19, margin: "0 0 4px", textAlign: "center", lineHeight: 1.3 }}>{cfg.title}</h1>
      <p style={{ color: "#8a9a9a", fontSize: 13, textAlign: "center", margin: "0 0 20px" }}>{cfg.desc}</p>
      <form onSubmit={submit}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {cfg.fields.map((f) =>
            f.type === "select" ? (
              <select key={f.k} value={values[f.k] || ""} onChange={set(f.k)} style={{ ...inp, color: values[f.k] ? "#2a3a3a" : "#8fbfbf" }}>
                <option value="">{f.k}</option>
                {f.options.map((o) => <option key={o} value={o} style={{ color: "#2a3a3a" }}>{o}</option>)}
              </select>
            ) : (
              <input key={f.k} type={f.type || "text"} value={values[f.k] || ""} onChange={set(f.k)} placeholder={ph(f)} style={inp} />
            )
          )}
        </div>

        <h3 style={{ color: "#1A9190", fontSize: 15, margin: "22px 0 10px" }}>{cfg.consentTitle}</h3>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, color: "#3a4a4a", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={consent}
            readOnly
            onClick={(e) => { e.preventDefault(); if (consent) setConsent(false); else setShowPrivacy(true); }}
            style={{ marginTop: 3 }}
          />
          <span>{cfg.consentCheck} <span style={{ color: "#e05a5a" }}>*</span></span>
        </label>

        {showPrivacy && (
          <PrivacyModal
            onAccept={() => { setConsent(true); setShowPrivacy(false); }}
            onReject={() => { setConsent(false); setShowPrivacy(false); }}
          />
        )}

        {error && <div style={{ background: "#fdeef1", color: "#b0304c", padding: "9px 12px", borderRadius: 8, fontSize: 13, margin: "14px 0" }}>{error}</div>}
        <button type="submit" disabled={sending} style={btn}>{sending ? "Enviando…" : "ENVIAR"}</button>
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

function Shell({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: "#eef3f3", padding: "32px 16px", boxSizing: "border-box" }}>
      <style>{`.pf-card input::placeholder,.pf-card select:invalid{color:#8fbfbf}`}</style>
      <div className="pf-card" style={{ maxWidth: 470, margin: "0 auto", background: "#fff", borderRadius: 14, padding: "28px 26px 24px", boxShadow: "0 6px 24px rgba(0,0,0,.08)" }}>
        {children}
      </div>
    </div>
  );
}

const inp = { width: "100%", boxSizing: "border-box", border: "1px solid #e3e5e5", borderRadius: 10, padding: "12px 14px", fontSize: 14, background: "#f3f4f4", outline: "none" };
const btn = { display: "block", width: "100%", background: "#1A9190", color: "#fff", border: "none", borderRadius: 10, padding: "13px 26px", fontSize: 15, fontWeight: 700, cursor: "pointer", letterSpacing: ".3px" };
