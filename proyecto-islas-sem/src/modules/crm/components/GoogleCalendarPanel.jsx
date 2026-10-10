// Google Calendar en Tareas:
// - "Mi calendario": cada trabajador conecta su cuenta @islassem.com. Sus citas llegan como
//   tareas suyas y las tareas que le asignan con hora se publican en su calendario.
// - "Calendario de la empresa" (grupo@): solo los administradores lo conectan y eligen a
//   quién se asignan las citas que llegan. También ven qué trabajadores tienen el suyo.
import { useState } from "react";
import { googleApi } from "../lib/tasks";

const MSG = {
  ok: ["ok", "Google Calendar conectado. Las citas aparecerán en unos minutos."],
  cancelado: ["warn", "Conexión cancelada en Google."],
  caducado: ["warn", "El enlace de conexión caducó. Vuelve a pulsar «Conectar»."],
  "sin-permiso": ["warn", "Google no dio permiso permanente. Vuelve a conectar y acepta todos los permisos."],
  error: ["bad", "No se pudo completar la conexión con Google. Inténtalo de nuevo."],
};

const hhmm = (t) => (t ? new Date(t).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "");

export default function GoogleCalendarPanel({ status, refresh, options, result }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!status) return null;
  const msg = MSG[result];
  const me = status.me || {};

  const run = async (fn) => {
    setBusy(true); setErr("");
    try { await fn(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const connect = (scope) => run(async () => { const { url } = await googleApi("connect", { method: "POST", body: { scope } }); window.location.href = url; });
  const disconnect = (scope) => window.confirm("¿Desconectar este Google Calendar? Las citas ya importadas se quedan; dejarán de llegar nuevas.") &&
    run(async () => { await googleApi("disconnect", { method: "POST", body: { scope } }); refresh(); });
  const setDefault = (key) => run(async () => {
    const o = options.find((x) => x.key === key);
    await googleApi("settings", { method: "POST", body: { defaultAssignee: o ? { type: o.type, id: o.id, name: o.name, email: o.email } : null } });
    refresh();
  });
  const defKey = status.defaultAssignee ? `${status.defaultAssignee.type}:${status.defaultAssignee.id}` : "";
  const chip = (x) => (x.connected ? <span className="crm-chip ok">Conectado · {x.account}</span> : <span className="crm-chip warn">Sin conectar</span>);
  const row = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 };
  const sub = { fontSize: 12.5, color: "var(--crm-muted)", marginTop: 4 };

  if (status.error) {
    return <div className="crm-panel" style={{ marginBottom: 14 }}>📅 <b>Google Calendar</b> <span className="crm-chip bad">No disponible</span><div style={sub}>{status.error}</div></div>;
  }

  return (
    <div className="crm-panel" style={{ marginBottom: 14, display: "grid", gap: 12 }}>
      {/* Mi calendario */}
      <div style={row}>
        <div style={{ fontSize: 22 }}>📅</div>
        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          <b>Mi Google Calendar</b> {chip(me)}
          <div style={sub}>
            {me.connected
              ? `Tus citas llegan como tareas tuyas y las tareas que te asignen con hora aparecen en tu calendario${me.lastSyncAt ? ` · última sincronización ${hhmm(me.lastSyncAt)}` : ""}.`
              : !status.configured ? "Falta configurar el acceso a Google en el servidor."
              : `Conecta tu cuenta (${me.email || "@islassem.com"}) para ver aquí tus citas y recibir en tu calendario las tareas que te asignen.`}
            {me.lastError && <div style={{ color: "#b0304c" }}>⚠ {me.lastError}</div>}
          </div>
        </div>
        {status.configured && (me.connected
          ? <button className="crm-btn ghost sm" disabled={busy} onClick={() => disconnect("me")}>Desconectar</button>
          : <button className="crm-btn" disabled={busy} onClick={() => connect("me")}>{busy ? "Abriendo Google…" : "Conectar mi calendario"}</button>)}
      </div>

      {/* Calendario de la empresa (administradores) */}
      {status.isAdmin && (
        <div style={{ ...row, borderTop: "1px solid #eef3f3", paddingTop: 12 }}>
          <div style={{ fontSize: 22 }}>🏢</div>
          <div style={{ flex: "1 1 260px", minWidth: 0 }}>
            <b>Calendario de la empresa</b> {chip(status)}
            <div style={sub}>
              {status.connected
                ? `Las citas reservadas llegan como tareas cada 2 minutos${status.lastSyncAt ? ` · última sincronización ${hhmm(status.lastSyncAt)}` : ""}.`
                : "Conecta la cuenta grupo@islassem.com para ver aquí las citas que reserva la gente."}
              {status.lastError && <div style={{ color: "#b0304c" }}>⚠ {status.lastError}</div>}
              {(status.people || []).length > 0 && (
                <div style={{ marginTop: 4 }}>
                  Trabajadores con su calendario conectado: {status.people.map((p) => `${p.email}${p.connected ? "" : " (reconectar)"}`).join(", ")}
                </div>
              )}
            </div>
          </div>
          {status.connected && (
            <label style={{ fontSize: 12.5, display: "flex", flexDirection: "column", gap: 3 }}>
              Asignar las citas nuevas a
              <select value={defKey} disabled={busy} onChange={(e) => setDefault(e.target.value)} style={{ border: "1px solid #dfe7e7", borderRadius: 8, padding: "6px 8px" }}>
                <option value="">Sin asignar (administradores)</option>
                {options.map((o) => <option key={o.key} value={o.key}>{o.type === "team" ? "👥 " : ""}{o.name}</option>)}
              </select>
            </label>
          )}
          {status.configured && (status.connected
            ? <button className="crm-btn ghost sm" disabled={busy} onClick={() => disconnect("company")}>Desconectar</button>
            : <button className="crm-btn" disabled={busy} onClick={() => connect("company")}>{busy ? "Abriendo Google…" : "Conectar calendario de la empresa"}</button>)}
        </div>
      )}
      {msg && <div className={`crm-chip ${msg[0]}`} style={{ justifySelf: "start" }}>{msg[1]}</div>}
      {err && <div style={{ color: "#b0304c", fontSize: 12.5 }}>{err}</div>}
    </div>
  );
}
