import { useEffect, useMemo, useRef, useState } from "react";
import { auth } from "../../config/firebaseConfig";
import { OUTBOX_STATUS } from "../crm/lib/outbox";
import "../crm/crm.styles.css";
import "./TalentoDigital.styles.css";

// Altas de talentodigitalcanarias.com: cuando la administradora da de alta una
// empresa allí, llega aquí con su enlace personal para completar el registro.
// Nada se envía solo: desde esta sección se redacta y se envía el correo.

const API_BASE = import.meta.env.VITE_API_BASE || "https://email-marketing.islassem.com/api";

async function api(path, body) {
  const token = await auth.currentUser?.getIdToken();
  const r = await fetch(`${API_BASE}/talento-digital/${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token || ""}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok || out.ok === false) throw new Error(out.error || `HTTP ${r.status}`);
  return out;
}

const fecha = (ms) => (ms ? new Date(ms).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

function estadoDe(e) {
  if (e.completadoEn) return { label: "Registro completado", cls: "ok" };
  if (e.ultimoEnvio) {
    const st = OUTBOX_STATUS[e.ultimoEnvio.estado] || OUTBOX_STATUS.pending;
    return { label: e.ultimoEnvio.estado === "sent" ? "Correo enviado" : `Correo: ${st.label.toLowerCase()}`, cls: st.cls };
  }
  return { label: "Pendiente de enviar", cls: "warn" };
}

export default function TalentoDigital() {
  const [empresas, setEmpresas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [filtro, setFiltro] = useState("pendientes");
  const [elegidas, setElegidas] = useState(new Set());
  const [plantilla, setPlantilla] = useState(null);
  const [redactando, setRedactando] = useState(false);
  const [vista, setVista] = useState("");
  const [emailPrueba, setEmailPrueba] = useState(auth.currentUser?.email || "");
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState("");
  const temporizador = useRef(null);

  const traer = () => api("empresas")
    .then((r) => { setEmpresas(r.empresas || []); setPlantilla((p) => p || r.plantilla); setError(""); })
    .catch((e) => setError(e.message))
    .finally(() => setCargando(false));

  function cargar() {
    setCargando(true);
    traer();
  }
  useEffect(() => { traer(); }, []);

  const filas = useMemo(() => empresas.filter((e) =>
    filtro === "todas" ? true
      : filtro === "pendientes" ? !e.ultimoEnvio && !e.completadoEn
        : filtro === "enviadas" ? !!e.ultimoEnvio && !e.completadoEn
          : !!e.completadoEn), [empresas, filtro]);

  const cuenta = useMemo(() => ({
    todas: empresas.length,
    pendientes: empresas.filter((e) => !e.ultimoEnvio && !e.completadoEn).length,
    enviadas: empresas.filter((e) => e.ultimoEnvio && !e.completadoEn).length,
    completadas: empresas.filter((e) => e.completadoEn).length,
  }), [empresas]);

  const elegidasLista = empresas.filter((e) => elegidas.has(e.id));
  const todasMarcadas = filas.length > 0 && filas.every((e) => elegidas.has(e.id));

  function alternar(id) {
    setElegidas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function alternarTodas() {
    setElegidas((s) => { const n = new Set(s); filas.forEach((e) => (todasMarcadas ? n.delete(e.id) : n.add(e.id))); return n; });
  }

  // Vista previa con los datos de la primera empresa elegida (se pide al servidor
  // para que sea exactamente lo que se enviará).
  useEffect(() => {
    if (!redactando || !plantilla) return;
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => {
      api("vista-previa", { id: elegidasLista[0]?.id, mensaje: plantilla.mensaje, boton: plantilla.boton })
        .then((r) => setVista(r.html)).catch(() => {});
    }, 350);
    return () => clearTimeout(temporizador.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redactando, plantilla?.mensaje, plantilla?.boton, elegidas]);

  const set = (k) => (ev) => setPlantilla((p) => ({ ...p, [k]: ev.target.value }));

  async function enviarPrueba() {
    setEnviando(true); setAviso("");
    try {
      await api("enviar", { ...plantilla, ids: [...elegidas], prueba: emailPrueba });
      setAviso(`Prueba enviada a ${emailPrueba}. Llegará en un par de minutos.`);
    } catch (e) { setAviso(`No se pudo enviar la prueba: ${e.message}`); }
    setEnviando(false);
  }

  async function enviarDeVerdad() {
    if (!window.confirm(`¿Enviar este correo a ${elegidas.size} empresa(s)?`)) return;
    setEnviando(true); setAviso("");
    try {
      const r = await api("enviar", { ...plantilla, ids: [...elegidas] });
      setRedactando(false); setElegidas(new Set());
      setAviso(`Correo puesto en cola para ${r.enviados} empresa(s). Saldrá en unos minutos.`);
      cargar();
    } catch (e) { setAviso(`No se pudo enviar: ${e.message}`); }
    setEnviando(false);
  }

  async function guardarBorrador() {
    try { await api("plantilla", plantilla); setAviso("Borrador guardado."); } catch (e) { setAviso(`No se pudo guardar: ${e.message}`); }
  }

  async function archivar() {
    if (!window.confirm(`¿Quitar ${elegidas.size} empresa(s) de esta lista? En Talento Digital no se borra nada.`)) return;
    await api("archivar", { ids: [...elegidas] }).catch((e) => setAviso(e.message));
    setElegidas(new Set());
    cargar();
  }

  return (
    <div className="crm td">
      <div className="crm__top">
        <div>
          <h1>Talento Digital</h1>
          <p>Empresas dadas de alta en talentodigitalcanarias.com. Redacta el correo con el que completarán su registro (elegir usuario y contraseña) y envíalo cuando quieras.</p>
        </div>
        <div className="td__acciones">
          <button className="crm-btn ghost" onClick={cargar} disabled={cargando}>↻ Actualizar</button>
          <button className="crm-btn" disabled={!elegidas.size} onClick={() => { setRedactando(true); setAviso(""); }}>
            ✉ Redactar correo{elegidas.size ? ` (${elegidas.size})` : ""}
          </button>
        </div>
      </div>

      {aviso && <div className="crm-panel td__aviso">{aviso}</div>}
      {error && <div className="crm-panel td__error">No se pudo cargar: {error}</div>}

      <div className="td__filtros">
        {[["pendientes", "Pendientes de enviar"], ["enviadas", "Correo enviado"], ["completadas", "Registro completado"], ["todas", "Todas"]].map(([k, l]) => (
          <button key={k} className={`crm-chip ${filtro === k ? "info" : ""}`} onClick={() => setFiltro(k)}>{l} ({cuenta[k]})</button>
        ))}
        {elegidas.size > 0 && <button className="crm-btn ghost sm td__archivar" onClick={archivar}>Quitar de la lista</button>}
      </div>

      {cargando ? <div className="crm-loading">Cargando…</div> : (
        <table className="crm-table">
          <thead>
            <tr>
              <th><input type="checkbox" checked={todasMarcadas} onChange={alternarTodas} aria-label="Elegir todas" /></th>
              <th>Empresa</th><th>Correo</th><th>Estado</th><th>Dada de alta</th><th>Último envío</th>
            </tr>
          </thead>
          <tbody>
            {filas.length ? filas.map((e) => {
              const st = estadoDe(e);
              return (
                <tr key={e.id} className={elegidas.has(e.id) ? "td__fila-on" : ""} onClick={() => alternar(e.id)}>
                  <td onClick={(ev) => ev.stopPropagation()}><input type="checkbox" checked={elegidas.has(e.id)} onChange={() => alternar(e.id)} aria-label={`Elegir ${e.nombre}`} /></td>
                  <td>
                    <b>{e.nombre || "—"}</b>
                    {e.origen === "prueba" && <span className="crm-chip td__prueba">web de prueba</span>}
                  </td>
                  <td>{e.email}</td>
                  <td><span className={`crm-chip ${st.cls}`} title={e.ultimoEnvio?.error || ""}>{st.label}</span></td>
                  <td>{fecha(e.recibidaEn)}</td>
                  <td>{e.ultimoEnvio ? <>{fecha(e.ultimoEnvio.fecha)}<div className="td__sub">{e.ultimoEnvio.asunto}</div></> : "—"}</td>
                </tr>
              );
            }) : (
              <tr><td colSpan="6" className="crm-empty">{empresas.length ? "No hay empresas en esta vista." : "Todavía no ha llegado ninguna alta de Talento Digital."}</td></tr>
            )}
          </tbody>
        </table>
      )}

      {redactando && plantilla && (
        <div className="crm-modal__overlay" onClick={() => !enviando && setRedactando(false)}>
          <div className="crm-modal td__modal" onClick={(ev) => ev.stopPropagation()} role="dialog" aria-modal="true">
            <div className="crm-modal__head">
              <h3>Correo de alta · {elegidas.size} empresa(s)</h3>
              <button className="crm-modal__x" onClick={() => setRedactando(false)} aria-label="Cerrar">✕</button>
            </div>
            <div className="crm-modal__body td__editor">
              <div className="td__form">
                <div className="crm-field"><label>Asunto</label><input value={plantilla.asunto} onChange={set("asunto")} /></div>
                <div className="crm-field"><label>Nombre del remitente</label><input value={plantilla.remitente} onChange={set("remitente")} /></div>
                <div className="crm-field">
                  <label>Mensaje</label>
                  <textarea rows={14} value={plantilla.mensaje} onChange={set("mensaje")} />
                </div>
                <p className="td__ayuda">
                  Puedes usar <code>{"{{nombre}}"}</code>, <code>{"{{email}}"}</code>, <code>{"{{enlace_alta}}"}</code> (el enlace en texto) y <code>{"{{boton}}"}</code> (el botón para completar el registro; si no lo pones, va al final). Deja una línea en blanco entre párrafos.
                </p>
                <div className="crm-field"><label>Texto del botón</label><input value={plantilla.boton} onChange={set("boton")} /></div>
                <div className="td__prueba-envio">
                  <div className="crm-field"><label>Enviarme una prueba a</label><input type="email" value={emailPrueba} onChange={(ev) => setEmailPrueba(ev.target.value)} /></div>
                  <button className="crm-btn ghost" disabled={enviando || !emailPrueba} onClick={enviarPrueba}>Enviar prueba</button>
                </div>
                {aviso && <p className="td__ayuda"><b>{aviso}</b></p>}
              </div>
              <div className="td__vista">
                <div className="td__vista-cab">Vista previa{elegidasLista[0] ? ` · ${elegidasLista[0].nombre}` : ""}</div>
                <div className="td__vista-asunto"><b>{plantilla.asunto || "(sin asunto)"}</b> · {plantilla.remitente}</div>
                <iframe title="Vista previa del correo" srcDoc={vista} sandbox="" />
              </div>
            </div>
            <div className="crm-modal__foot">
              <button className="crm-btn ghost" onClick={guardarBorrador} disabled={enviando}>Guardar borrador</button>
              <button className="crm-btn" onClick={enviarDeVerdad} disabled={enviando || !plantilla.asunto.trim() || !plantilla.mensaje.trim()}>
                {enviando ? "Enviando…" : `Enviar a ${elegidas.size} empresa(s)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
