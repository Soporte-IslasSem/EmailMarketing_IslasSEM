// Estado de la conexión con Google Calendar (grupo@) en Tareas: conectar, a quién se
// asignan las citas que llegan, desconectar. Solo los administradores pueden cambiarlo.
import { useState } from "react";
import { googleApi } from "../lib/tasks";

const MSG = {
  ok: ["ok", "Google Calendar conectado. Las citas aparecerán en unos minutos."],
  cancelado: ["warn", "Conexión cancelada en Google."],
  caducado: ["warn", "El enlace de conexión caducó. Vuelve a pulsar «Conectar Google Calendar»."],
  "sin-permiso": ["warn", "Google no dio permiso permanente. Vuelve a conectar y acepta todos los permisos."],
  error: ["bad", "No se pudo completar la conexión con Google. Inténtalo de nuevo."],
};

export default function GoogleCalendarPanel({ status, refresh, options, result }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!status) return null;
  const msg = MSG[result];

  const run = async (fn) => {
    setBusy(true); setErr("");
    try { await fn(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const connect = () => run(async () => { const { url } = await googleApi("connect", { method: "POST" }); window.location.href = url; });
  const disconnect = () => window.confirm("¿Desconectar Google Calendar? Las citas ya importadas se quedan; dejarán de llegar nuevas.") &&
    run(async () => { await googleApi("disconnect", { method: "POST" }); refresh(); });
  const setDefault = (key) => run(async () => {
    const o = options.find((x) => x.key === key);
    await googleApi("settings", { method: "POST", body: { defaultAssignee: o ? { type: o.type, id: o.id, name: o.name, email: o.email } : null } });
    refresh();
  });
  const defKey = status.defaultAssignee ? `${status.defaultAssignee.type}:${status.defaultAssignee.id}` : "";
  const when = status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <div className="crm-panel" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 14 }}>
      <div style={{ fontSize: 22 }}>📅</div>
      <div style={{ flex: "1 1 260px", minWidth: 0 }}>
        <b>Google Calendar</b>{" "}
        {status.error ? <span className="crm-chip bad">No disponible</span>
          : status.connected ? <span className="crm-chip ok">Conectado · {status.account}</span>
          : <span className="crm-chip warn">Sin conectar</span>}
        <div style={{ fontSize: 12.5, color: "var(--crm-muted)", marginTop: 4 }}>
          {status.error ? status.error
            : status.connected ? `Las citas reservadas llegan como tareas cada 2 minutos${when ? ` · última sincronización ${when}` : ""}.`
            : !status.configured ? "Falta configurar el acceso a Google en el servidor."
            : "Conecta la cuenta grupo@islassem.com para ver aquí las citas que reserva la gente."}
          {status.lastError && <div style={{ color: "#b0304c" }}>⚠ {status.lastError}</div>}
        </div>
        {msg && <div className={`crm-chip ${msg[0]}`} style={{ marginTop: 6, display: "inline-block" }}>{msg[1]}</div>}
        {err && <div style={{ color: "#b0304c", fontSize: 12.5, marginTop: 4 }}>{err}</div>}
      </div>
      {status.isAdmin && status.connected && (
        <label style={{ fontSize: 12.5, display: "flex", flexDirection: "column", gap: 3 }}>
          Asignar las citas nuevas a
          <select value={defKey} disabled={busy} onChange={(e) => setDefault(e.target.value)} style={{ border: "1px solid #dfe7e7", borderRadius: 8, padding: "6px 8px" }}>
            <option value="">Sin asignar (administradores)</option>
            {options.map((o) => <option key={o.key} value={o.key}>{o.type === "team" ? "👥 " : ""}{o.name}</option>)}
          </select>
        </label>
      )}
      {status.isAdmin && status.configured && !status.error && (
        status.connected
          ? <button className="crm-btn ghost sm" disabled={busy} onClick={disconnect}>Desconectar</button>
          : <button className="crm-btn" disabled={busy} onClick={connect}>{busy ? "Abriendo Google…" : "Conectar Google Calendar"}</button>
      )}
    </div>
  );
}
