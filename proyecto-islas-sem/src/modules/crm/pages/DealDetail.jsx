import { useMemo, useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import CrmModal from "../components/CrmModal";
import { useCrmCollection, crmCreate, crmUpdate, crmRemove, logActivity, money, fmtDate, LOST_REASONS } from "../lib/crm";
import { usePipelines, getStages, flattenStages, findStage, budgetTier, STAGE_COLORS, CLIENT_TIERS } from "../lib/pipelines";
import { runStageAutomations, markResponded } from "../lib/automations";
import { downloadDocPDF, openDocPDF } from "../lib/pdf";
import { queueEmail, basicEmail } from "../lib/outbox";
import { CustomFieldsForm } from "../components/CustomFields";
import { CreateFieldModal, ExtraFieldsEditor } from "../components/DealFields";
import { LEAD_SOURCES, DEAL_TYPES } from "../lib/crm";
import "../crm.styles.css";
import "../pipeline.styles.css";
import { submissionLabel, submissionEntries } from "../../forms/public/builtinForms";

const TABS = ["General", "Productos", "Cotizaciones", "Facturas", "Automatización", "Historial"];
const OFFER_STATE = { enviada: { t: "Esperando respuesta", c: "info" }, respondio: { t: "Cliente respondió", c: "ok" }, aceptada: { t: "Oferta aceptada", c: "ok" }, perdida: { t: "Oferta perdida", c: "bad" }, seguimiento: { t: "Seguimiento activo", c: "warn" } };

// Texto de plazo restante para el contador del banner.
function plazoRestante(dueAt) {
  if (!dueAt) return null;
  const ms = dueAt - Date.now();
  if (ms <= 0) return { txt: "Plazo vencido", over: true };
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return { txt: h >= 1 ? `Faltan ${h}h ${m}m` : `Faltan ${m}m`, over: false };
}

export default function DealDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { items: deals } = useCrmCollection("deals");
  const { items: activities } = useCrmCollection("activities");
  const { items: products } = useCrmCollection("products");
  const { items: quotes } = useCrmCollection("quotes");
  const { items: invoices } = useCrmCollection("invoices");
  const { items: contacts } = useCrmCollection("contacts");
  const { items: formSubs } = useCrmCollection("formSubmissions");
  const { pipelines } = usePipelines();
  const [tab, setTab] = useState("General");
  const [showOffer, setShowOffer] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [newField, setNewField] = useState(false);
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 30000); return () => clearInterval(t); }, []);

  const deal = deals.find((d) => d.id === id);
  const pipeline = pipelines.find((p) => p.id === deal?.pipelineId) || pipelines[0];
  // Email del contacto (para encolar correos): del contacto enlazado o del propio deal.
  const dealContact = contacts.find((c) => c.id === deal?.contactId);
  const contactEmail = dealContact?.email || deal?.contactEmail || "";
  const dealSubmissions = useMemo(
    () => formSubs.filter((s) => s.dealId === id).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)),
    [formSubs, id]
  );

  const stages = useMemo(() => (pipeline ? flattenStages(getStages(pipeline, deal?.board || "pos")) : []), [pipeline, deal]);
  const timeline = useMemo(
    () =>
      activities
        .filter((a) => a.entity === "deal" && a.entityId === id)
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)),
    [activities, id]
  );

  if (!deal) {
    return (
      <div className="crmpipe crm">
        <div className="crm-loading">Cargando negociación…</div>
        <button className="crm-btn ghost" onClick={() => navigate("/dashboard/crm/pipeline")}>← Volver al Kanban</button>
      </div>
    );
  }

  const ci = stages.findIndex((s) => s.id === deal.stage);
  const acc = STAGE_COLORS[(ci < 0 ? 0 : ci) % STAGE_COLORS.length];
  const bt = budgetTier(deal.amount);
  const tier = CLIENT_TIERS[deal.clientType] || CLIENT_TIERS.nuevo;

  const upd = (data) => crmUpdate("deals", id, data);
  const moveStage = (sid) => {
    upd({ stage: sid });
    const name = findStage(getStages(pipeline, deal.board || "pos"), sid)?.name || sid;
    logActivity(deal.orgId, { type: "Nota", title: `Etapa cambiada a "${name}"`, entity: "deal", entityId: id, contactId: deal.contactId || "" });
    runStageAutomations(pipeline, { ...deal, stage: sid, contactEmail }, sid, deal.orgId);
  };
  const rename = () => {
    const t = window.prompt("Nombre de la negociación:", deal.title);
    if (t && t.trim()) upd({ title: t.trim() });
  };
  const sendOffer = async (o) => {
    // avanzar automáticamente a la siguiente etapa (o a una que contenga "oferta")
    const target = stages.find((s) => /oferta|presupuesto|negocia/i.test(s.name)) || stages[Math.min(ci + 1, stages.length - 1)];
    // Modo prueba: plazo de 2 minutos para ver la automatización sin esperar horas.
    const isTest = o.plazoH === "test";
    const plazoH = isTest ? 2 / 60 : Number(o.plazoH) || 72;
    const due = Date.now() + plazoH * 3600 * 1000;
    await upd({
      stage: target ? target.id : deal.stage,
      offer: { state: "enviada", channel: o.channel, plazoH, link: o.link || "", fileName: o.fileName || "", sentAt: Date.now(), dueAt: due },
    });
    await logActivity(deal.orgId, {
      type: "Email",
      title: `Oferta enviada por ${o.channel}${o.fileName ? " (" + o.fileName + ")" : ""} · responder en ${isTest ? "2 min (prueba)" : o.plazoH + "h"}`,
      entity: "deal",
      entityId: id,
      contactId: deal.contactId || "",
    });
    // Encolar el correo de la oferta (lo enviará el backend de Loading). Adjunta el último presupuesto si hay.
    const lastQuote = dealQuotes[0];
    await queueEmail(deal.orgId, {
      to: contactEmail,
      toName: deal.contact || "",
      subject: `Tu presupuesto de ISLAS SEM · ${deal.title}`,
      kind: "offer",
      dealId: id,
      contactId: deal.contactId || "",
      attachment: lastQuote ? { type: "quotePdf", quoteId: lastQuote.id } : null,
      html: basicEmail({
        title: "Te enviamos tu presupuesto",
        body: `Hola ${deal.contact || ""},<br><br>Adjuntamos la propuesta para <b>${deal.title}</b> por un importe de <b>${money(deal.amount)}</b>.<br>Quedamos atentos a tu respuesta en las próximas <b>${isTest ? "horas" : o.plazoH + " horas"}</b>.`,
        cta: o.link ? "Ver propuesta" : "",
        ctaUrl: o.link || "",
      }),
    });
    if (target) runStageAutomations(pipeline, { ...deal, stage: target.id, contactEmail }, target.id, deal.orgId);
    setShowOffer(false);
  };
  const setOfferState = (state) => {
    upd({ offer: { ...(deal.offer || {}), state } });
    logActivity(deal.orgId, { type: "Nota", title: `Oferta → ${OFFER_STATE[state]?.t || state}`, entity: "deal", entityId: id, contactId: deal.contactId || "" });
  };
  // Cliente respondió dentro de plazo -> avanza a la siguiente etapa (y dispara sus automatizaciones).
  const respondedAdvance = async () => {
    await markResponded({ ...deal, id }, "respondio");
    const next = stages[Math.min(ci + 1, stages.length - 1)];
    if (next && next.id !== deal.stage) moveStage(next.id);
  };

  // ---- Cerrar negociación (Ganado / Perdido) ----
  const closeDeal = async ({ status, reason, comment }) => {
    await upd({
      status,
      closedAt: Date.now(),
      lostReason: status === "perdido" ? reason || "" : "",
      closeComment: comment || "",
    });
    await logActivity(deal.orgId, {
      type: "Nota",
      title:
        status === "ganado"
          ? `🏆 Negociación GANADA${comment ? ` · ${comment}` : ""}`
          : `❌ Negociación PERDIDA · ${reason || "sin motivo"}${comment ? ` · ${comment}` : ""}`,
      entity: "deal",
      entityId: id,
      contactId: deal.contactId || "",
    });
    setShowClose(false);
  };
  const reopenDeal = async () => {
    await upd({ status: "open", closedAt: null, lostReason: "", closeComment: "" });
    await logActivity(deal.orgId, { type: "Nota", title: "🔄 Negociación reabierta", entity: "deal", entityId: id, contactId: deal.contactId || "" });
  };
  const closed = deal.status === "ganado" || deal.status === "perdido";

  // ---- Productos de la negociación ----
  const items = deal.items || [];
  const saveItems = (next) => {
    const subtotal = next.reduce((a, it) => a + (Number(it.price) || 0) * (Number(it.qty) || 0), 0);
    const total = subtotal * 1.21; // IVA 21%
    upd({ items: next, subtotal, amount: total, itemsCount: next.length, priceType: "producto" });
  };
  const addItem = (prodId) => {
    const p = products.find((x) => x.id === prodId);
    if (!p) return;
    saveItems([...items, { prodId: p.id, name: p.name, price: Number(p.price) || 0, qty: 1 }]);
  };
  const setQty = (i, qty) => saveItems(items.map((it, j) => (j === i ? { ...it, qty: Math.max(1, Number(qty) || 1) } : it)));
  const removeItem = (i) => saveItems(items.filter((_, j) => j !== i));
  const subtotal = items.reduce((a, it) => a + (Number(it.price) || 0) * (Number(it.qty) || 0), 0);

  // ---- Generar cotización / factura desde la negociación ----
  const genDoc = async (type) => {
    const col = type === "quotes" ? quotes : invoices;
    const prefix = type === "quotes" ? "CT" : "FT";
    const number = `${prefix}-${1000 + col.length + 1}`;
    await crmCreate(type, deal.orgId, {
      number,
      client: deal.contact || "",
      concept: deal.title,
      amount: Number(deal.amount) || subtotal * 1.21,
      status: type === "quotes" ? "Enviada" : "Pendiente",
      dealId: id,
      items: items,
    });
    await logActivity(deal.orgId, { type: "Nota", title: `${type === "quotes" ? "Cotización" : "Factura"} ${number} generada desde la negociación`, entity: "deal", entityId: id, contactId: deal.contactId || "" });
    alert(`${type === "quotes" ? "Cotización" : "Factura"} ${number} creada.`);
  };
  const dealQuotes = quotes.filter((q) => q.dealId === id);
  const dealInvoices = invoices.filter((q) => q.dealId === id);

  return (
    <div className="crmpipe dficha">
      <div className="dficha__head">
        <div>
          <button className="crm-btn ghost sm" onClick={() => navigate("/dashboard/crm/pipeline")}>← Negociaciones</button>
          <h1 className="dficha__title" style={{ marginTop: 10 }}>
            {deal.clientType === "vip" ? "⭐ " : ""}{deal.title}
            <span className="editpen" onClick={rename} title="Editar nombre">✎</span>
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="crm-btn" onClick={() => setShowOffer(true)}>📤 Enviar oferta</button>
          <button className="crm-btn danger" onClick={() => { if (window.confirm(`¿Eliminar "${deal.title}"?`)) { crmRemove("deals", id); navigate("/dashboard/crm/pipeline"); } }}>Eliminar</button>
        </div>
      </div>

      {/* Banner de cierre (Ganado / Perdido) */}
      {closed && (
        <div className="close-banner" style={{ background: deal.status === "ganado" ? "#e9f9ef" : "#fdeef1", borderColor: deal.status === "ganado" ? "#8fdcab" : "#f1b8c4" }}>
          <span style={{ fontSize: 22 }}>{deal.status === "ganado" ? "🏆" : "❌"}</span>
          <div>
            <b style={{ color: deal.status === "ganado" ? "#1a7d43" : "#b0304c" }}>
              {deal.status === "ganado" ? "Negociación GANADA" : "Negociación PERDIDA"}
            </b>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              {deal.status === "perdido" && deal.lostReason ? `Motivo: ${deal.lostReason} · ` : ""}
              {deal.closeComment ? `${deal.closeComment} · ` : ""}
              Cerrada el {fmtDate(deal.closedAt)}
            </div>
          </div>
          <button className="crm-btn ghost sm" style={{ marginLeft: "auto" }} onClick={reopenDeal}>🔄 Reabrir</button>
        </div>
      )}

      {/* Banner de oferta con reloj de respuesta (SLA) */}
      {deal.offer && (() => {
        const waiting = deal.offer.state === "enviada";
        const p = waiting ? plazoRestante(deal.offer.dueAt) : null;
        return (
          <div className="offer-banner">
            <span className={`crm-chip ${OFFER_STATE[deal.offer.state]?.c || "info"}`}>{OFFER_STATE[deal.offer.state]?.t || deal.offer.state}</span>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>
              Enviada por <b>{deal.offer.channel}</b>{deal.offer.fileName ? ` · ${deal.offer.fileName}` : ""} · vence {fmtDate(deal.offer.dueAt)}
            </span>
            {waiting && p && (
              <span className="sla-timer" style={{ background: p.over ? "#fdeef1" : "#fff7e6", color: p.over ? "#b0304c" : "#8a6d1a" }}>
                {p.over ? "⏰ " : "⌛ "}{p.txt}
              </span>
            )}
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              {waiting && <button className="crm-btn sm" onClick={respondedAdvance} title="Respondió a tiempo → avanza de etapa">📥 Respondió</button>}
              <button className="crm-btn ghost sm" onClick={() => setOfferState("aceptada")}>Aceptada</button>
              <button className="crm-btn ghost sm" onClick={() => setOfferState("seguimiento")}>Seguimiento</button>
              <button className="crm-btn ghost sm" onClick={() => setOfferState("perdida")}>Perdida</button>
            </div>
          </div>
        );
      })()}

      {/* Barra de etapas */}
      <div className="dstage-bar">
        {stages.map((s, i) => (
          <div
            key={s.id}
            className={`dstage ${i <= ci ? "on" : ""}`}
            style={i <= ci ? { background: acc } : undefined}
            onClick={() => moveStage(s.id)}
          >
            {s.name}
          </div>
        ))}
        <div className="dstage dstage-close" onClick={() => setShowClose(true)}>{closed ? (deal.status === "ganado" ? "🏆 Ganada" : "❌ Perdida") : "Cerrar negociación"}</div>
      </div>

      {/* Tabs */}
      <div className="dtabs">
        {TABS.map((t) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === "General" ? (
        <div className="dcols">
          {/* Columna izquierda: datos */}
          <div className="cd-col">
            <div className="crm-panel">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h4 className="cd-h" style={{ margin: 0 }}>Sobre la negociación</h4>
                <span className="crm-link" style={{ fontSize: 12.5 }} onClick={() => setNewField(true)}>+ Crear campo</span>
              </div>
              <div className="crm-two">
                <div className="crm-field"><label>Tipo de negociación</label>
                  <select defaultValue={deal.type || "Sales"} onChange={(e) => upd({ type: e.target.value })}>
                    {[...new Set([...DEAL_TYPES, deal.type || "Sales"])].map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="crm-field"><label>Origen</label>
                  <select defaultValue={deal.source || ""} onChange={(e) => upd({ source: e.target.value })}>
                    <option value="">No seleccionado</option>
                    {[...new Set([...LEAD_SOURCES, ...(deal.source ? [deal.source] : [])])].map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="crm-field"><label>Origen de información</label>
                <textarea rows="2" defaultValue={deal.sourceInfo || ""} onBlur={(e) => upd({ sourceInfo: e.target.value })} />
              </div>
              <div className="crm-two">
                <div className="crm-field"><label>Importe (€)</label>
                  <input type="number" defaultValue={deal.amount || 0} onBlur={(e) => upd({ amount: Number(e.target.value) || 0 })} />
                </div>
                <div className="crm-field"><label>Responsable</label>
                  <input defaultValue={deal.responsable || ""} onBlur={(e) => upd({ responsable: e.target.value })} />
                </div>
              </div>
              <div className="crm-two">
                <div className="crm-field"><label>Contacto</label>
                  <input defaultValue={deal.contact || ""} onBlur={(e) => upd({ contact: e.target.value })} />
                </div>
                <div className="crm-field"><label>Empresa</label>
                  <input defaultValue={deal.company || ""} onBlur={(e) => upd({ company: e.target.value })} />
                </div>
              </div>
              <div className="crm-two">
                <div className="crm-field"><label>Fecha de inicio</label>
                  <input type="date" defaultValue={deal.startDate || ""} onBlur={(e) => upd({ startDate: e.target.value })} />
                </div>
                <div className="crm-field"><label>Observadores</label>
                  <input defaultValue={deal.observers || ""} onBlur={(e) => upd({ observers: e.target.value })} placeholder="Nombres separados por coma" />
                </div>
              </div>
              <div className="crm-field"><label>Comentario</label>
                <textarea rows="3" defaultValue={deal.notes || ""} onBlur={(e) => upd({ notes: e.target.value })} />
              </div>
              <DealMoreFields key={deal.id} deal={deal} onSave={upd} />
              <dl className="crm-dl" style={{ marginTop: 12 }}>
                <div className="row"><dt>Embudo</dt><dd>{pipeline?.name}</dd></div>
                <div className="row"><dt>Etapa</dt><dd>{stages[ci]?.name || "—"}</dd></div>
                <div className="row"><dt>Creada</dt><dd>{fmtDate(deal.createdAt)}</dd></div>
                {deal.bitrixFunnel && <div className="row"><dt>En Bitrix</dt><dd>{deal.bitrixFunnel} › {deal.bitrixStage}</dd></div>}
              </dl>
            </div>
          </div>

          {/* Columna derecha: prioridad + timeline */}
          <div className="cd-col">
            <div className="crm-panel">
              <h4 className="cd-h">Prioridad y cliente</h4>
              <div className="priocircle-row">
                <div className="priocircle" style={{ background: bt.color }}>{money(deal.amount).replace(/,\d+/, "")}</div>
                <div>
                  <div style={{ fontWeight: 700 }}>{bt.label}</div>
                  <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Color según volumen del presupuesto</div>
                </div>
              </div>
              <div className="crm-field" style={{ marginTop: 12 }}><label>Tipología de clientela</label>
                <select defaultValue={deal.clientType || "nuevo"} onChange={(e) => upd({ clientType: e.target.value })}>
                  {Object.entries(CLIENT_TIERS).map(([k, t]) => <option key={k} value={k}>{t.icon} {t.label}</option>)}
                </select>
              </div>
              <div className="crm-field"><label>Tipo de precio</label>
                <select defaultValue={deal.priceType || "producto"} onChange={(e) => upd({ priceType: e.target.value })}>
                  <option value="producto">Precio de producto (contrato final)</option>
                  <option value="estimado">Precio estimado (rango)</option>
                </select>
              </div>
              {deal.priceType === "estimado" && (
                <div className="crm-two">
                  <div className="crm-field"><label>Estimado desde (€)</label><input type="number" defaultValue={deal.estMin || 0} onBlur={(e) => upd({ estMin: Number(e.target.value) || 0 })} /></div>
                  <div className="crm-field"><label>Estimado hasta (€)</label><input type="number" defaultValue={deal.estMax || 0} onBlur={(e) => upd({ estMax: Number(e.target.value) || 0 })} /></div>
                </div>
              )}
            </div>

            {dealSubmissions.length > 0 && (
              <div className="crm-panel">
                <h4 className="cd-h">📋 Formularios recibidos ({dealSubmissions.length})</h4>
                {dealSubmissions.map((s) => (
                  <details key={s.id} style={{ borderBottom: "1px solid var(--crm-line,#eef3f3)", padding: "8px 0" }}>
                    <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 13.5 }}>
                      {submissionLabel(s)}
                      <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 12 }}> · {fmtDate(s.createdAt)}</span>
                    </summary>
                    <dl className="crm-dl" style={{ marginTop: 8 }}>
                      {submissionEntries(s).map(([k, v]) => (
                        <div className="row" key={k}><dt style={{ textTransform: "capitalize" }}>{k}</dt><dd>{String(v) || "—"}</dd></div>
                      ))}
                    </dl>
                  </details>
                ))}
              </div>
            )}

            <div className="crm-panel">
              <h4 className="cd-h">Actividad / Historial</h4>
              {timeline.length ? (
                <ul className="crm-timeline">
                  {timeline.map((a) => (
                    <li key={a.id} className="crm-tl-item">
                      <span className="dot" />
                      <div className="tl-t">{a.type}: {a.title}</div>
                      <div className="tl-m">{fmtDate(a.createdAt)}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ color: "var(--muted)", fontSize: 14, margin: 0 }}>Sin actividad registrada aún.</p>
              )}
            </div>
          </div>
        </div>
      ) : tab === "Productos" ? (
        <div className="crm-panel">
          <h4 className="cd-h">Productos de la negociación</h4>
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            <select id="dd_prod" className="crm-search" style={{ margin: 0, maxWidth: 360 }} defaultValue="">
              <option value="">Seleccionar producto del catálogo…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name} — {money(p.price)}</option>)}
            </select>
            <button className="crm-btn" onClick={() => { const s = document.getElementById("dd_prod"); if (s.value) { addItem(s.value); s.value = ""; } }}>+ Añadir</button>
          </div>
          {items.length ? (
            <table className="crm-table">
              <thead><tr><th>Producto</th><th>Precio</th><th>Cantidad</th><th>Importe</th><th></th></tr></thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i}>
                    <td><b>{it.name}</b></td>
                    <td>{money(it.price)}</td>
                    <td><input type="number" min="1" value={it.qty} onChange={(e) => setQty(i, e.target.value)} style={{ width: 70, padding: "6px 8px", border: "1px solid var(--crm-line)", borderRadius: 6 }} /></td>
                    <td>{money((it.price || 0) * (it.qty || 0))}</td>
                    <td style={{ textAlign: "right" }}><button className="crm-btn ghost sm" onClick={() => removeItem(i)}>Quitar</button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td colSpan="3" style={{ textAlign: "right", color: "var(--crm-muted)" }}>Subtotal</td><td colSpan="2">{money(subtotal)}</td></tr>
                <tr><td colSpan="3" style={{ textAlign: "right", color: "var(--crm-muted)" }}>IVA (21%)</td><td colSpan="2">{money(subtotal * 0.21)}</td></tr>
                <tr><td colSpan="3" style={{ textAlign: "right", fontWeight: 700 }}>TOTAL</td><td colSpan="2" style={{ fontWeight: 700 }}>{money(subtotal * 1.21)}</td></tr>
              </tfoot>
            </table>
          ) : (
            <p style={{ color: "var(--muted)", margin: 0 }}>Sin productos. Añade desde el catálogo (el importe del negocio se calcula solo).</p>
          )}
        </div>
      ) : tab === "Cotizaciones" || tab === "Facturas" ? (
        (() => {
          const type = tab === "Cotizaciones" ? "quotes" : "invoices";
          const list = tab === "Cotizaciones" ? dealQuotes : dealInvoices;
          return (
            <div className="crm-panel">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <h4 className="cd-h" style={{ margin: 0 }}>{tab} de esta negociación</h4>
                <button className="crm-btn" onClick={() => genDoc(type)}>+ Generar {tab === "Cotizaciones" ? "cotización" : "factura"}</button>
              </div>
              {list.length ? (
                <table className="crm-table" style={{ marginTop: 12 }}>
                  <thead><tr><th>Nº</th><th>Cliente</th><th>Concepto</th><th>Importe</th><th>Estado</th><th>Fecha</th><th></th></tr></thead>
                  <tbody>
                    {list.map((q) => (
                      <tr key={q.id}>
                        <td><b>{q.number}</b></td><td>{q.client || "—"}</td><td>{q.concept || "—"}</td>
                        <td>{money(q.amount)}</td><td><span className="crm-chip info">{q.status}</span></td><td>{fmtDate(q.createdAt)}</td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          <button className="crm-btn ghost sm" onClick={() => openDocPDF(q, { isInvoice: type === "invoices" })} title="Previsualizar PDF">👁</button>{" "}
                          <button className="crm-btn sm" onClick={() => downloadDocPDF(q, { isInvoice: type === "invoices" })} title="Descargar PDF">📄 PDF</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ color: "var(--muted)", marginTop: 12 }}>Sin {tab.toLowerCase()} aún. Genera una con los productos de la negociación ({items.length} producto(s), total {money(deal.amount)}).</p>
              )}
            </div>
          );
        })()
      ) : (
        <div className="crm-panel">
          <h4 className="cd-h">{tab}</h4>
          <p style={{ color: "var(--muted)", margin: 0 }}>Flujos de trabajo y automatización de esta negociación (ver pestaña Automatización de ventas del embudo).</p>
        </div>
      )}

      {showOffer && <OfferModal deal={deal} onClose={() => setShowOffer(false)} onSend={sendOffer} />}
      {showClose && <CloseModal deal={deal} onClose={() => setShowClose(false)} onConfirm={closeDeal} />}
      {newField && (
        <CreateFieldModal
          orgId={deal.orgId}
          onClose={() => setNewField(false)}
          onAddExtra={(f) => upd({ extraFields: [...(deal.extraFields || []), f] })}
        />
      )}
    </div>
  );
}

function CloseModal({ deal, onClose, onConfirm }) {
  const [status, setStatus] = useState(deal.status === "perdido" ? "perdido" : "ganado");
  const [reason, setReason] = useState(deal.lostReason || LOST_REASONS[0]);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const confirm = async () => {
    setSaving(true);
    try { await onConfirm({ status, reason, comment }); } finally { setSaving(false); }
  };
  return (
    <CrmModal
      title="Cerrar negociación"
      onClose={onClose}
      footer={
        <>
          <button className="crm-btn ghost" onClick={onClose}>Cancelar</button>
          <button className="crm-btn" style={{ background: status === "ganado" ? "#1faa59" : "#d94f70" }} onClick={confirm} disabled={saving}>
            {saving ? "Guardando…" : status === "ganado" ? "🏆 Marcar como Ganada" : "❌ Marcar como Perdida"}
          </button>
        </>
      }
    >
      <p style={{ margin: 0 }}>Negociación: <b>{deal.title}</b> · {money(deal.amount)}</p>
      <div style={{ display: "flex", gap: 10, margin: "6px 0 4px" }}>
        <button type="button" className={`closepick ${status === "ganado" ? "on won" : ""}`} onClick={() => setStatus("ganado")}>🏆 Ganada</button>
        <button type="button" className={`closepick ${status === "perdido" ? "on lost" : ""}`} onClick={() => setStatus("perdido")}>❌ Perdida</button>
      </div>
      {status === "perdido" && (
        <div className="crm-field">
          <label>Motivo de la pérdida</label>
          <select value={reason} onChange={(e) => setReason(e.target.value)}>
            {LOST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      )}
      <div className="crm-field">
        <label>Comentario (opcional)</label>
        <textarea rows="2" value={comment} onChange={(e) => setComment(e.target.value)} placeholder={status === "ganado" ? "Detalles del cierre, importe final, próximos pasos…" : "¿Qué aprendimos? ¿Se puede recuperar más adelante?"} />
      </div>
      <p className="sub" style={{ fontSize: 12, color: "var(--crm-muted)", margin: 0 }}>
        Queda registrado en el historial y cuenta en Analítica ({status === "ganado" ? "importe ganado y conversión" : "motivos de pérdida"}). Podrás reabrirla.
      </p>
    </CrmModal>
  );
}

function OfferModal({ deal, onClose, onSend }) {
  const [channel, setChannel] = useState("correo");
  const [plazoH, setPlazoH] = useState("72");
  const [link, setLink] = useState("");
  const [fileName, setFileName] = useState("");
  const [sending, setSending] = useState(false);
  const send = async () => {
    setSending(true);
    try { await onSend({ channel, plazoH, link, fileName }); } finally { setSending(false); }
  };
  return (
    <CrmModal
      title="Enviar oferta"
      onClose={onClose}
      footer={
        <>
          <button className="crm-btn ghost" onClick={onClose}>Cancelar</button>
          <button className="crm-btn" onClick={send} disabled={sending}>{sending ? "Enviando…" : "Enviar oferta"}</button>
        </>
      }
    >
      <p style={{ margin: 0 }}>Negociación: <b>{deal.title}</b></p>
      <div className="crm-field">
        <label>Adjuntar presupuesto (PDF) o vídeo</label>
        <input type="file" accept=".pdf,video/*" onChange={(e) => setFileName(e.target.files?.[0]?.name || "")} />
        {fileName && <span style={{ fontSize: 12, color: "var(--crm-muted)" }}>Adjunto: {fileName}</span>}
      </div>
      <div className="crm-field">
        <label>Enviar por</label>
        <select value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="correo">✉️ Correo electrónico</option>
          <option value="enlace">🔗 Enlace para leer en la plataforma</option>
          <option value="video">🎬 Vídeo (Loom / YouTube oculto)</option>
        </select>
      </div>
      {channel !== "correo" && (
        <div className="crm-field"><label>Enlace</label><input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" /></div>
      )}
      <div className="crm-field">
        <label>Plazo de respuesta (si no responde → Seguimiento Activo)</label>
        <select value={plazoH} onChange={(e) => setPlazoH(e.target.value)}>
          <option value="24">24 horas</option>
          <option value="48">48 horas</option>
          <option value="72">72 horas</option>
          <option value="test">⏱ 2 minutos (modo prueba)</option>
        </select>
      </div>
      <p className="sub" style={{ fontSize: 12, color: "var(--crm-muted)", margin: 0 }}>
        Al enviar, la negociación <b>cambia de etapa automáticamente</b> y se registra en el historial.
      </p>
    </CrmModal>
  );
}

// Campos personalizados (de todas las negociaciones) y campos extra de esta negociación,
// editables en la ficha; "Guardar campos" aparece cuando hay cambios.
function DealMoreFields({ deal, onSave }) {
  const [custom, setCustom] = useState(null);
  const [extra, setExtra] = useState(null);
  const curCustom = custom ?? deal.custom ?? {};
  const curExtra = extra ?? deal.extraFields ?? [];
  const dirty = custom !== null || extra !== null;
  const save = async () => {
    await onSave({ ...(custom !== null ? { custom } : {}), ...(extra !== null ? { extraFields: extra } : {}) });
    setCustom(null);
    setExtra(null);
  };
  return (
    <>
      <CustomFieldsForm entity="deals" values={curCustom} onChange={setCustom} />
      <ExtraFieldsEditor value={curExtra} onChange={setExtra} />
      {dirty && (
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button className="crm-btn sm" onClick={save}>Guardar campos</button>
          <button className="crm-btn ghost sm" onClick={() => { setCustom(null); setExtra(null); }}>Descartar</button>
        </div>
      )}
    </>
  );
}
