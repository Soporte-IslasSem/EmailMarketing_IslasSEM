// Administración › Sistema › Mi empresa: datos e imagen de la empresa (nombre, logo, colores, web:
// salen en los correos, PDF, formularios y contratos), su correo de salida/entrada y su plan.
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, fileToBase64 } from "../../../shared/api";
import "../crm.styles.css";

const TABS = [["perfil", "Datos e imagen"], ["correo", "Correo"], ["plan", "Plan y facturación"]];
const box = { background: "#fff", border: "1px solid var(--crm-line)", borderRadius: 12, padding: 18, maxWidth: 760, marginBottom: 16 };
const lbl = { display: "block", fontSize: 13, fontWeight: 600, margin: "12px 0 4px" };
const inp = { width: "100%", padding: "8px 10px", border: "1px solid var(--crm-line)", borderRadius: 8, fontSize: 14, boxSizing: "border-box" };
const Msg = ({ m }) => (m ? <p style={{ fontSize: 13, margin: "10px 0 0", color: m.err ? "#b0304c" : "var(--crm-teal-dark)" }}>{m.text}</p> : null);
const dateEs = (ms) => (ms ? new Date(ms).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }) : "");

export default function MyCompany() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get("tab")) ? params.get("tab") : "perfil";
  const [org, setOrg] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => { api("org/profile").then((r) => setOrg(r.org)).catch((e) => setErr(e.message)); }, []);
  return (
    <div className="crm">
      <div className="crm__top"><div><h1>Mi empresa</h1><p>Datos, imagen, correo y plan de {org?.name || "tu empresa"}.</p></div></div>
      <div className="wa-tabs" style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {TABS.map(([k, l]) => <button key={k} className={`crm-btn ${tab === k ? "" : "ghost"} sm`} onClick={() => setParams({ tab: k }, { replace: true })}>{l}</button>)}
      </div>
      {err && <Msg m={{ err: true, text: err }} />}
      {!org ? (!err && <p>Cargando…</p>)
        : tab === "perfil" ? <Profile org={org} onSaved={setOrg} />
        : tab === "correo" ? <Mail admin={org.isAdmin} />
        : <Plan org={org} />}
    </div>
  );
}

/* ------------------------------------------------------------------ datos e imagen */

function Profile({ org, onSaved }) {
  const [f, setF] = useState({ name: org.name, legalName: org.brand.legalName || "", website: org.brand.website || "", place: org.brand.place || "", domain: org.brand.domain || "", color: org.brand.color, accent: org.brand.accent });
  const [logo, setLogo] = useState(undefined); // undefined = sin cambios, null = quitar, {data,mime,preview}
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const pick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) return setMsg({ err: true, text: "El logo tiene que pesar menos de 1 MB." });
    setLogo({ data: await fileToBase64(file), mime: file.type, preview: URL.createObjectURL(file) });
  };
  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await api("org/profile", { name: f.name, brand: f, ...(logo === undefined ? {} : { logo: logo && { data: logo.data, mime: logo.mime } }) });
      onSaved(r.org); setLogo(undefined); setMsg({ text: "Guardado." });
    } catch (e) { setMsg({ err: true, text: e.message }); }
    setBusy(false);
  };
  const shown = logo === null ? "" : logo?.preview || org.brand.logoUrl;
  const dis = !org.isAdmin;
  return (
    <div style={box}>
      {dis && <p className="wa-hint">Solo un administrador puede cambiar estos datos.</p>}
      <label style={lbl}>Nombre de la empresa (el que ven tus clientes)</label>
      <input style={inp} value={f.name} onChange={set("name")} disabled={dis} maxLength={80} />
      <label style={lbl}>Razón social (pie de los correos y PDF)</label>
      <input style={inp} value={f.legalName} onChange={set("legalName")} disabled={dis} placeholder="p. ej. Talleres Pérez S.L." />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
        <div><label style={lbl}>Web</label><input style={inp} value={f.website} onChange={set("website")} disabled={dis} placeholder="www.miempresa.com" /></div>
        <div><label style={lbl}>Ciudad / zona</label><input style={inp} value={f.place} onChange={set("place")} disabled={dis} placeholder="Las Palmas" /></div>
        <div><label style={lbl}>Dominio de vuestro email</label><input style={inp} value={f.domain} onChange={set("domain")} disabled={dis} placeholder="miempresa.com" /></div>
      </div>
      <p className="wa-hint" style={{ fontSize: 12, color: "var(--crm-muted)" }}>El dominio sirve para saber qué correos y citas son de tu propio equipo (no se crean como prospectos).</p>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div><label style={lbl}>Color principal</label><input type="color" value={f.color} onChange={set("color")} disabled={dis} /></div>
        <div><label style={lbl}>Color de los botones</label><input type="color" value={f.accent} onChange={set("accent")} disabled={dis} /></div>
        <div>
          <label style={lbl}>Logo (PNG, JPG o WebP, máx. 1 MB)</label>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {shown ? <img src={shown} alt="Logo" style={{ maxHeight: 48, maxWidth: 180, border: "1px solid var(--crm-line)", borderRadius: 6, padding: 4, background: "#fff" }} /> : <span style={{ color: "var(--crm-muted)", fontSize: 13 }}>Sin logo</span>}
            {!dis && <label className="crm-btn ghost sm" style={{ cursor: "pointer" }}>Elegir<input type="file" accept="image/png,image/jpeg,image/webp" onChange={pick} style={{ display: "none" }} /></label>}
            {!dis && shown && <button className="crm-btn ghost sm" onClick={() => setLogo(null)}>Quitar</button>}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 16, border: "1px solid var(--crm-line)", borderRadius: 10, overflow: "hidden", maxWidth: 420 }}>
        <div style={{ background: f.color, color: "#fff", padding: "10px 14px", fontWeight: 700 }}>{shown ? <img src={shown} alt="" style={{ maxHeight: 28 }} /> : f.name}</div>
        <div style={{ padding: 14, fontSize: 13 }}>Así se verán tus correos automáticos. <span style={{ background: f.accent, padding: "4px 10px", borderRadius: 6, fontWeight: 700, marginLeft: 6 }}>Botón</span></div>
        <div style={{ padding: "6px 14px 10px", fontSize: 11, color: "#9aa8a8" }}>{[f.legalName || f.name, f.place, f.website].filter(Boolean).join(" · ")}</div>
      </div>
      {!dis && <button className="crm-btn" style={{ marginTop: 16 }} onClick={save} disabled={busy}>{busy ? "Guardando…" : "Guardar"}</button>}
      <Msg m={msg} />
    </div>
  );
}

/* ------------------------------------------------------------------ correo */

function Mail({ admin }) {
  const [m, setM] = useState(null);
  const [f, setF] = useState(null);
  const [own, setOwn] = useState(false);
  const [imap, setImap] = useState(false);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => api("org/mail").then((r) => {
    setM(r);
    setOwn(!!r.smtp); setImap(!!r.imap);
    setF({ fromName: r.fromName, replyTo: r.replyTo, smtp: { host: r.smtp?.host || "", port: r.smtp?.port || 587, user: r.smtp?.user || "", from: r.smtp?.from || "", password: "" }, imap: { host: r.imap?.host || "", port: r.imap?.port || 993, user: r.imap?.user || "", password: "" } });
  }).catch((e) => setMsg({ err: true, text: e.message }));
  useEffect(() => { load(); }, []);
  if (!f) return <div style={box}>{msg ? <Msg m={msg} /> : "Cargando…"}</div>;
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const setIn = (g, k) => (e) => setF((x) => ({ ...x, [g]: { ...x[g], [k]: e.target.value } }));
  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      await api("org/mail", { fromName: f.fromName, replyTo: f.replyTo, smtp: own ? f.smtp : null, imap: imap ? f.imap : null });
      setMsg({ text: own ? "Guardado. Hemos comprobado la conexión con tu servidor de correo." : "Guardado." });
      await load();
    } catch (e) { setMsg({ err: true, text: e.message }); }
    setBusy(false);
  };
  const dis = !admin;
  return (
    <div style={box}>
      {dis && <p className="wa-hint">Solo un administrador puede cambiar el correo.</p>}
      <p style={{ fontSize: 13.5, marginTop: 0 }}>
        {m.platform
          ? <>Ahora tus correos salen desde <b>{m.platformAddress}</b> con el nombre de tu empresa{m.dailyLimit ? <> (hasta <b>{m.dailyLimit}</b> al día)</> : null}, y las respuestas llegan a tu email. Para enviar desde tu propio dominio y sin ese tope, conecta tu servidor de correo.</>
          : <>Tus correos salen por <b>tu propio servidor de correo</b>.</>}
      </p>
      <label style={lbl}>Nombre del remitente</label>
      <input style={inp} value={f.fromName} onChange={set("fromName")} disabled={dis} placeholder="p. ej. Talleres Pérez" />
      <label style={lbl}>Las respuestas van a (email)</label>
      <input style={inp} value={f.replyTo} onChange={set("replyTo")} disabled={dis} placeholder="ventas@miempresa.com" />
      <label className="wa-check" style={{ marginTop: 14 }}><input type="checkbox" checked={own} onChange={(e) => setOwn(e.target.checked)} disabled={dis} /> Enviar con mi propio servidor de correo (SMTP)</label>
      {own && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
          <div><label style={lbl}>Servidor SMTP</label><input style={inp} value={f.smtp.host} onChange={setIn("smtp", "host")} disabled={dis} placeholder="smtp.miempresa.com" /></div>
          <div><label style={lbl}>Puerto</label><input style={inp} value={f.smtp.port} onChange={setIn("smtp", "port")} disabled={dis} placeholder="587" /></div>
          <div><label style={lbl}>Usuario</label><input style={inp} value={f.smtp.user} onChange={setIn("smtp", "user")} disabled={dis} placeholder="ventas@miempresa.com" /></div>
          <div><label style={lbl}>Contraseña {m.smtp?.hasPassword && <span style={{ fontWeight: 400, color: "var(--crm-muted)" }}>(guardada)</span>}</label><input style={inp} type="password" autoComplete="off" value={f.smtp.password} onChange={setIn("smtp", "password")} disabled={dis} placeholder={m.smtp?.hasPassword ? "••••••••" : ""} /></div>
          <div style={{ gridColumn: "1/-1" }}><label style={lbl}>Remitente (si es distinto del usuario)</label><input style={inp} value={f.smtp.from} onChange={setIn("smtp", "from")} disabled={dis} placeholder="Talleres Pérez <ventas@miempresa.com>" /></div>
        </div>
      )}
      <label className="wa-check" style={{ marginTop: 14 }}><input type="checkbox" checked={imap} onChange={(e) => setImap(e.target.checked)} disabled={dis} /> Leer las respuestas y rebotes de mi buzón (IMAP)</label>
      {imap && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
          <div><label style={lbl}>Servidor IMAP</label><input style={inp} value={f.imap.host} onChange={setIn("imap", "host")} disabled={dis} placeholder="imap.miempresa.com" /></div>
          <div><label style={lbl}>Puerto</label><input style={inp} value={f.imap.port} onChange={setIn("imap", "port")} disabled={dis} placeholder="993" /></div>
          <div><label style={lbl}>Usuario</label><input style={inp} value={f.imap.user} onChange={setIn("imap", "user")} disabled={dis} /></div>
          <div><label style={lbl}>Contraseña {m.imap?.hasPassword && <span style={{ fontWeight: 400, color: "var(--crm-muted)" }}>(guardada)</span>}</label><input style={inp} type="password" autoComplete="off" value={f.imap.password} onChange={setIn("imap", "password")} disabled={dis} placeholder={m.imap?.hasPassword ? "••••••••" : ""} /></div>
        </div>
      )}
      <p style={{ fontSize: 12, color: "var(--crm-muted)" }}>Con Gmail o Google Workspace usa una «contraseña de aplicación» (Cuenta de Google › Seguridad), no tu contraseña normal.</p>
      {!dis && <button className="crm-btn" onClick={save} disabled={busy}>{busy ? "Comprobando…" : "Guardar"}</button>}
      <Msg m={msg} />
    </div>
  );
}

/* ------------------------------------------------------------------ plan */

// /suscripcion: el plan fuera del panel (para pagar con la cuenta suspendida o al acabar la prueba).
export function Subscription() {
  const [org, setOrg] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => { api("org/profile").then((r) => setOrg(r.org)).catch((e) => setErr(e.message)); }, []);
  return (
    <div className="crm" style={{ maxWidth: 820, margin: "30px auto", padding: "0 16px" }}>
      <h1>Suscripción de {org?.name || "tu empresa"}</h1>
      {err && <Msg m={{ err: true, text: err }} />}
      {org ? <Plan org={org} /> : !err && <p>Cargando…</p>}
      <p><a href="/dashboard">← Volver</a></p>
    </div>
  );
}

function Plan({ org }) {
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null);
  const [now] = useState(() => Date.now());
  const internal = org.plan === "interno";
  const trialLeft = org.plan === "trial" && org.trialEndsAt ? Math.max(0, Math.ceil((org.trialEndsAt - now) / 864e5)) : null;
  const go = async (path, body) => {
    setBusy(path); setMsg(null);
    try { const r = await api(path, body); if (r.url) window.location.href = r.url; } catch (e) { setMsg({ err: true, text: e.message }); setBusy(""); }
  };
  return (
    <>
      <div style={box}>
        <h3 style={{ marginTop: 0 }}>Plan actual: {org.planName}</h3>
        {internal && <p>Cuenta interna: sin límites ni cobro.</p>}
        {trialLeft !== null && <p>Te quedan <b>{trialLeft} días</b> de prueba gratis (hasta el {dateEs(org.trialEndsAt)}). Elige un plan para seguir después.</p>}
        {org.status === "suspended" && <p style={{ color: "#b0304c" }}>La cuenta está suspendida: elige un plan o actualiza el pago para reactivarla.</p>}
        {org.billing && <p>Suscripción: <b>{org.billing.status}</b>{org.billing.currentPeriodEnd ? <> · próxima renovación {dateEs(org.billing.currentPeriodEnd)}</> : null}{org.billing.cancelAtPeriodEnd ? " · se cancela al final del periodo" : ""}</p>}
        <p style={{ fontSize: 13, color: "var(--crm-muted)" }}>Usuarios: <b>{org.seats}</b>{org.limits?.users ? ` de ${org.limits.users}` : ""} · Correos al día por la cuenta de la plataforma: {org.limits?.emailsPerDay || "—"}</p>
        {org.billing && org.isAdmin && <button className="crm-btn ghost" onClick={() => go("billing/portal", {})} disabled={!!busy}>{busy === "billing/portal" ? "Abriendo…" : "Facturas y forma de pago"}</button>}
        <Msg m={msg} />
      </div>
      {!internal && org.isAdmin && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12, maxWidth: 760 }}>
          {org.plans.map((p) => (
            <div key={p.id} style={{ ...box, marginBottom: 0, borderColor: org.plan === p.id ? "var(--crm-teal)" : "var(--crm-line)" }}>
              <h3 style={{ marginTop: 0 }}>{p.name}</h3>
              <ul style={{ paddingLeft: 18, fontSize: 13.5, lineHeight: 1.7 }}>
                <li>Hasta {p.users} usuarios</li>
                <li>{p.emailsPerDay} correos al día (o ilimitados con tu servidor)</li>
                <li>CRM, email marketing y formularios</li>
                <li>{p.features.whatsapp ? "WhatsApp con tu número" : "Sin WhatsApp"}</li>
                <li>{p.features.contracts ? "Contratos con firma electrónica" : "Sin contratos"}</li>
              </ul>
              {org.plan === p.id && org.billing?.status === "active"
                ? <p style={{ fontWeight: 700, color: "var(--crm-teal-dark)" }}>Tu plan</p>
                : <button className="crm-btn" disabled={!p.available || !!busy} onClick={() => go(org.billing ? "billing/change" : "billing/checkout", { plan: p.id })}>
                  {!p.available ? "Próximamente" : busy ? "Abriendo…" : org.billing ? "Cambiar a este plan" : "Elegir"}</button>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
