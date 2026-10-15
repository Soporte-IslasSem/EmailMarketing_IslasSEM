// Restaurantes › Campañas › nueva / editar / resultados.
// Pasos: 1 Datos · 2 Destinatarios (restaurantes) · 3 Diseño · 4 Envío.
// El envío usa la misma cola que Email Marketing (enqueueCampaign / enqueueTest).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { db, auth } from "../../../config/firebaseConfig";
import { enqueueCampaign, enqueueTest, finalRecipients } from "../../campaigns/lib/campaignSend";
import TemplateEditor from "../../templates/components/TemplateEditor/TemplateEditor";
import TemplateThumb from "../../templates/components/TemplateThumb/TemplateThumb";
import { systemTemplates, TEMPLATE_CATEGORIES } from "../../../data/systemTemplates";
import { reportMetrics } from "../../reports/reportMetrics";
import { SENDER_EMAIL } from "../../../config/sender";
import CrmModal from "../../crm/components/CrmModal";
import {
  SECTION, STATUS_LABEL, cleanEmail, validEmail, canReceive, subStatus,
  syncRestaurantList, createRestaurantCampaign, updateCampaign,
} from "../lib/restaurantCampaigns";
import "./campaigns.styles.css";

const STEPS = ["Datos", "Destinatarios", "Diseño", "Envío"];
const minSchedule = () => new Date(Date.now() + 5 * 60e3 - new Date().getTimezoneOffset() * 60e3).toISOString().slice(0, 16);

function Steps({ step, max, onGo }) {
  return (
    <div className="rc-steps">
      {STEPS.map((s, i) => (
        <button key={s} className={`rc-step ${step === i + 1 ? "on" : ""} ${i + 1 < step ? "done" : ""}`} disabled={i + 1 > max} onClick={() => onGo(i + 1)}>
          <span>{i + 1}</span>{s}
        </button>
      ))}
    </div>
  );
}

/* ---------- 1 · Datos ---------- */
function StepData({ campaign, onSaved }) {
  const [f, setF] = useState({
    name: campaign?.config?.campaignName || "",
    subject: campaign?.config?.subject || "",
    senderName: campaign?.config?.senderName ?? "ISLAS SEM",
    preheader: campaign?.config?.preheader || "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const next = async () => {
    if (!f.name.trim()) return setErr("Escribe un nombre para la campaña.");
    if (!f.subject.trim()) return setErr("Escribe el asunto del email.");
    setBusy(true); setErr("");
    const config = {
      ...(campaign?.config || {}),
      campaignName: f.name.trim(), subject: f.subject.trim(), senderName: f.senderName.trim(), preheader: f.preheader.trim(),
      senderEmail: SENDER_EMAIL, ...(campaign ? {} : { createdAt: new Date() }),
    };
    try {
      if (campaign) { await updateCampaign(campaign.id, { config, step: Math.max(campaign.step || 1, 2) }); onSaved(campaign.id, 2); }
      else onSaved(await createRestaurantCampaign({ config }), 2);
    } catch (e) { setErr("No se pudo guardar: " + e.message); setBusy(false); }
  };
  return (
    <div className="rp-card rc-form">
      <label>Nombre de la campaña <small>(solo lo ves tú)</small></label>
      <input className="rp-input" value={f.name} onChange={set("name")} placeholder="p. ej. Presentación servicios octubre" maxLength={120} />
      <label>Asunto del email</label>
      <input className="rp-input" value={f.subject} onChange={set("subject")} placeholder="p. ej. Más reservas para tu restaurante este invierno" maxLength={150} />
      <label>Nombre del remitente</label>
      <input className="rp-input" value={f.senderName} onChange={set("senderName")} maxLength={80} />
      <small className="rp-muted">Se envía desde {SENDER_EMAIL}; el nombre visible es el que escribas aquí.</small>
      <label>Texto de vista previa <small>(opcional)</small></label>
      <input className="rp-input" value={f.preheader} onChange={set("preheader")} placeholder="La línea que se ve junto al asunto en la bandeja" maxLength={150} />
      {err && <p className="rc-err">{err}</p>}
      <div className="rc-actions"><span /><button className="rf-btn primary" onClick={next} disabled={busy}>{busy ? "Guardando…" : "Siguiente"}</button></div>
    </div>
  );
}

/* ---------- 2 · Destinatarios ---------- */
function StepRecipients({ campaign, items, onBack, onSaved }) {
  const navigate = useNavigate();
  const [subs, setSubs] = useState(null);
  const [listId, setListId] = useState("");
  const [bajas, setBajas] = useState(() => new Set());
  const [err, setErr] = useState("");
  const [sel, setSel] = useState(() => new Set(campaign.restaurantIds || []));
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    syncRestaurantList(items).then(({ listId: l, subs: s, suppressed: b }) => { setListId(l); setBajas(b); setSubs(s); }).catch((e) => setErr("No se pudo preparar la lista de restaurantes: " + e.message));
  }, [items]);
  const rows = useMemo(() => [...items].sort((a, b) => (a.name || "").localeCompare(b.name || "")), [items]);
  const cities = useMemo(() => [...new Set(items.map((r) => (r.city || "").trim()).filter(Boolean))].sort(), [items]);
  const usable = (r) => validEmail(r.email) && !bajas.has(cleanEmail(r.email)) && (!subs || canReceive(subStatus(subs, r.email)));
  const shown = rows.filter((r) => !city || (r.city || "").trim() === city);
  const toggle = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectShown = (on) => setSel((s) => { const n = new Set(s); shown.filter(usable).forEach((r) => (on ? n.add(r.id) : n.delete(r.id))); return n; });
  const chosen = rows.filter((r) => sel.has(r.id) && usable(r));
  const next = async () => {
    if (!chosen.length) return setErr("Elige al menos un restaurante con email.");
    setBusy(true); setErr("");
    try {
      const keep = new Set(chosen.map((r) => cleanEmail(r.email)));
      const excludedEmails = (subs || []).map((s) => cleanEmail(s.email)).filter((e) => !keep.has(e));
      await updateCampaign(campaign.id, {
        restaurantIds: chosen.map((r) => r.id),
        lists: { selectedLists: [listId], totalSubscribers: chosen.length, excludedEmails },
        step: Math.max(campaign.step || 2, 3),
      });
      onSaved(3);
    } catch (e) { setErr("No se pudo guardar: " + e.message); setBusy(false); }
  };
  return (
    <div>
      <div className="rc-bar">
        <select className="rp-input" value={city} onChange={(e) => setCity(e.target.value)}>
          <option value="">Todas las ciudades</option>
          {cities.map((c) => <option key={c}>{c}</option>)}
        </select>
        <button className="rf-open" onClick={() => selectShown(true)}>Marcar todos</button>
        <button className="rf-open" onClick={() => selectShown(false)}>Desmarcar</button>
        <span className="rp-muted" style={{ marginLeft: "auto", fontSize: 13 }}>{chosen.length} seleccionado(s)</span>
      </div>
      <div className="rp-wrap">
        <table className="rp-table">
          <thead><tr><th style={{ width: 36 }}></th><th>Restaurante</th><th>Ciudad</th><th>Email de contacto</th></tr></thead>
          <tbody>
            {shown.length ? shown.map((r) => {
              const st = subs ? subStatus(subs, r.email) : "";
              const ok = usable(r);
              return (
                <tr key={r.id} style={{ opacity: ok ? 1 : 0.6 }}>
                  <td><input type="checkbox" disabled={!ok} checked={ok && sel.has(r.id)} onChange={() => toggle(r.id)} /></td>
                  <td>{r.name || "(sin nombre)"}</td>
                  <td>{r.city || "—"}</td>
                  <td>
                    {!validEmail(r.email)
                      ? <span className="rp-muted">Sin email · <span className="rp-name" style={{ color: "#1f5c46" }} onClick={() => navigate(`/restaurantes/clientes/${r.id}`)}>añadirlo en la ficha</span></span>
                      : !ok ? <span style={{ color: "#8a1f45" }}>{r.email} · {bajas.has(cleanEmail(r.email)) ? "se dio de baja" : `no puede recibir (${st})`}</span>
                      : <span className="rp-mono">{r.email}</span>}
                  </td>
                </tr>
              );
            }) : <tr><td colSpan={4} className="rp-empty">No hay restaurantes{city ? " en esa ciudad" : ""}.</td></tr>}
          </tbody>
        </table>
      </div>
      {!subs && !err && <p className="rp-muted" style={{ fontSize: 13 }}>Preparando la lista de restaurantes…</p>}
      {err && <p className="rc-err">{err}</p>}
      <div className="rc-actions">
        <button className="rf-btn" onClick={onBack}>Atrás</button>
        <button className="rf-btn primary" onClick={next} disabled={busy || !subs}>{busy ? "Guardando…" : "Siguiente"}</button>
      </div>
    </div>
  );
}

/* ---------- 3 · Diseño ---------- */
function TemplatePicker({ onPick, busy }) {
  const [mine, setMine] = useState([]);
  const [tab, setTab] = useState("system");
  const [cat, setCat] = useState("");
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    getDocs(query(collection(db, "templates"), where("userId", "==", uid)))
      .then((s) => setMine(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((t) => t.html)))
      .catch(() => setMine([]));
  }, []);
  const list = tab === "mine"
    ? mine.map((t) => ({ key: t.id, title: t.name || "Plantilla", html: t.html, tpl: { templateId: t.id, templateName: t.name || "Plantilla", type: t.type || "html", html: t.html } }))
    : systemTemplates.filter((t) => !cat || t.tags.includes(cat)).map((t) => ({ key: t.id, title: t.title, html: t.html, tpl: { templateId: null, systemTemplateId: t.id, templateName: t.title, type: "html", html: t.html || "" } }));
  return (
    <div>
      <p className="rp-sub">Elige una plantilla para empezar; en el siguiente paso la editas.</p>
      <div className="rc-bar">
        <button className={`rf-open ${tab === "system" ? "rc-on" : ""}`} onClick={() => setTab("system")}>Plantillas de ISLAS SEM ({systemTemplates.length})</button>
        <button className={`rf-open ${tab === "mine" ? "rc-on" : ""}`} onClick={() => setTab("mine")}>Mis plantillas ({mine.length})</button>
        {tab === "system" && (
          <select className="rp-input" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">Todas las categorías</option>
            {TEMPLATE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        )}
      </div>
      <div className="rc-grid">
        {list.length ? list.map((t) => (
          <button key={t.key} className="rc-tpl" disabled={busy} onClick={() => onPick(t.tpl)}>
            <TemplateThumb html={t.html} title={t.title} height={190} />
            <b>{t.title}</b>
          </button>
        )) : <p className="rp-muted">No tienes plantillas propias con diseño todavía.</p>}
      </div>
    </div>
  );
}

function StepDesign({ campaign, onBack, onSaved }) {
  const saveRef = useRef(null);
  const onSaveReady = useCallback((fn) => { saveRef.current = fn; }, []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [picking, setPicking] = useState(!campaign.template?.html);
  const pick = async (template) => {
    setBusy(true); setErr("");
    try { await updateCampaign(campaign.id, { template }); setPicking(false); }
    catch (e) { setErr("No se pudo aplicar la plantilla: " + e.message); }
    finally { setBusy(false); }
  };
  const next = async () => {
    setBusy(true); setErr("");
    try {
      await saveRef.current?.();
      await updateCampaign(campaign.id, { step: Math.max(campaign.step || 3, 4) });
      onSaved(4);
    } catch (e) { setErr("No se pudo guardar el diseño: " + e.message); setBusy(false); }
  };
  if (picking) {
    return (
      <div>
        <TemplatePicker onPick={pick} busy={busy} />
        {err && <p className="rc-err">{err}</p>}
        <div className="rc-actions">
          <button className="rf-btn" onClick={campaign.template?.html ? () => setPicking(false) : onBack}>{campaign.template?.html ? "Volver al diseño" : "Atrás"}</button>
          <span />
        </div>
      </div>
    );
  }
  return (
    <div>
      <div className="rc-bar">
        <span className="rp-muted" style={{ fontSize: 13 }}>Plantilla: <b>{campaign.template?.templateName || "—"}</b>. Los cambios se guardan solos en esta campaña.</span>
        <button className="rf-open" style={{ marginLeft: "auto" }} onClick={() => window.confirm("¿Empezar con otra plantilla? Se perderá el diseño actual de esta campaña.") && setPicking(true)}>Cambiar plantilla</button>
      </div>
      <div className="rc-editor"><TemplateEditor key={campaign.template?.templateName || "tpl"} campaignId={campaign.id} onSaveReady={onSaveReady} /></div>
      {err && <p className="rc-err">{err}</p>}
      <div className="rc-actions">
        <button className="rf-btn" onClick={onBack}>Atrás</button>
        <button className="rf-btn primary" onClick={next} disabled={busy}>{busy ? "Guardando…" : "Siguiente"}</button>
      </div>
    </div>
  );
}

/* ---------- 4 · Envío ---------- */
function StepSend({ campaign, items, orgId, onBack }) {
  const navigate = useNavigate();
  const [subs, setSubs] = useState(null);
  const [suppressed, setSuppressed] = useState(() => new Set());
  const [fresh, setFresh] = useState(null); // campaña con destinatarios recalculados
  const [err, setErr] = useState("");
  const [testTo, setTestTo] = useState(auth.currentUser?.email || "");
  const [testMsg, setTestMsg] = useState("");
  const [when, setWhen] = useState("now");
  const [at, setAt] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  // Se recalcula al abrir: si alguien cambió el email de un restaurante, se usa el actual.
  // Depende solo de la selección (no del objeto campaña, que cambia al guardar aquí mismo).
  const campaignRef = useRef(campaign);
  const itemsRef = useRef(items);
  useEffect(() => { campaignRef.current = campaign; itemsRef.current = items; });
  const selKey = (campaign.restaurantIds || []).join(",");
  const itemsKey = items.map((r) => `${r.id}:${cleanEmail(r.email)}`).join("|");
  useEffect(() => {
    let off = false;
    (async () => {
      const campaign = campaignRef.current;
      const items = itemsRef.current;
      try {
        const { listId, subs: s, suppressed: sup } = await syncRestaurantList(items);
        const chosenIds = new Set(campaign.restaurantIds || []);
        const keep = new Set(items.filter((r) => chosenIds.has(r.id) && validEmail(r.email)).map((r) => cleanEmail(r.email)));
        const excludedEmails = s.map((x) => cleanEmail(x.email)).filter((e) => !keep.has(e));
        const lists = { selectedLists: [listId], totalSubscribers: keep.size, excludedEmails };
        await updateCampaign(campaign.id, { lists });
        if (off) return;
        setSuppressed(sup);
        setFresh({ ...campaign, lists });
        setSubs(s);
      } catch (e) { if (!off) setErr("No se pudieron preparar los destinatarios: " + e.message); }
    })();
    return () => { off = true; };
  }, [selKey, itemsKey]);

  const recipients = fresh && subs ? finalRecipients(subs, fresh, suppressed) : [];
  const noDesign = !String(campaign.template?.html || "").trim();
  const badDate = when === "scheduled" && (!at || new Date(at) <= new Date());

  const sendTest = async () => {
    if (!validEmail(testTo)) return setTestMsg("Escribe un email válido.");
    setTestMsg("Enviando…");
    try { await enqueueTest(orgId, campaign, cleanEmail(testTo)); setTestMsg("Prueba en cola: llegará en ~1 minuto."); }
    catch (e) { setTestMsg("No se pudo enviar la prueba: " + e.message); }
  };
  const send = async () => {
    setBusy(true); setErr("");
    try {
      const sendAt = when === "scheduled" ? new Date(at) : undefined;
      await enqueueCampaign(orgId, campaign.id, fresh, subs, { sendAt, suppressed });
      navigate("/restaurantes/campanas");
    } catch (e) { setErr("No se pudo poner en cola: " + e.message); setBusy(false); setConfirm(false); }
  };

  return (
    <div className="rc-send">
      <div className="rp-card">
        <h3>Resumen</h3>
        <dl className="rc-dl">
          <dt>Campaña</dt><dd>{campaign.config?.campaignName}</dd>
          <dt>Asunto</dt><dd>{campaign.config?.subject}</dd>
          <dt>Remitente</dt><dd>{campaign.config?.senderName || "—"} &lt;{campaign.config?.senderEmail || SENDER_EMAIL}&gt;</dd>
          <dt>Plantilla</dt><dd>{campaign.template?.templateName || "—"}</dd>
          <dt>Destinatarios</dt><dd>{subs ? <b>{recipients.length} restaurante(s)</b> : "Calculando…"}</dd>
        </dl>
        {subs && <p className="rp-muted" style={{ fontSize: 12.5, margin: "6px 0 0" }}>{recipients.map((r) => r.name || r.email).join(" · ") || "Ninguno"}</p>}
        {noDesign && <p className="rc-err">La campaña no tiene diseño: vuelve al paso Diseño.</p>}
      </div>

      <div className="rp-card">
        <h3>Email de prueba</h3>
        <div className="rc-bar" style={{ margin: 0 }}>
          <input className="rp-input" style={{ flex: 1, minWidth: 0 }} type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
          <button className="rf-btn" onClick={sendTest} disabled={noDesign}>Enviar prueba</button>
        </div>
        {testMsg && <p className="rp-muted" style={{ fontSize: 13, margin: "8px 0 0" }}>{testMsg}</p>}
      </div>

      <div className="rp-card">
        <h3>¿Cuándo se envía?</h3>
        <label className="rc-radio"><input type="radio" checked={when === "now"} onChange={() => setWhen("now")} /> Enviar ahora</label>
        <label className="rc-radio"><input type="radio" checked={when === "scheduled"} onChange={() => setWhen("scheduled")} /> Programar</label>
        {when === "scheduled" && <input className="rp-input" type="datetime-local" min={minSchedule()} value={at} onChange={(e) => setAt(e.target.value)} />}
      </div>

      {err && <p className="rc-err">{err}</p>}
      <div className="rc-actions">
        <button className="rf-btn" onClick={onBack}>Atrás</button>
        <button className="rf-btn primary" disabled={!subs || !recipients.length || noDesign || badDate || busy} onClick={() => setConfirm(true)}>
          {when === "scheduled" ? "Programar campaña" : "Enviar campaña"}
        </button>
      </div>

      {confirm && (
        <CrmModal title={when === "scheduled" ? "Programar campaña" : "Enviar campaña"} onClose={() => !busy && setConfirm(false)} maxWidth={460}
          footer={<><button className="crm-btn ghost" onClick={() => setConfirm(false)} disabled={busy}>Cancelar</button><button className="crm-btn" onClick={send} disabled={busy}>{busy ? "Poniendo en cola…" : "Sí, enviar"}</button></>}>
          <p style={{ margin: 0 }}>
            Se enviará «{campaign.config?.subject}» a <b>{recipients.length} restaurante(s)</b>
            {when === "scheduled" ? <> el <b>{new Date(at).toLocaleString("es-ES")}</b></> : " ahora"}. Una vez en cola no se puede editar (sí cancelar eliminándola).
          </p>
        </CrmModal>
      )}
    </div>
  );
}

/* ---------- Resultados (campaña ya enviada o programada) ---------- */
function Results({ campaign }) {
  const navigate = useNavigate();
  const [rep, setRep] = useState(null);
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return undefined;
    return onSnapshot(query(collection(db, "reports"), where("ownerId", "==", uid), where("campaignId", "==", campaign.id)),
      (s) => setRep(s.docs[0]?.data() || null), () => setRep(null));
  }, [campaign.id]);
  const m = rep ? reportMetrics(rep) : null;
  const people = Object.entries(rep?.subscribers || {}).sort((a, b) => a[0].localeCompare(b[0]));
  const [label, tone] = STATUS_LABEL[campaign.status] || [campaign.status, "off"];
  return (
    <div>
      <div className="rc-bar">
        <span className={`rf-status ${tone}`}><i />{label}</span>
        {campaign.status === "scheduled" && campaign.send?.scheduledAt && <span className="rp-muted" style={{ fontSize: 13 }}>Sale el {new Date(campaign.send.scheduledAt).toLocaleString("es-ES")}</span>}
        <button className="rf-open" style={{ marginLeft: "auto" }} onClick={() => navigate(`/dashboard/reports/${campaign.id}`)} disabled={!rep}>Informe completo</button>
      </div>
      <div className="rp-stats">
        <div className="rp-stat"><small>Destinatarios</small><b>{campaign.recipientsCount ?? "—"}</b></div>
        <div className="rp-stat"><small>Enviados</small><b>{m ? m.sent : 0}</b></div>
        <div className="rp-stat"><small>Aperturas</small><b>{m ? `${m.opened} · ${m.openRate}%` : 0}</b></div>
        <div className="rp-stat"><small>Clics</small><b>{m ? `${m.clicked} · ${m.clickRate}%` : 0}</b></div>
        <div className="rp-stat"><small>Rebotes</small><b>{m ? m.bounces : 0}</b></div>
      </div>
      <div className="rp-wrap">
        <table className="rp-table">
          <thead><tr><th>Email</th><th>Enviado</th><th>Abierto</th><th>Clic</th></tr></thead>
          <tbody>
            {people.length ? people.map(([email, s]) => (
              <tr key={email}><td className="rp-mono">{email}</td><td>{s.sent ? "✓" : "—"}</td><td>{s.opened ? "✓" : "—"}</td><td>{s.clicked ? "✓" : "—"}</td></tr>
            )) : <tr><td colSpan={4} className="rp-empty">{campaign.status === "scheduled" ? "Aún no ha salido." : "Todavía no hay envíos registrados (el servidor envía cada minuto)."}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CampaignWizard() {
  const { id } = useParams();
  const isNew = id === "nueva";
  const navigate = useNavigate();
  const { items, orgId } = useOutletContext();
  const [campaign, setCampaign] = useState(isNew ? null : undefined);
  const [step, setStep] = useState(1);
  const [missing, setMissing] = useState(false);
  const opened = useRef(isNew);

  useEffect(() => {
    if (isNew) return undefined;
    return onSnapshot(doc(db, "campaigns", id), (s) => {
      if (!s.exists() || s.data().section !== SECTION) { setMissing(true); return; }
      const c = { id: s.id, ...s.data() };
      setCampaign(c);
      // Solo la primera vez: abrir en el paso donde se quedó.
      if (!opened.current) { opened.current = true; setStep(Math.min(Math.max(c.step || 1, 1), 4)); }
    }, () => setMissing(true));
  }, [id, isNew]);

  // Al crear la campaña en el paso 1 pasamos a su URL (ya existe en Firestore).
  const onCreated = async (cid, next) => {
    if (isNew) {
      const s = await getDoc(doc(db, "campaigns", cid));
      setCampaign({ id: cid, ...s.data() });
      setStep(next);
      navigate(`/restaurantes/campanas/${cid}`, { replace: true });
    } else setStep(next);
  };

  if (missing) return <div className="rp-empty">Esta campaña no existe o se eliminó. <span className="rp-name" style={{ color: "#1f5c46" }} onClick={() => navigate("/restaurantes/campanas")}>Volver a Campañas</span></div>;
  if (campaign === undefined) return <div className="rp-empty">Cargando campaña…</div>;

  const draft = !campaign || campaign.status === "draft";
  const max = campaign ? Math.min(Math.max(campaign.step || 1, step), 4) : 1;
  return (
    <div>
      <div className="rf-crumb"><span className="rf-crumb__link" onClick={() => navigate("/restaurantes/campanas")}>Campañas</span> / {campaign?.config?.campaignName || "Nueva campaña"}</div>
      <h1 className="rp-title">{campaign?.config?.campaignName || "Nueva campaña"}</h1>
      <p className="rp-sub">Email de ISLAS SEM a los restaurantes que elijas.</p>
      {draft ? (
        <>
          <Steps step={step} max={max} onGo={setStep} />
          {step === 1 && <StepData campaign={campaign} onSaved={onCreated} />}
          {step === 2 && campaign && <StepRecipients campaign={campaign} items={items} onBack={() => setStep(1)} onSaved={setStep} />}
          {step === 3 && campaign && <StepDesign campaign={campaign} onBack={() => setStep(2)} onSaved={setStep} />}
          {step === 4 && campaign && <StepSend campaign={campaign} items={items} orgId={orgId} onBack={() => setStep(3)} />}
        </>
      ) : <Results campaign={campaign} />}
    </div>
  );
}
