// Restaurantes › Panel, Reservas, Reseñas, Campañas, Equipo y fichajes y Ajustes.
// Todas trabajan sobre los datos de las fichas (de momento introducidos a mano).
import { useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../../config/firebaseConfig";
import { crmUpdate } from "../../crm/lib/crm";
import {
  COLLECTION, SETTINGS_COLLECTION, DEFAULT_BRAND, TIME_TRACKING, TPV_STATUS,
  toUrl, waUrl, num, completion, missingFields,
} from "../lib/restaurants";

const byName = (items) => [...items].sort((a, b) => (a.name || "").localeCompare(b.name || ""));

function Name({ r }) {
  const navigate = useNavigate();
  return <span className="rp-name" onClick={() => navigate(`/restaurantes/clientes/${r.id}`)}>{r.name || "(sin nombre)"}</span>;
}

function Link({ href, label = "Abrir" }) {
  return href
    ? <a className="rf-open" href={href} target="_blank" rel="noreferrer">{label}</a>
    : <span className="rf-open off" title="Sin dato en la ficha">{label}</span>;
}

function Empty({ cols, loading, text }) {
  const navigate = useNavigate();
  return (
    <tr><td colSpan={cols} className="rp-empty">
      {loading ? "Cargando…" : <>{text} <span className="rp-name" style={{ color: "#1f5c46" }} onClick={() => navigate("/restaurantes/clientes")}>Ir a Clientes</span></>}
    </td></tr>
  );
}

const quickSave = (id, data) => crmUpdate(COLLECTION, id, data).catch((e) => alert("No se pudo guardar: " + e.message));

/* ============ Panel ============ */
export function Panel() {
  const { items, loading } = useOutletContext();
  const navigate = useNavigate();
  const s = useMemo(() => ({
    total: items.length,
    customers: items.reduce((a, r) => a + num(r.customerCount), 0),
    nfc: items.reduce((a, r) => a + num(r.nfcUnits), 0),
    birthday: items.filter((r) => r.birthdayAutomation).length,
    timeTracking: items.filter((r) => r.timeTracking === "Fichaje activo").length,
    tpvDone: items.filter((r) => r.tpvStatus === "Integrado").length,
    tpvWip: items.filter((r) => r.tpvStatus === "En proceso").length,
    avg: items.length ? Math.round(items.reduce((a, r) => a + completion(r), 0) / items.length) : 0,
  }), [items]);
  const incomplete = useMemo(() => [...items].map((r) => ({ r, pct: completion(r), miss: missingFields(r) })).filter((x) => x.pct < 100).sort((a, b) => a.pct - b.pct).slice(0, 8), [items]);

  return (
    <div>
      <div className="rp-top">
        <div>
          <h1 className="rp-title">Panel</h1>
          <p className="rp-sub">Resumen de todos los restaurantes.</p>
        </div>
        <button className="rf-btn primary" onClick={() => navigate("/restaurantes/clientes")}>Ver clientes</button>
      </div>
      <div className="rp-stats">
        <div className="rp-stat"><small>Restaurantes</small><b>{loading ? "…" : s.total}</b></div>
        <div className="rp-stat"><small>Clientela registrada</small><b>{s.customers.toLocaleString("es-ES")}</b></div>
        <div className="rp-stat"><small>NFC en mesa activos</small><b>{s.nfc.toLocaleString("es-ES")}</b></div>
        <div className="rp-stat"><small>Cumpleaños / aniversarios ON</small><b>{s.birthday}</b></div>
        <div className="rp-stat"><small>Con fichaje activo</small><b>{s.timeTracking}</b></div>
        <div className="rp-stat"><small>TPV integrado · en proceso</small><b>{s.tpvDone} · {s.tpvWip}</b></div>
        <div className="rp-stat"><small>Fichas completas (media)</small><b>{s.avg}%</b></div>
      </div>
      <h2 style={{ fontSize: 16, margin: "6px 0 10px" }}>Fichas por completar</h2>
      <div className="rp-wrap">
        <table className="rp-table">
          <thead><tr><th>Restaurante</th><th>Completado</th><th>Falta</th></tr></thead>
          <tbody>
            {incomplete.length ? incomplete.map(({ r, pct, miss }) => (
              <tr key={r.id}>
                <td><Name r={r} /></td>
                <td style={{ whiteSpace: "nowrap" }}><span className="rp-bar"><i style={{ width: `${pct}%` }} /></span><span className="rp-muted">{pct}%</span></td>
                <td className="rp-muted" style={{ fontSize: 13 }}>{miss.slice(0, 5).map(([, l]) => l).join(", ")}{miss.length > 5 ? ` y ${miss.length - 5} más` : ""}</td>
              </tr>
            )) : <Empty cols={3} loading={loading} text={items.length ? "Todas las fichas están completas." : "Aún no hay restaurantes."} />}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============ Reservas ============ */
export function Reservations() {
  const { items, loading } = useOutletContext();
  const rows = useMemo(() => byName(items), [items]);
  return (
    <div>
      <h1 className="rp-title">Reservas</h1>
      <p className="rp-sub">Motor de reservas de cada restaurante: teléfonos, WhatsApp, calendario y base de clientela.</p>
      <div className="rp-wrap">
        <table className="rp-table">
          <thead><tr><th>Restaurante</th><th>Teléfono fijo</th><th>Móvil</th><th>WhatsApp</th><th>Calendario de reservas</th><th>Clientela</th></tr></thead>
          <tbody>
            {rows.length ? rows.map((r) => (
              <tr key={r.id}>
                <td><Name r={r} /></td>
                <td>{r.phoneLandline ? <a className="rp-mono" style={{ color: "#1f5c46" }} href={`tel:${r.phoneLandline.replace(/\s/g, "")}`}>{r.phoneLandline}</a> : <span className="rp-muted">—</span>}</td>
                <td>{r.phoneMobile ? <a className="rp-mono" style={{ color: "#1f5c46" }} href={`tel:${r.phoneMobile.replace(/\s/g, "")}`}>{r.phoneMobile}</a> : <span className="rp-muted">—</span>}</td>
                <td><Link href={waUrl(r.whatsapp)} label="WhatsApp" /></td>
                <td><Link href={toUrl(r.bookingCalendar)} label="Abrir calendario" /></td>
                <td className="rp-mono">{r.customerCount ? `${num(r.customerCount).toLocaleString("es-ES")} registros` : "—"}</td>
              </tr>
            )) : <Empty cols={6} loading={loading} text="Aún no hay restaurantes." />}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============ Reseñas ============ */
export function Reviews() {
  const { items, loading } = useOutletContext();
  const rows = useMemo(() => byName(items), [items]);
  return (
    <div>
      <h1 className="rp-title">Reseñas</h1>
      <p className="rp-sub">Gestión de reseñas: acceso directo a la ficha de Google y de TripAdvisor de cada restaurante.</p>
      <div className="rp-wrap">
        <table className="rp-table">
          <thead><tr><th>Restaurante</th><th>Google</th><th>TripAdvisor</th><th>Ubicación</th></tr></thead>
          <tbody>
            {rows.length ? rows.map((r) => (
              <tr key={r.id}>
                <td><Name r={r} /></td>
                <td><Link href={toUrl(r.reviewsGoogle)} label="Reseñas Google" /></td>
                <td><Link href={toUrl(r.reviewsTripadvisor || r.tripadvisor)} label="TripAdvisor" /></td>
                <td><Link href={toUrl(r.maps)} label="Google Maps" /></td>
              </tr>
            )) : <Empty cols={4} loading={loading} text="Aún no hay restaurantes." />}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============ Campañas ============ */
export function Campaigns() {
  const { items, loading } = useOutletContext();
  const navigate = useNavigate();
  const rows = useMemo(() => byName(items), [items]);
  return (
    <div>
      <div className="rp-top">
        <div>
          <h1 className="rp-title">Campañas</h1>
          <p className="rp-sub">Fidelización de cada restaurante y acceso a las campañas de email de ISLAS SEM.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="rf-btn" onClick={() => navigate("/dashboard/campaigns")}>Ver campañas de email</button>
          <button className="rf-btn primary" onClick={() => navigate("/dashboard/campaigns/create")}>+ Crear campaña de email</button>
        </div>
      </div>
      <div className="rp-wrap">
        <table className="rp-table">
          <thead><tr><th>Restaurante</th><th>Clientela</th><th>Cumpleaños / aniversarios</th><th>NFC en mesa</th><th>Redes</th></tr></thead>
          <tbody>
            {rows.length ? rows.map((r) => (
              <tr key={r.id}>
                <td><Name r={r} /></td>
                <td className="rp-mono">{r.customerCount ? `${num(r.customerCount).toLocaleString("es-ES")} registros` : "—"}</td>
                <td>
                  <label className="rf-switch" title="Indica si el restaurante tiene activa esta automatización">
                    <b>{r.birthdayAutomation ? "ON" : "OFF"}</b>
                    <input type="checkbox" checked={!!r.birthdayAutomation} onChange={(e) => quickSave(r.id, { birthdayAutomation: e.target.checked })} />
                    <span />
                  </label>
                </td>
                <td className="rp-mono">{r.nfcUnits ? `${num(r.nfcUnits)} unidades activas` : "—"}</td>
                <td>
                  <div className="rp-links">
                    <Link href={toUrl(r.instagram)} label="Instagram" />
                    <Link href={toUrl(r.facebook)} label="Facebook" />
                    <Link href={toUrl(r.tiktok)} label="TikTok" />
                  </div>
                </td>
              </tr>
            )) : <Empty cols={5} loading={loading} text="Aún no hay restaurantes." />}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============ Equipo y fichajes ============ */
function StatusSelect({ value, options, onChange, tone }) {
  return (
    <span className={`rf-status ${tone}`}>
      <i />{value}
      <select value={value} onChange={(e) => onChange(e.target.value)}>{options.map((o) => <option key={o}>{o}</option>)}</select>
    </span>
  );
}

export function Team() {
  const { items, loading } = useOutletContext();
  const rows = useMemo(() => byName(items), [items]);
  return (
    <div>
      <h1 className="rp-title">Equipo y fichajes</h1>
      <p className="rp-sub">Control horario, protección de datos e integración TPV de cada restaurante. Pulsa un estado para cambiarlo.</p>
      <div className="rp-wrap">
        <table className="rp-table">
          <thead><tr><th>Restaurante</th><th>Control horario</th><th>Integración TPV</th><th>RGPD · Textos legales</th></tr></thead>
          <tbody>
            {rows.length ? rows.map((r) => {
              const tt = r.timeTracking || TIME_TRACKING[0];
              const tpv = r.tpvStatus || TPV_STATUS[0];
              return (
                <tr key={r.id}>
                  <td><Name r={r} /></td>
                  <td><StatusSelect value={tt} options={TIME_TRACKING} tone={tt === "Fichaje activo" ? "ok" : "off"} onChange={(v) => quickSave(r.id, { timeTracking: v })} /></td>
                  <td><StatusSelect value={tpv} options={TPV_STATUS} tone={tpv === "Integrado" ? "ok" : tpv === "En proceso" ? "wip" : "off"} onChange={(v) => quickSave(r.id, { tpvStatus: v })} /></td>
                  <td><Link href={toUrl(r.rgpdLink)} /></td>
                </tr>
              );
            }) : <Empty cols={4} loading={loading} text="Aún no hay restaurantes." />}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============ Ajustes ============ */
export function Settings() {
  const { orgId, settings } = useOutletContext();
  const [brand, setBrand] = useState(null);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const value = brand ?? settings.brand ?? DEFAULT_BRAND;
  const save = async () => {
    if (!value.trim()) return setMsg("Escribe un nombre.");
    setSaving(true);
    try {
      await setDoc(doc(db, SETTINGS_COLLECTION, orgId), { orgId, brand: value.trim(), updatedAt: serverTimestamp() }, { merge: true });
      setMsg("Guardado ✓");
      setBrand(null);
    } catch (e) {
      setMsg("No se pudo guardar: " + e.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div>
      <h1 className="rp-title">Ajustes</h1>
      <p className="rp-sub">Configuración de esta sección.</p>
      <div className="rp-card" style={{ maxWidth: 560 }}>
        <label style={{ fontWeight: 600, fontSize: 14 }}>Nombre de la marca</label>
        <p className="rp-muted" style={{ fontSize: 13, margin: "4px 0 10px" }}>Aparece arriba a la izquierda, junto al icono.</p>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="rp-input" style={{ flex: 1 }} value={value} maxLength={40} onChange={(e) => { setBrand(e.target.value); setMsg(""); }} />
          <button className="rf-btn primary" onClick={save} disabled={saving || !orgId}>{saving ? "Guardando…" : "Guardar"}</button>
        </div>
        {msg && <p style={{ fontSize: 13, margin: "10px 0 0", color: msg.startsWith("No") ? "#b0304c" : "#1f5c46" }}>{msg}</p>}
      </div>
      <div className="rp-card" style={{ maxWidth: 560, marginTop: 14 }}>
        <label style={{ fontWeight: 600, fontSize: 14 }}>Origen de los datos</label>
        <p className="rp-muted" style={{ fontSize: 13, margin: "4px 0 0" }}>
          Por ahora todos los datos de las fichas se introducen a mano. Más adelante se podrán traer automáticamente de la web de cada restaurante.
        </p>
      </div>
    </div>
  );
}
