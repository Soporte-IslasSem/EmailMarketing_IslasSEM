import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { auth } from "../../../config/firebaseConfig";
import { usePerms } from "../../crm/lib/permissions";
import { waApi, useWaConfig, saveConfig, newId, dateTime, usePeople } from "../lib/api";
import "../../crm/crm.styles.css";
import "../whatsapp.css";

// WhatsApp › Ajustes, por pestañas como ManyContacts: conexión con Meta, embudos, equipos y
// asignación, respuestas rápidas, auto respuesta, chatbot, etiquetas y general. Solo un
// administrador cambia lo común; cada uno gestiona sus respuestas rápidas.
const TABS = [
  ["connection", "Conexión"], ["funnels", "Embudos"], ["teams", "Equipos y asignación"], ["quick", "Respuestas rápidas"],
  ["auto", "Auto respuesta"], ["chatbot", "Chatbot"], ["tags", "Etiquetas"], ["general", "General"],
];

export default function WhatsAppSettings() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get("tab")) ? params.get("tab") : "connection";
  const cfg = useWaConfig();
  const perms = usePerms();
  const admin = perms.isAdmin;
  return (
    <div className="crm wa-settings">
      <div className="crm__top"><h1 style={{ margin: 0 }}>WhatsApp · Ajustes</h1><Link to="/dashboard/whatsapp" className="crm-btn ghost sm">← Chats</Link></div>
      <div className="wa-tabs">
        {TABS.map(([k, l]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setParams({ tab: k }, { replace: true })}>{l}</button>)}
      </div>
      {!admin && tab !== "quick" && <p className="wa-hint">Solo un administrador puede cambiar esta sección.</p>}
      {tab === "connection" ? <Connection admin={admin} />
        : !cfg ? <p>Cargando…</p>
        : tab === "funnels" ? <FunnelsTab cfg={cfg} admin={admin} />
        : tab === "teams" ? <TeamsTab cfg={cfg} admin={admin} />
        : tab === "quick" ? <QuickTab cfg={cfg} admin={admin} />
        : tab === "auto" ? <AutoTab cfg={cfg} admin={admin} />
        : tab === "chatbot" ? <ChatbotTab cfg={cfg} admin={admin} />
        : tab === "tags" ? <TagsTab cfg={cfg} admin={admin} />
        : <GeneralTab cfg={cfg} admin={admin} />}
    </div>
  );
}

// Guardar una sección: estado del botón y mensaje.
function useSaver(section) {
  const [state, setState] = useState({ busy: false, msg: null });
  const save = async (value) => {
    setState({ busy: true, msg: null });
    try { await saveConfig(section, value); setState({ busy: false, msg: { text: "Guardado." } }); } catch (e) { setState({ busy: false, msg: { err: true, text: e.message } }); }
  };
  return [state, save];
}
function SaveBar({ state, onSave, admin, label = "Guardar cambios" }) {
  if (!admin) return null;
  return (
    <div className="wa-savebar">
      <button className="crm-btn" onClick={onSave} disabled={state.busy}>{state.busy ? "Guardando…" : label}</button>
      {state.msg && <span className={state.msg.err ? "wa-err" : "wa-ok"}>{state.msg.text}</span>}
    </div>
  );
}
const move = (list, i, d) => { const j = i + d; if (j < 0 || j >= list.length) return list; const a = [...list]; [a[i], a[j]] = [a[j], a[i]]; return a; };

/* ------------------------------------------------------------------ conexión */

// SDK de Facebook (solo para el botón «Conectar con Facebook»), cargado una vez.
let fbReady = null;
function loadFacebook(appId, version) {
  if (fbReady) return fbReady;
  fbReady = new Promise((resolve, reject) => {
    window.fbAsyncInit = () => { window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version }); resolve(window.FB); };
    const s = document.createElement("script");
    s.src = "https://connect.facebook.net/es_ES/sdk.js";
    s.async = true; s.defer = true; s.crossOrigin = "anonymous";
    s.onerror = () => { fbReady = null; reject(new Error("No se pudo cargar Facebook. Revisa que el navegador no lo bloquee.")); };
    document.body.appendChild(s);
  });
  return fbReady;
}

// Alta con un botón (Embedded Signup de Meta): la empresa entra con su Facebook, elige o crea su
// cuenta de WhatsApp Business y su número, y Meta nos devuelve un código y los identificadores.
function connectWithFacebook(embedded, coexistence) {
  return new Promise((resolve, reject) => {
    let ids = null;
    let code = null;
    const done = () => { if (code && ids) { window.removeEventListener("message", onMsg); resolve({ code, ...ids }); } };
    const onMsg = (ev) => {
      if (!/(^|\.)facebook\.com$/.test(new URL(ev.origin).hostname)) return;
      let data;
      try { data = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data; } catch { return; }
      if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
      if (data.event === "CANCEL") { window.removeEventListener("message", onMsg); reject(new Error(data.data?.current_step ? "Has cerrado la ventana de Meta antes de terminar." : "Conexión cancelada.")); return; }
      if (data.event === "ERROR") { window.removeEventListener("message", onMsg); reject(new Error(data.data?.error_message || "Meta devolvió un error.")); return; }
      if (String(data.event || "").startsWith("FINISH")) { ids = { phoneNumberId: data.data?.phone_number_id || "", wabaId: data.data?.waba_id || "" }; done(); }
    };
    window.addEventListener("message", onMsg);
    loadFacebook(embedded.appId, embedded.version).then((FB) => {
      FB.login((resp) => {
        if (!resp?.authResponse?.code) { window.removeEventListener("message", onMsg); reject(new Error("No se completó el inicio de sesión con Facebook.")); return; }
        code = resp.authResponse.code;
        // A veces el aviso con los identificadores llega después: se espera un poco.
        setTimeout(() => { if (!ids) { window.removeEventListener("message", onMsg); reject(new Error("Meta no devolvió el número conectado. Vuelve a intentarlo.")); } }, 15000);
        done();
      }, {
        config_id: embedded.configId, response_type: "code", override_default_response_type: true,
        extras: { setup: {}, sessionInfoVersion: "3", ...(coexistence ? { featureType: "whatsapp_business_app_onboarding" } : {}) },
      });
    }).catch((e) => { window.removeEventListener("message", onMsg); reject(e); });
  });
}

function Connection({ admin }) {
  const [s, setS] = useState(null);
  const [embedded, setEmbedded] = useState(null);
  const [f, setF] = useState({ phoneNumberId: "", wabaId: "", appId: "", token: "", appSecret: "", verifyToken: "" });
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [coex, setCoex] = useState(false);
  const [manual, setManual] = useState(false);
  const load = () => waApi("settings").then((r) => {
    setS(r.settings);
    setEmbedded(r.embedded || null);
    setManual((m) => m || (!r.embedded || (r.settings.hasToken && !r.settings.platformApp)));
    setF((x) => ({ ...x, phoneNumberId: r.settings.phoneNumberId, wabaId: r.settings.wabaId, appId: r.settings.appId, verifyToken: r.settings.verifyToken, token: "", appSecret: "" }));
  }).catch((e) => setMsg({ err: true, text: e.message }));
  useEffect(() => { load(); }, []);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const r = await waApi("settings", f);
      setMsg({ text: `Conectado y guardado. Meta ha confirmado los datos.${f.wabaId ? (r.subscribed ? " La app está suscrita a la cuenta (los mensajes llegarán al webhook)." : " Aviso: no se pudo suscribir la app a la cuenta de WhatsApp; revisa los permisos del token.") : ""}` });
      await load();
    } catch (e) { setMsg({ err: true, text: e.message }); }
    setSaving(false);
  };
  const facebook = async () => {
    setSaving(true); setMsg({ text: "Sigue los pasos en la ventana de Meta…" });
    try {
      const r = await connectWithFacebook(embedded, coex);
      setMsg({ text: "Conectando tu número…" });
      const out = await waApi("embedded-signup", { ...r, coexistence: coex });
      setMsg({ text: `¡Listo! WhatsApp conectado${out.displayPhone ? `: ${out.displayPhone}` : ""}. Ya puedes recibir y enviar mensajes.` });
      await load();
    } catch (e) { setMsg({ err: true, text: e.message }); }
    setSaving(false);
  };
  const disconnect = async () => {
    if (!window.confirm("¿Desconectar WhatsApp? Dejarás de recibir y enviar mensajes desde aquí (los chats se conservan).")) return;
    setSaving(true); setMsg(null);
    try { await waApi("disconnect", {}); setMsg({ text: "WhatsApp desconectado." }); await load(); } catch (e) { setMsg({ err: true, text: e.message }); }
    setSaving(false);
  };
  const copy = (t) => navigator.clipboard?.writeText(t).then(() => setMsg({ text: "Copiado." })).catch(() => {});
  if (!s) return <p>{msg?.text || "Cargando…"}</p>;
  const connected = s.hasToken && s.phoneNumberId && s.displayPhone;
  return (
    <>
      <div className={`wa-status ${connected ? "ok" : ""}`}>
        {connected
          ? <>✅ Conectado: <b>{s.displayPhone}</b> {s.verifiedName && <>({s.verifiedName})</>} {s.quality && <> · calidad {s.quality}</>} {s.messagingLimit && <> · límite {s.messagingLimit.replace("TIER_", "")} conversaciones/día</>}{s.templatesSyncedAt ? <> · plantillas sincronizadas {dateTime(s.templatesSyncedAt)}</> : null}</>
          : <>⚪ Sin conectar.</>}
      </div>
      {embedded && (
        <div className="wa-card">
          <h3>{connected && s.platformApp ? "Tu número de WhatsApp" : "Conectar con Facebook (recomendado)"}</h3>
          {connected && s.platformApp ? (
            <>
              <p className="wa-hint">Conectado con tu cuenta de Meta{s.connectedVia === "embedded-coexistence" ? " (también sigues usándolo en la app WhatsApp Business del móvil)" : ""}. Los mensajes, plantillas y difusiones funcionan con tu propia cuenta de WhatsApp Business.</p>
              {admin && <button className="crm-btn ghost" onClick={disconnect} disabled={saving}>Desconectar WhatsApp</button>}
            </>
          ) : (
            <>
              <p className="wa-hint">Pulsa el botón, entra con el Facebook que administra tu empresa, elige (o crea) tu cuenta de WhatsApp Business y tu número, y verifícalo con el código que te llega por SMS o llamada. No tienes que crear apps ni copiar tokens.</p>
              <label className="wa-check"><input type="checkbox" checked={coex} onChange={(e) => setCoex(e.target.checked)} disabled={!admin} /> Mi número ya está en la app <b>WhatsApp Business</b> del móvil y quiero seguir usándolo allí también</label>
              {admin
                ? <button className="crm-btn wa-fb" onClick={facebook} disabled={saving}>{saving ? "Conectando…" : "Conectar con Facebook"}</button>
                : <p className="wa-hint">Pide a un administrador que conecte el número.</p>}
              <p className="wa-hint" style={{ marginTop: 8 }}>Requisitos: un número que pueda recibir SMS o llamadas y que no esté conectado a otra plataforma (si lo está, desconéctalo allí primero). Lo que Meta cobra por cada conversación lo paga tu empresa directamente en su cuenta de Meta.</p>
            </>
          )}
        </div>
      )}
      {msg && <p className={msg.err ? "wa-err" : "wa-ok"} style={{ margin: "10px 0" }}>{msg.text}</p>}
      {embedded && !manual && (
        <p className="wa-hint"><button className="wa-link" onClick={() => setManual(true)}>Conectar con mi propia app de Meta (avanzado)</button></p>
      )}
      {manual && (
        <>
          <div className="wa-card">
            <h3>{embedded ? "Avanzado · " : ""}1 · Datos de tu app de Meta</h3>
            <label>Identificador del número de teléfono (Phone number ID)<input value={f.phoneNumberId} onChange={set("phoneNumberId")} disabled={!admin} placeholder="p. ej. 123456789012345" /></label>
            <label>Identificador de la cuenta de WhatsApp Business (WABA ID) · necesario para plantillas<input value={f.wabaId} onChange={set("wabaId")} disabled={!admin} placeholder="p. ej. 102938475610293" /></label>
            <label>Identificador de la app (App ID) · opcional, para plantillas con imagen/vídeo/PDF<input value={f.appId} onChange={set("appId")} disabled={!admin} placeholder="Se averigua solo; escríbelo si falla" /></label>
            <label>Token de acceso {s.hasToken && !s.platformApp && <span className="wa-ok">· guardado (déjalo vacío para mantenerlo)</span>}
              <input type="password" autoComplete="off" value={f.token} onChange={set("token")} disabled={!admin} placeholder={s.hasToken && !s.platformApp ? "••••••••" : "Token permanente del usuario del sistema"} /></label>
            <label>Clave secreta de la app (App secret) {s.hasAppSecret && <span className="wa-ok">· guardada</span>}
              <input type="password" autoComplete="off" value={f.appSecret} onChange={set("appSecret")} disabled={!admin} placeholder={s.hasAppSecret ? "••••••••" : "Configuración de la app › Básica › Clave secreta"} /></label>
            {admin && <button className="crm-btn" onClick={save} disabled={saving}>{saving ? "Comprobando con Meta…" : "Guardar y probar conexión"}</button>}
            {admin && connected && !s.platformApp && <button className="crm-btn ghost" style={{ marginLeft: 8 }} onClick={disconnect} disabled={saving}>Desconectar</button>}
          </div>
          <div className="wa-card">
            <h3>2 · Webhook (para recibir los mensajes)</h3>
            <p className="wa-hint">En Meta for Developers › tu app › WhatsApp › Configuración › Webhook, pega estos dos valores y suscríbete a los campos <b>messages</b> y <b>message_template_status_update</b>.</p>
            <label>URL de devolución de llamada (Callback URL)
              <div className="wa-copy"><input readOnly value={s.webhookUrl} /><button className="crm-btn ghost sm" onClick={() => copy(s.webhookUrl)}>Copiar</button></div></label>
            <label>Token de verificación (Verify token)
              <div className="wa-copy"><input readOnly={!admin} value={f.verifyToken} onChange={set("verifyToken")} placeholder="Se genera solo al guardar" /><button className="crm-btn ghost sm" onClick={() => copy(f.verifyToken)} disabled={!f.verifyToken}>Copiar</button></div></label>
            <p className="wa-hint">Guarda primero el paso 1: hasta entonces Meta no podrá verificar el webhook.</p>
          </div>
          <div className="wa-card">
            <h3>Cómo conseguir los datos (una sola vez)</h3>
            <ol className="wa-steps">
              <li>Entra en <b>developers.facebook.com</b> con la cuenta de Meta Business de tu empresa › <b>Mis apps › Crear app</b> › tipo <b>Empresa</b> › añade el producto <b>WhatsApp</b>.</li>
              <li>En <b>WhatsApp › Configuración de la API</b> verás el <b>Phone number ID</b> y el <b>WABA ID</b>. Para probar, Meta da un número de prueba gratis; el número real se añade en esa misma pantalla.</li>
              <li>Token permanente: en <b>business.facebook.com › Configuración del negocio › Usuarios del sistema</b> crea un usuario (Administrador), asígnale la app y la cuenta de WhatsApp, y genera un token con los permisos <code>whatsapp_business_messaging</code> y <code>whatsapp_business_management</code> (caducidad: nunca).</li>
              <li>La <b>clave secreta</b> y el <b>App ID</b> están en tu app › <b>Configuración › Básica</b>.</li>
              <li>Pega todo en el paso 1, guarda, y después configura el webhook (paso 2).</li>
            </ol>
            <p className="wa-hint">Un número solo puede estar conectado a un sitio a la vez. Si tu número está en otra plataforma, prueba primero con el número de prueba de Meta. Si el número pasa aquí con la misma cuenta de WhatsApp Business, sus plantillas aprobadas aparecen solas.</p>
          </div>
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ embudos */

function FunnelsTab({ cfg, admin }) {
  const [funnels, setFunnels] = useState(cfg.funnels);
  const [fav, setFav] = useState(cfg.favoriteFunnelId);
  const [entry, setEntry] = useState(cfg.entry || { existingStage: "", reentryDays: 0 });
  const [state, save] = useSaver("funnels");
  const setF = (i, patch) => setFunnels((l) => l.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const setStage = (i, k, name) => setF(i, { stages: funnels[i].stages.map((s, j) => (j === k ? { ...s, name } : s)) });
  const favF = funnels.find((f) => f.id === fav) || funnels[0];
  return (
    <>
      <div className="wa-card">
        <h3>Embudos / Pipelines</h3>
        <p className="wa-hint">Organiza las conversaciones en columnas y muévelas según su etapa. ⭐ El embudo favorito es al que entran las conversaciones nuevas.</p>
        {funnels.map((f, i) => (
          <div key={f.id} className="wa-funnel">
            <div className="wa-funnel__head">
              <button className={`wa-star ${fav === f.id ? "on" : ""}`} disabled={!admin} onClick={() => setFav(f.id)} title="Embudo favorito">{fav === f.id ? "★" : "☆"}</button>
              <input value={f.name} disabled={!admin} onChange={(e) => setF(i, { name: e.target.value })} />
              {admin && <>
                <button className="wa-icon" onClick={() => setFunnels(move(funnels, i, -1))} title="Subir">▲</button>
                <button className="wa-icon" onClick={() => setFunnels(move(funnels, i, 1))} title="Bajar">▼</button>
                <button className="wa-icon" disabled={funnels.length < 2} onClick={() => window.confirm(`¿Borrar el embudo «${f.name}»? Sus chats quedarán fuera de los embudos.`) && setFunnels(funnels.filter((_, j) => j !== i))} title="Borrar embudo">🗑</button>
              </>}
            </div>
            <div className="wa-stages">
              {f.stages.map((s, k) => (
                <div key={s.id} className="wa-stage">
                  <span className="wa-stage__n">{k + 1}</span>
                  <input value={s.name} disabled={!admin} onChange={(e) => setStage(i, k, e.target.value)} />
                  {admin && <>
                    <button className="wa-icon" onClick={() => setF(i, { stages: move(f.stages, k, -1) })}>◀</button>
                    <button className="wa-icon" onClick={() => setF(i, { stages: move(f.stages, k, 1) })}>▶</button>
                    <button className="wa-icon" disabled={f.stages.length < 2} onClick={() => setF(i, { stages: f.stages.filter((_, j) => j !== k) })}>✕</button>
                  </>}
                </div>
              ))}
              {admin && f.stages.length < 20 && <button className="crm-btn ghost sm" onClick={() => setF(i, { stages: [...f.stages, { id: newId(), name: "Nueva etapa" }] })}>+ Nueva etapa</button>}
            </div>
          </div>
        ))}
        {admin && funnels.length < 30 && <button className="crm-btn ghost" onClick={() => setFunnels([...funnels, { id: newId(), name: "Nuevo embudo", stages: [{ id: newId(), name: "Nuevos chats" }, { id: newId(), name: "En curso" }, { id: newId(), name: "Cerrados" }] }])}>+ Crear embudo</button>}
      </div>
      <div className="wa-card">
        <h3>Cuando llega un mensaje</h3>
        <p className="wa-hint">Un contacto nuevo entra en la primera columna del embudo favorito (<b>{favF?.stages[0]?.name}</b> de «{favF?.name}»). Si la conversación ya está abierta en una columna, se queda donde está.</p>
        <label>Si escribe un contacto que ya existía y su chat estaba archivado o fuera de los embudos, ponerlo en
          <select className="wa-select" value={entry.existingStage} disabled={!admin} onChange={(e) => setEntry({ ...entry, existingStage: e.target.value })}>
            <option value="">La primera columna del embudo favorito</option>
            {funnels.map((f) => <optgroup key={f.id} label={f.name}>{f.stages.map((s) => <option key={s.id} value={`${f.id}:${s.id}`}>{s.name}</option>)}</optgroup>)}
          </select></label>
        <label>Si vuelve a escribir después de más de estos días, ponerlo otra vez en la primera columna (0 = nunca)
          <input type="number" min={0} max={365} value={entry.reentryDays} disabled={!admin} onChange={(e) => setEntry({ ...entry, reentryDays: e.target.value })} /></label>
      </div>
      <SaveBar admin={admin} state={state} onSave={() => save({ funnels, favoriteFunnelId: fav, entry })} />
    </>
  );
}

/* ------------------------------------------------------------------ equipos */

function TeamsTab({ cfg, admin }) {
  const people = usePeople();
  const [teams, setTeams] = useState(cfg.teams);
  const [routing, setRouting] = useState(cfg.routing);
  const [state, save] = useSaver("teams");
  const setT = (i, patch) => setTeams((l) => l.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  return (
    <>
      <div className="wa-card">
        <h3>Equipos</h3>
        <p className="wa-hint">Agrupa a los agentes. Un chat se puede asignar a un agente y a un equipo, y en la bandeja se filtra por equipo.</p>
        {teams.map((t, i) => (
          <div key={t.id} className="wa-funnel">
            <div className="wa-funnel__head">
              <input value={t.name} disabled={!admin} onChange={(e) => setT(i, { name: e.target.value })} />
              <small className="wa-hint">{t.members.length} miembro{t.members.length === 1 ? "" : "s"}</small>
              {admin && <button className="wa-icon" onClick={() => setTeams(teams.filter((_, j) => j !== i))}>🗑</button>}
            </div>
            <div className="wa-chips">
              {people.map((p) => {
                const on = t.members.includes(p.email);
                return <button key={p.email} disabled={!admin} className={`wa-chip ${on ? "on" : ""}`} onClick={() => setT(i, { members: on ? t.members.filter((x) => x !== p.email) : [...t.members, p.email] })}>{p.name}</button>;
              })}
            </div>
          </div>
        ))}
        {admin && <button className="crm-btn ghost" onClick={() => setTeams([...teams, { id: newId(), name: "Nuevo equipo", members: [] }])}>+ Crear equipo</button>}
      </div>
      <div className="wa-card">
        <h3>Asignación automática</h3>
        <label className="wa-check"><input type="checkbox" disabled={!admin} checked={routing.enabled} onChange={(e) => setRouting({ ...routing, enabled: e.target.checked })} /> Asignar cada conversación nueva a un agente al azar</label>
        <label className="wa-check"><input type="checkbox" disabled={!admin} checked={routing.includeAway} onChange={(e) => setRouting({ ...routing, includeAway: e.target.checked })} /> Incluir a los agentes ausentes (si no, solo a los que están «Disponible»)</label>
        <p className="wa-hint">Solo entre los miembros de estos equipos (ninguno marcado = todo el personal):</p>
        <div className="wa-chips">
          {teams.map((t) => {
            const on = routing.teamIds.includes(t.id);
            return <button key={t.id} disabled={!admin} className={`wa-chip ${on ? "on" : ""}`} onClick={() => setRouting({ ...routing, teamIds: on ? routing.teamIds.filter((x) => x !== t.id) : [...routing.teamIds, t.id] })}>👥 {t.name}</button>;
          })}
          {!teams.length && <small className="wa-hint">Aún no hay equipos.</small>}
        </div>
        {cfg.chatbot.enabled && <p className="wa-hint">⚠ El chatbot está activo: la asignación la deciden sus opciones (y esta regla se aplica si la opción no asigna a nadie).</p>}
        <p className="wa-hint">Agentes ausentes ahora: {Object.keys(cfg.away || {}).length ? Object.keys(cfg.away).map((e) => people.find((p) => p.email === e)?.name || e).join(", ") : "ninguno"}. Cada uno cambia su estado con el botón Disponible/Ausente de la bandeja.</p>
      </div>
      <SaveBar admin={admin} state={state} onSave={() => save({ teams, routing })} />
    </>
  );
}

/* ------------------------------------------------------------------ respuestas rápidas */

function QuickTab({ cfg, admin }) {
  const me = (auth.currentUser?.email || "").toLowerCase();
  const [all, setAll] = useState(false);
  const [edit, setEdit] = useState(null);
  const [msg, setMsg] = useState(null);
  const list = (cfg.quickReplies || []).filter((q) => all || q.shared || q.ownerEmail === me);
  const saveOne = async (item) => {
    setMsg(null);
    try { await saveConfig("quickReply", item); setEdit(null); setMsg({ text: item.delete ? "Borrada." : "Guardada." }); } catch (e) { setMsg({ err: true, text: e.message }); }
  };
  return (
    <div className="wa-card">
      <h3>Respuestas rápidas</h3>
      <p className="wa-hint">Textos que se usan desde el chat escribiendo <b>/</b> o con el botón ⚡. Usa <b>{"{nombre}"}</b> para poner el nombre del cliente. Las compartidas las ve todo el equipo.</p>
      {admin && <label className="wa-check"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Ver las de todos los usuarios</label>}
      {list.map((q) => (
        <div key={q.id} className="wa-qr">
          <div><b>/{q.title}</b> {q.shared ? <span className="wa-tag ok">Compartida</span> : <span className="wa-tag">Personal</span>} <small className="wa-hint">{q.ownerName}</small><p>{q.text}</p></div>
          {(admin || q.ownerEmail === me) && <div className="wa-qr__tools">
            <button className="crm-btn ghost sm" onClick={() => setEdit(q)}>Editar</button>
            <button className="crm-btn ghost sm" onClick={() => window.confirm(`¿Borrar «${q.title}»?`) && saveOne({ id: q.id, delete: true })}>Borrar</button>
          </div>}
        </div>
      ))}
      {!list.length && <p className="wa-hint">Aún no hay respuestas rápidas.</p>}
      {edit ? (
        <div className="wa-qr-edit">
          <label>Título (lo que escribes tras «/»)<input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="cita" /></label>
          <label>Texto<textarea rows={4} value={edit.text} onChange={(e) => setEdit({ ...edit, text: e.target.value })} placeholder="Hola {nombre}, puedes pedir cita aquí: https://…" /></label>
          <label className="wa-check"><input type="checkbox" checked={!!edit.shared} onChange={(e) => setEdit({ ...edit, shared: e.target.checked })} /> Compartida con todo el equipo</label>
          <div style={{ display: "flex", gap: 8 }}><button className="crm-btn" onClick={() => saveOne(edit)}>Guardar</button><button className="crm-btn ghost" onClick={() => setEdit(null)}>Cancelar</button></div>
        </div>
      ) : <button className="crm-btn" onClick={() => setEdit({ title: "", text: "", shared: true })}>+ Crear respuesta</button>}
      {msg && <p className={msg.err ? "wa-err" : "wa-ok"}>{msg.text}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ auto respuesta */

const DAYS = [["1", "Lunes"], ["2", "Martes"], ["3", "Miércoles"], ["4", "Jueves"], ["5", "Viernes"], ["6", "Sábado"], ["0", "Domingo"]];
const TZS = ["Atlantic/Canary", "Europe/Madrid", "America/Bogota", "America/Mexico_City"];

function AutoTab({ cfg, admin }) {
  const [a, setA] = useState(cfg.autoReply);
  const [state, save] = useSaver("autoReply");
  const part = (k, patch) => setA((x) => ({ ...x, [k]: { ...x[k], ...patch } }));
  const day = (d, patch) => part("hours", { days: { ...a.hours.days, [d]: { ...a.hours.days[d], ...patch } } });
  return (
    <>
      {cfg.chatbot.enabled && <p className="wa-hint">⚠ El chatbot está activo: el mensaje de bienvenida no se envía (el chatbot hace de bienvenida).</p>}
      <div className="wa-card">
        <h3>Mensaje de bienvenida</h3>
        <label className="wa-check"><input type="checkbox" disabled={!admin} checked={a.welcome.enabled} onChange={(e) => part("welcome", { enabled: e.target.checked })} /> Responder automáticamente a cada cliente nuevo (solo la primera vez que escribe)</label>
        <textarea className="wa-notes" rows={3} disabled={!admin} value={a.welcome.text} onChange={(e) => part("welcome", { text: e.target.value })} placeholder="¡Hola! Gracias por escribir a ISLAS SEM. En breve te atendemos." />
      </div>
      <div className="wa-card">
        <h3>Mensaje de cierre</h3>
        <label className="wa-check"><input type="checkbox" disabled={!admin} checked={a.closing.enabled} onChange={(e) => part("closing", { enabled: e.target.checked })} /> Enviar un mensaje después de archivar la conversación</label>
        <label>Enviar a los … minutos de archivarla<input type="number" min={0} max={1440} disabled={!admin} value={a.closing.minutes} onChange={(e) => part("closing", { minutes: e.target.value })} /></label>
        <textarea className="wa-notes" rows={3} disabled={!admin} value={a.closing.text} onChange={(e) => part("closing", { text: e.target.value })} placeholder="Gracias por contactar con nosotros. ¡Que tengas un buen día!" />
        <p className="wa-hint">Solo se envía si la ventana de 24 h sigue abierta y el chat sigue archivado.</p>
      </div>
      <div className="wa-card">
        <h3>Fuera del horario laboral</h3>
        <label className="wa-check"><input type="checkbox" disabled={!admin} checked={a.hours.enabled} onChange={(e) => part("hours", { enabled: e.target.checked })} /> Avisar automáticamente cuando escriban fuera de horario</label>
        <table className="wa-hours"><tbody>
          {DAYS.map(([d, l]) => (
            <tr key={d}>
              <td><label className="wa-check" style={{ margin: 0 }}><input type="checkbox" disabled={!admin} checked={a.hours.days[d]?.on} onChange={(e) => day(d, { on: e.target.checked })} /> {l}</label></td>
              <td><input type="time" disabled={!admin || !a.hours.days[d]?.on} value={a.hours.days[d]?.from} onChange={(e) => day(d, { from: e.target.value })} /></td>
              <td><input type="time" disabled={!admin || !a.hours.days[d]?.on} value={a.hours.days[d]?.to} onChange={(e) => day(d, { to: e.target.value })} /></td>
            </tr>
          ))}
        </tbody></table>
        <label>Zona horaria<select className="wa-select" disabled={!admin} value={a.hours.tz} onChange={(e) => part("hours", { tz: e.target.value })}>{TZS.map((z) => <option key={z}>{z}</option>)}</select></label>
        <textarea className="wa-notes" rows={3} disabled={!admin} value={a.hours.text} onChange={(e) => part("hours", { text: e.target.value })} placeholder="Ahora estamos fuera de horario (L-J 10-17 h, V 8-14 h). Te respondemos en cuanto volvamos." />
        <label>No repetir el aviso al mismo cliente antes de … horas<input type="number" min={1} max={168} disabled={!admin} value={a.hours.everyHours} onChange={(e) => part("hours", { everyHours: e.target.value })} /></label>
      </div>
      <SaveBar admin={admin} state={state} onSave={() => save({ autoReply: a })} />
    </>
  );
}

/* ------------------------------------------------------------------ chatbot */

function ChatbotTab({ cfg, admin }) {
  const people = usePeople();
  const [b, setB] = useState(cfg.chatbot);
  const [state, save] = useSaver("chatbot");
  const setO = (i, patch) => setB((x) => ({ ...x, options: x.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) }));
  return (
    <>
      <div className="wa-card">
        <h3>Chatbot (menú de opciones)</h3>
        <p className="wa-hint">A cada conversación nueva se le envía un menú. Cada opción puede contestar, asignar a un equipo (a un agente disponible al azar) o a un agente, mover el chat a una columna y etiquetarlo. Al activarlo se desactivan el mensaje de bienvenida y la asignación automática básica.</p>
        <label className="wa-check"><input type="checkbox" disabled={!admin} checked={b.enabled} onChange={(e) => setB({ ...b, enabled: e.target.checked })} /> Activar chatbot</label>
        <label>Mensaje del menú<textarea className="wa-notes" rows={3} disabled={!admin} value={b.text} onChange={(e) => setB({ ...b, text: e.target.value })} placeholder="¡Hola! Soy el asistente de ISLAS SEM. ¿En qué podemos ayudarte?" /></label>
        <label>Texto del botón de la lista (si hay más de 3 opciones, máx. 20)<input maxLength={20} disabled={!admin} value={b.button} onChange={(e) => setB({ ...b, button: e.target.value })} /></label>
      </div>
      {b.options.map((o, i) => (
        <div key={o.id} className="wa-card">
          <div className="wa-funnel__head">
            <b>Opción {i + 1}</b>
            <span style={{ flex: 1 }} />
            {admin && <><button className="wa-icon" onClick={() => setB({ ...b, options: move(b.options, i, -1) })}>▲</button><button className="wa-icon" onClick={() => setB({ ...b, options: move(b.options, i, 1) })}>▼</button>
              <button className="wa-icon" onClick={() => setB({ ...b, options: b.options.filter((_, j) => j !== i) })}>🗑</button></>}
          </div>
          <div className="crm-two">
            <label>Texto de la opción (máx. 24)<input maxLength={24} disabled={!admin} value={o.label} onChange={(e) => setO(i, { label: e.target.value })} placeholder="Información de cursos" /></label>
            <label>Descripción (opcional, máx. 72)<input maxLength={72} disabled={!admin} value={o.description} onChange={(e) => setO(i, { description: e.target.value })} /></label>
          </div>
          <label>Respuesta automática (opcional)<textarea className="wa-notes" rows={2} disabled={!admin} value={o.reply} onChange={(e) => setO(i, { reply: e.target.value })} placeholder="Perfecto, te pasamos con el equipo de formación." /></label>
          <div className="crm-two">
            <label>Asignar al equipo<select className="wa-select" disabled={!admin} value={o.teamId} onChange={(e) => setO(i, { teamId: e.target.value })}><option value="">—</option>{cfg.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
            <label>…o a un agente concreto<select className="wa-select" disabled={!admin} value={o.assigneeEmail} onChange={(e) => setO(i, { assigneeEmail: e.target.value })}><option value="">—</option>{people.map((p) => <option key={p.email} value={p.email}>{p.name}</option>)}</select></label>
            <label>Mover a la columna<select className="wa-select" disabled={!admin} value={o.stage} onChange={(e) => setO(i, { stage: e.target.value })}><option value="">—</option>{cfg.funnels.map((f) => <optgroup key={f.id} label={f.name}>{f.stages.map((s) => <option key={s.id} value={`${f.id}:${s.id}`}>{s.name}</option>)}</optgroup>)}</select></label>
            <label>Etiquetar<select className="wa-select" disabled={!admin} value={o.tagId} onChange={(e) => setO(i, { tagId: e.target.value })}><option value="">—</option>{cfg.tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          </div>
        </div>
      ))}
      {admin && b.options.length < 10 && <button className="crm-btn ghost" onClick={() => setB({ ...b, options: [...b.options, { id: newId(), label: "", description: "", reply: "", teamId: "", assigneeEmail: "", stage: "", tagId: "" }] })}>+ Añadir opción</button>}
      <SaveBar admin={admin} state={state} onSave={() => save({ chatbot: b })} />
    </>
  );
}

/* ------------------------------------------------------------------ etiquetas y general */

const COLORS = ["#0e7c7b", "#1a73e8", "#8e44ad", "#d35400", "#c0392b", "#27ae60", "#b8860b", "#555555"];

function TagsTab({ cfg, admin }) {
  const [tags, setTags] = useState(cfg.tags);
  const [state, save] = useSaver("tags");
  const setT = (i, patch) => setTags((l) => l.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  return (
    <>
      <div className="wa-card">
        <h3>Etiquetas</h3>
        <p className="wa-hint">Para clasificar los chats (y filtrar la bandeja o hacer difusiones a una etiqueta).</p>
        {tags.map((t, i) => (
          <div key={t.id} className="wa-tagrow">
            <span className="wa-tag" style={{ background: t.color, color: "#fff" }}>{t.name || "…"}</span>
            <input value={t.name} disabled={!admin} maxLength={40} onChange={(e) => setT(i, { name: e.target.value })} />
            <div className="wa-colors">{COLORS.map((c) => <button key={c} disabled={!admin} className={t.color === c ? "on" : ""} style={{ background: c }} onClick={() => setT(i, { color: c })} />)}</div>
            {admin && <button className="wa-icon" onClick={() => setTags(tags.filter((_, j) => j !== i))}>🗑</button>}
          </div>
        ))}
        {admin && <button className="crm-btn ghost" onClick={() => setTags([...tags, { id: newId(), name: "", color: COLORS[tags.length % COLORS.length] }])}>+ Nueva etiqueta</button>}
      </div>
      <SaveBar admin={admin} state={state} onSave={() => save({ tags })} />
    </>
  );
}

function GeneralTab({ cfg, admin }) {
  const [cc, setCc] = useState(cfg.defaultCountry || "34");
  const [state, save] = useSaver("general");
  return (
    <>
      <div className="wa-card">
        <h3>General</h3>
        <label>Prefijo de país por defecto (para teléfonos del CRM guardados sin prefijo, de 9 cifras)<input value={cc} disabled={!admin} onChange={(e) => setCc(e.target.value)} placeholder="34" /></label>
        <p className="wa-hint">Bajas: si un cliente escribe <b>BAJA</b> o <b>STOP</b> no recibirá difusiones (si escribe <b>ALTA</b>, vuelve a recibirlas). Las conversaciones normales siguen funcionando.</p>
      </div>
      <SaveBar admin={admin} state={state} onSave={() => save({ defaultCountry: cc })} />
    </>
  );
}
