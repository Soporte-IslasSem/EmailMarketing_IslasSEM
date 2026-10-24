import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { waApi } from "../lib/api";
import "../../crm/crm.styles.css";
import "../whatsapp.css";

// Conexión con la API oficial de WhatsApp (Meta). El token y la clave secreta se guardan en
// el servidor y no se vuelven a mostrar: para cambiarlos se escriben de nuevo.
export default function WhatsAppSettings() {
  const [s, setS] = useState(null);
  const [admin, setAdmin] = useState(false);
  const [f, setF] = useState({ phoneNumberId: "", wabaId: "", token: "", appSecret: "", verifyToken: "" });
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => waApi("settings").then((r) => {
    setS(r.settings); setAdmin(r.admin);
    setF((x) => ({ ...x, phoneNumberId: r.settings.phoneNumberId, wabaId: r.settings.wabaId, verifyToken: r.settings.verifyToken, token: "", appSecret: "" }));
  }).catch((e) => setMsg({ err: true, text: e.message }));
  useEffect(() => { load(); }, []);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      await waApi("settings", f);
      setMsg({ text: "Conectado y guardado. Meta ha confirmado los datos." });
      await load();
    } catch (e) { setMsg({ err: true, text: e.message }); }
    setSaving(false);
  };
  const copy = (t) => navigator.clipboard?.writeText(t).then(() => setMsg({ text: "Copiado." })).catch(() => {});

  if (!s) return <div className="crm wa-settings"><p>{msg?.text || "Cargando…"}</p></div>;
  const connected = s.hasToken && s.phoneNumberId && s.displayPhone;
  return (
    <div className="crm wa-settings">
      <div className="crm__top"><h1 style={{ margin: 0 }}>WhatsApp · Ajustes</h1><Link to="/dashboard/whatsapp" className="crm-btn ghost sm">← Chats</Link></div>

      <div className={`wa-status ${connected ? "ok" : ""}`}>
        {connected
          ? <>✅ Conectado: <b>{s.displayPhone}</b> {s.verifiedName && <>({s.verifiedName})</>} {s.quality && <> · calidad {s.quality}</>}</>
          : <>⚪ Sin conectar. Sigue los pasos de abajo.</>}
      </div>

      <div className="wa-card">
        <h3>1 · Datos de la app de Meta</h3>
        {!admin && <p className="wa-hint">Solo un administrador puede cambiar estos datos.</p>}
        <label>Identificador del número de teléfono (Phone number ID)
          <input value={f.phoneNumberId} onChange={set("phoneNumberId")} disabled={!admin} placeholder="p. ej. 123456789012345" />
        </label>
        <label>Identificador de la cuenta de WhatsApp Business (WABA ID)
          <input value={f.wabaId} onChange={set("wabaId")} disabled={!admin} placeholder="p. ej. 102938475610293" />
        </label>
        <label>Token de acceso {s.hasToken && <span className="wa-ok">· guardado (déjalo vacío para mantenerlo)</span>}
          <input type="password" autoComplete="off" value={f.token} onChange={set("token")} disabled={!admin} placeholder={s.hasToken ? "••••••••" : "Token permanente del usuario del sistema"} />
        </label>
        <label>Clave secreta de la app (App secret) {s.hasAppSecret && <span className="wa-ok">· guardada</span>}
          <input type="password" autoComplete="off" value={f.appSecret} onChange={set("appSecret")} disabled={!admin} placeholder={s.hasAppSecret ? "••••••••" : "Configuración de la app › Básica › Clave secreta"} />
        </label>
        {admin && <button className="crm-btn" onClick={save} disabled={saving}>{saving ? "Comprobando con Meta…" : "Guardar y probar conexión"}</button>}
        {msg && <p className={msg.err ? "wa-err" : "wa-ok"} style={{ marginTop: 10 }}>{msg.text}</p>}
      </div>

      <div className="wa-card">
        <h3>2 · Webhook (para recibir los mensajes)</h3>
        <p className="wa-hint">En Meta for Developers › tu app › WhatsApp › Configuración › Webhook, pega estos dos valores y suscríbete al campo <b>messages</b>.</p>
        <label>URL de devolución de llamada (Callback URL)
          <div className="wa-copy"><input readOnly value={s.webhookUrl} /><button className="crm-btn ghost sm" onClick={() => copy(s.webhookUrl)}>Copiar</button></div>
        </label>
        <label>Token de verificación (Verify token)
          <div className="wa-copy"><input readOnly={!admin} value={f.verifyToken} onChange={set("verifyToken")} placeholder="Se genera solo al guardar" /><button className="crm-btn ghost sm" onClick={() => copy(f.verifyToken)} disabled={!f.verifyToken}>Copiar</button></div>
        </label>
        <p className="wa-hint">Guarda primero el paso 1: hasta entonces Meta no podrá verificar el webhook.</p>
      </div>

      <div className="wa-card">
        <h3>Cómo conseguir los datos (una sola vez)</h3>
        <ol className="wa-steps">
          <li>Entra en <b>developers.facebook.com</b> con la cuenta de Meta Business de ISLAS SEM › <b>Mis apps › Crear app</b> › tipo <b>Empresa</b> › añade el producto <b>WhatsApp</b>.</li>
          <li>En <b>WhatsApp › Configuración de la API</b> verás el <b>Phone number ID</b> y el <b>WABA ID</b>. Para probar, Meta da un número de prueba gratis; el número real se añade en esa misma pantalla.</li>
          <li>Token permanente: en <b>business.facebook.com › Configuración del negocio › Usuarios del sistema</b> crea un usuario (Administrador), asígnale la app y la cuenta de WhatsApp, y genera un token con los permisos <code>whatsapp_business_messaging</code> y <code>whatsapp_business_management</code> (caducidad: nunca).</li>
          <li>La <b>clave secreta</b> está en tu app › <b>Configuración › Básica</b>.</li>
          <li>Pega todo en el paso 1, guarda, y después configura el webhook (paso 2).</li>
        </ol>
        <p className="wa-hint">Recuerda: un número solo puede estar conectado a un sitio. Mientras el número real siga en ManyContacts, prueba con el número de prueba de Meta.</p>
      </div>
    </div>
  );
}
