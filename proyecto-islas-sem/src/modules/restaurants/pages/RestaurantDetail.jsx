// Restaurantes › Ficha de cliente (diseño "Propuesta CRM Restaurantes").
// Todo se edita en la propia ficha y se guarda con "Guardar cambios".
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import QRCode from "qrcode";
import CrmModal from "../../crm/components/CrmModal";
import { crmGet, crmUpdate } from "../../crm/lib/crm";
import { COLLECTION, EMPTY, TIME_TRACKING, TPV_STATUS, toUrl, waUrl, imageToDataUrl } from "../lib/restaurants";
import "../../crm/crm.styles.css";
import "./restaurants.styles.css";

const SECTIONS = [
  { n: "01", id: "escaparate", short: "Escaparate", count: 10 },
  { n: "02", id: "conversiones", short: "Conversiones", count: 8 },
  { n: "03", id: "data", short: "La data", count: 3 },
  { n: "04", id: "marketing", short: "Marketing", count: 3 },
  { n: "05", id: "gestion", short: "Gestión", count: 3 },
];

function Open({ href }) {
  return href
    ? <a className="rf-open" href={href} target="_blank" rel="noreferrer">Abrir</a>
    : <span className="rf-open off" title="Escribe primero el enlace">Abrir</span>;
}

// Fila: etiqueta a la izquierda, valor editable (monoespaciado) a la derecha.
function Row({ label, children }) {
  return (
    <div className="rf-row">
      <span className="rf-row__l">{label}</span>
      <div className="rf-row__v">{children}</div>
    </div>
  );
}

function Val({ value, onChange, placeholder, type = "text", width }) {
  return (
    <input className="rf-val" type={type} value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
      style={width ? { width } : undefined} />
  );
}

function Card({ n, id, cls, title, desc, children }) {
  return (
    <section className={`rf-card ${cls}`} id={`rf-${id}`}>
      <header className="rf-card__head">
        <span className="rf-num">{n}</span>
        <div><h2>{title}</h2><p>{desc}</p></div>
      </header>
      <div className="rf-card__body">{children}</div>
    </section>
  );
}

const Group = ({ children }) => <h3 className="rf-group">{children}</h3>;

function QrModal({ initialLink, onSave, onClose }) {
  const [link, setLink] = useState(initialLink || "");
  const [img, setImg] = useState("");
  const [error, setError] = useState("");
  const gen = (v) => {
    setLink(v);
    const url = toUrl(v);
    if (!url) return setImg("");
    QRCode.toDataURL(url, { width: 320, margin: 1 }).then(setImg).catch(() => setImg(""));
  };
  useEffect(() => {
    const url = toUrl(initialLink);
    if (url) QRCode.toDataURL(url, { width: 320, margin: 1 }).then(setImg).catch(() => {});
  }, [initialLink]);
  const upload = async (e) => {
    try { onSave(await imageToDataUrl(e.target.files?.[0], 400)); }
    catch (err) { setError(err.message); }
  };
  return (
    <CrmModal title="Código QR" onClose={onClose} maxWidth={460}
      footer={<><button className="crm-btn ghost" onClick={onClose}>Cancelar</button><button className="crm-btn" disabled={!img} onClick={() => onSave(img)}>Usar este QR</button></>}>
      <label style={{ fontSize: 13, color: "var(--crm-muted)" }}>Enlace al que lleva el QR (p. ej. el menú)</label>
      <input value={link} onChange={(e) => gen(e.target.value)} placeholder="https://…" style={{ width: "100%", margin: "6px 0 12px" }} />
      <div style={{ textAlign: "center", minHeight: 160 }}>
        {img ? <img src={img} alt="QR" style={{ width: 160, height: 160 }} /> : <p style={{ color: "var(--crm-muted)", fontSize: 13 }}>Escribe un enlace para generar el QR.</p>}
      </div>
      <p style={{ fontSize: 13, color: "var(--crm-muted)", margin: "12px 0 6px" }}>¿Ya tienes el QR como imagen?</p>
      <input type="file" accept="image/*" onChange={upload} />
      {error && <div style={{ color: "#b0304c", fontSize: 13, marginTop: 8 }}>{error}</div>}
    </CrmModal>
  );
}

export default function RestaurantDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [r, setR] = useState(null);
  const [missing, setMissing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [showQr, setShowQr] = useState(false);
  const logoInput = useRef(null);

  useEffect(() => {
    crmGet(COLLECTION, id)
      .then((d) => (d ? setR({ ...EMPTY, ...d }) : setMissing(true)))
      .catch(() => setMissing(true));
  }, [id]);

  useEffect(() => {
    if (!dirty) return undefined;
    const h = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const set = (k) => (v) => { setR((x) => ({ ...x, [k]: v })); setDirty(true); setNotice(""); };
  const setSource = (i, k) => (v) => set("dataSources")(r.dataSources.map((s, j) => (j === i ? { ...s, [k]: v } : s)));

  const save = async () => {
    setSaving(true);
    try {
      const { id: _id, orgId: _o, createdAt: _c, updatedAt: _u, ...data } = r;
      await crmUpdate(COLLECTION, id, data);
      setDirty(false);
      setNotice("Cambios guardados ✓");
    } catch (e) {
      setNotice("No se pudo guardar: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const exportPdf = () => {
    const prev = document.title;
    document.title = `Ficha - ${r.name || "Restaurante"}`;
    window.print();
    document.title = prev;
  };

  const pickLogo = async (e) => {
    try { set("logo")(await imageToDataUrl(e.target.files?.[0], 320)); }
    catch (err) { setNotice(err.message); }
    e.target.value = "";
  };

  const goSection = (sid) => document.getElementById(`rf-${sid}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  if (missing) return (
    <div className="rp-empty">Este restaurante no existe o se eliminó. <span className="rp-name" style={{ color: "#1f5c46" }} onClick={() => navigate("/restaurantes/clientes")}>Volver a Clientes</span></div>
  );
  if (!r) return <div className="rp-empty">Cargando ficha…</div>;

  return (
    <div className="rf">
      <div className="rf-crumb">
        <span className="rf-crumb__link" onClick={() => navigate("/restaurantes/clientes")}>Clientes</span> / Ficha de cliente
      </div>

      <div className="rf-head">
        <div className="rf-head__id">
          <button type="button" className={`rf-logo ${r.logo ? "has" : ""}`} onClick={() => logoInput.current?.click()} title="Subir logo">
            {r.logo ? <img src={r.logo} alt="Logo" /> : "Logo"}
          </button>
          <input ref={logoInput} type="file" accept="image/*" hidden onChange={pickLogo} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <input className="rf-name" value={r.name} onChange={(e) => set("name")(e.target.value)} placeholder="[Nombre del restaurante]" />
            <div className="rf-sub">
              <input value={r.city} onChange={(e) => set("city")(e.target.value)} placeholder="[Ciudad]" />
              <span>·</span>
              <input value={r.cuisine} onChange={(e) => set("cuisine")(e.target.value)} placeholder="[Tipo de cocina]" />
              <span>·</span>
              {r.website
                ? <a href={toUrl(r.website)} target="_blank" rel="noreferrer">{r.website}</a>
                : <span className="rf-sub__ph">[tudominio.com]</span>}
            </div>
          </div>
        </div>
        <div className="rf-head__actions rf-noprint">
          {r.logo && <button className="rf-btn" onClick={() => set("logo")("")}>Quitar logo</button>}
          <button className="rf-btn" onClick={exportPdf}>Exportar ficha</button>
          <button className="rf-btn primary" onClick={save} disabled={saving || !dirty}>{saving ? "Guardando…" : "Guardar cambios"}</button>
        </div>
      </div>
      {(notice || dirty) && <div className={`rf-notice rf-noprint ${notice.startsWith("No") ? "err" : ""}`}>{notice || "Hay cambios sin guardar."}</div>}

      <div className="rf-tabs rf-noprint">
        {SECTIONS.map((s) => (
          <button key={s.id} className={`rf-tab t${s.n}`} onClick={() => goSection(s.id)}>
            <span className="rf-tab__n">{s.n}</span> {s.short} <small>{s.count} campos</small>
          </button>
        ))}
      </div>

      <div className="rf-grid2">
        <Card n="01" id="escaparate" cls="c01" title="Escaparate e identidad" desc="Lo que el comensal ve antes de llegar: confianza, ubicación y presencia online.">
          <Group>Generar confianza</Group>
          <Row label="Quién soy"><Val value={r.website} onChange={set("website")} placeholder="[tudominio.com]" /><Open href={toUrl(r.website)} /></Row>
          <Group>Dónde es</Group>
          <Row label="Ubicación"><Val value={r.maps} onChange={set("maps")} placeholder="[Enlace Google Maps]" /><Open href={toUrl(r.maps)} /></Row>
          <Row label="Visita 360º · Recorrido virtual"><Val value={r.tour360} onChange={set("tour360")} placeholder="[Enlace recorrido virtual]" /><Open href={toUrl(r.tour360)} /></Row>
          <Group>Qué cocinamos</Group>
          <Row label="Propuesta gastronómica"><Val value={r.cuisine} onChange={set("cuisine")} placeholder="[Tipo de cocina]" /></Row>
          <Group>Redes sociales</Group>
          {[["Instagram", "instagram"], ["Facebook", "facebook"], ["TikTok", "tiktok"], ["TripAdvisor", "tripadvisor"], ["Otros", "otherSocial"]].map(([l, k]) => (
            <Row key={k} label={l}><Val value={r[k]} onChange={set(k)} placeholder="[Enlace]" /><Open href={toUrl(r[k])} /></Row>
          ))}
          <Group>Servicios</Group>
          <Row label="Baños gratis">
            <select className={`rf-val rf-select ${r.freeToilets ? "" : "ph"}`} value={r.freeToilets} onChange={(e) => set("freeToilets")(e.target.value)}>
              <option value="">[Sí / No]</option><option value="Sí">Sí</option><option value="No">No</option>
            </select>
          </Row>
        </Card>

        <Card n="02" id="conversiones" cls="c02" title="Conversiones" desc="Del interés a la reserva: carta, canales de contacto y citas que recordar.">
          <Group>Evaluación y acción</Group>
          <Row label="Carta y precios"><Val value={r.menuText} onChange={set("menuText")} placeholder="[Carta vigente]" /></Row>
          <Row label="Enlace del menú"><Val value={r.menuLink} onChange={set("menuLink")} placeholder="[Enlace al menú]" /><Open href={toUrl(r.menuLink)} /></Row>
          <Row label="Código QR">
            <div className={`rf-qr ${r.qr ? "has" : ""}`}>{r.qr ? <img src={r.qr} alt="QR" /> : "QR"}</div>
            <button className="rf-open wide rf-noprint" onClick={() => setShowQr(true)}>{r.qr ? "Cambiar QR" : "Insertar enlace o QR"}</button>
            {r.qr && <button className="rf-open rf-noprint" onClick={() => set("qr")("")} title="Quitar QR">✕</button>}
          </Row>
          <Group>Motor de reservas</Group>
          <Row label="Teléfonos vinculados">
            <Val value={r.phoneLandline} onChange={set("phoneLandline")} placeholder="[Fijo]" width={`${Math.max(7, (r.phoneLandline || "").length + 1)}ch`} />
            <span className="rf-dot">·</span>
            <Val value={r.phoneMobile} onChange={set("phoneMobile")} placeholder="[Móvil]" width={`${Math.max(8, (r.phoneMobile || "").length + 1)}ch`} />
          </Row>
          <Row label="WhatsApp"><Val value={r.whatsapp} onChange={set("whatsapp")} placeholder="[Móvil]" /><Open href={waUrl(r.whatsapp)} /></Row>
          <Group>Citas especiales · Recordar</Group>
          <Row label="Calendario de reservas"><Val value={r.bookingCalendar} onChange={set("bookingCalendar")} placeholder="[Enlace calendario]" /><Open href={toUrl(r.bookingCalendar)} /></Row>
          <Row label="Base de datos de clientela">
            <Val type="number" value={r.customerCount} onChange={set("customerCount")} placeholder="[nº]" width="9ch" /><span className="rf-mono">registros</span>
          </Row>
          <Row label="Automatización cumpleaños / aniversarios">
            <label className="rf-switch" title="Indica si el restaurante tiene activa esta automatización">
              <b>{r.birthdayAutomation ? "ON" : "OFF"}</b>
              <input type="checkbox" checked={!!r.birthdayAutomation} onChange={(e) => set("birthdayAutomation")(e.target.checked)} />
              <span />
            </label>
          </Row>
        </Card>
      </div>

      <div className="rf-grid3">
        <Card n="03" id="data" cls="c03" title="La data" desc="Qué información capta cada punto de contacto.">
          <Group>Origen → Dato captado</Group>
          {r.dataSources.map((s, i) => (
            <div className="rf-src" key={i}>
              <input className="rf-src__from" value={s.from} onChange={(e) => setSource(i, "from")(e.target.value)} placeholder="[Origen]" />
              <div className="rf-src__to">
                <span>→</span>
                <input className="rf-pill" value={s.to} onChange={(e) => setSource(i, "to")(e.target.value)} placeholder="[Dato]" style={{ width: `${Math.max(6, (s.to || "").length + 2)}ch` }} />
              </div>
            </div>
          ))}
        </Card>

        <Card n="04" id="marketing" cls="c04" title="Marketing y fidelización" desc="Retención y experiencia en mesa.">
          <Group>Tecnología NFC en mesa</Group>
          <div className="rf-stack">
            <span className="rf-row__l">Pegatinas / Display NFC</span>
            <div className="rf-row__v"><Val type="number" value={r.nfcUnits} onChange={set("nfcUnits")} placeholder="[nº]" width="7ch" /><span className="rf-mono">unidades activas</span></div>
          </div>
          <Group>Gestión de reseñas</Group>
          <div className="rf-stack">
            <span className="rf-row__l">Google</span>
            <div className="rf-row__v"><Val value={r.reviewsGoogle} onChange={set("reviewsGoogle")} placeholder="[Enlace Google]" /><Open href={toUrl(r.reviewsGoogle)} /></div>
          </div>
          <div className="rf-stack">
            <span className="rf-row__l">TripAdvisor</span>
            <div className="rf-row__v"><Val value={r.reviewsTripadvisor} onChange={set("reviewsTripadvisor")} placeholder="[Enlace TripAdvisor]" /><Open href={toUrl(r.reviewsTripadvisor)} /></div>
          </div>
        </Card>

        <Card n="05" id="gestion" cls="c05" title="Gestión y legalidad" desc="Equipo, cumplimiento normativo e integraciones.">
          <Group>Operación</Group>
          <Row label="Control horario · Capital humano">
            <span className={`rf-status ${r.timeTracking === "Fichaje activo" ? "ok" : "off"}`}>
              <i />{r.timeTracking}
              <select value={r.timeTracking} onChange={(e) => set("timeTracking")(e.target.value)}>{TIME_TRACKING.map((o) => <option key={o}>{o}</option>)}</select>
            </span>
          </Row>
          <div className="rf-stack">
            <span className="rf-row__l">RGPD · Protección de datos</span>
            <div className="rf-row__v"><Val value={r.rgpdLink} onChange={set("rgpdLink")} placeholder="[Textos legales y cookies]" /><Open href={toUrl(r.rgpdLink)} /></div>
          </div>
          <Row label="Integración TPV">
            <span className={`rf-status ${r.tpvStatus === "Integrado" ? "ok" : r.tpvStatus === "En proceso" ? "wip" : "off"}`}>
              <i />{r.tpvStatus}
              <select value={r.tpvStatus} onChange={(e) => set("tpvStatus")(e.target.value)}>{TPV_STATUS.map((o) => <option key={o}>{o}</option>)}</select>
            </span>
          </Row>
        </Card>
      </div>

      {showQr && <QrModal initialLink={r.menuLink} onClose={() => setShowQr(false)} onSave={(img) => { set("qr")(img); setShowQr(false); }} />}
    </div>
  );
}
