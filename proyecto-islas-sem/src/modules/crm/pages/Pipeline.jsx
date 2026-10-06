import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import CrmModal from "../components/CrmModal";
import AssignImportedDeals from "../components/AssignImportedDeals";
import { useCrmCollection, crmCreate, crmUpdate, crmRemove, logActivity, money } from "../lib/crm";
import {
  usePipelines,
  getStages,
  flattenStages,
  findStage,
  budgetTier,
  BUDGET_TIERS,
  STAGE_COLORS,
  NEG_COLORS,
  CLIENT_TIERS,
  addStage as addStageDb,
  renameStage as renameStageDb,
  deleteStage as deleteStageDb,
  moveStage as moveStageDb,
  createPipeline,
} from "../lib/pipelines";
import { runStageAutomations } from "../lib/automations";
import "../crm.styles.css";
import "../pipeline.styles.css";

const DICON = {
  phone: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8 9.5a16 16 0 0 0 6 6l1.1-1.1a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2Z" /></svg>,
  mail: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>,
  chat: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" /></svg>,
};

// Modos de orden por columna (como el prototipo).
const SORT_MODES = [
  ["presupuesto", "€ Presupuesto"],
  ["cliente", "⭐ Cliente"],
  ["manual", "Manual"],
];
const CLIENT_RANK = { vip: 0, recurrente: 1, nuevo: 2 };
function sortDeals(items, mode) {
  const a = [...items];
  if (mode === "cliente") a.sort((x, y) => (CLIENT_RANK[x.clientType] ?? 3) - (CLIENT_RANK[y.clientType] ?? 3) || (y.amount || 0) - (x.amount || 0));
  else if (mode === "manual") a.sort((x, y) => (x.order ?? 0) - (y.order ?? 0));
  else a.sort((x, y) => (y.amount || 0) - (x.amount || 0));
  return a;
}

export default function Pipeline() {
  const { pipelines, loading } = usePipelines();
  const { items: deals, orgId } = useCrmCollection("deals");
  const { items: contacts } = useCrmCollection("contacts");
  const navigate = useNavigate();

  const [pipeId, setPipeId] = useState(null);
  const [board, setBoard] = useState("pos"); // 'pos' | 'neg'
  const [view, setView] = useState("kanban"); // 'kanban' | 'lista'
  const [search, setSearch] = useState("");
  const [quickCol, setQuickCol] = useState(null);
  const [showPipeMenu, setShowPipeMenu] = useState(false);
  const [newDeal, setNewDeal] = useState(null); // {stage} o null
  const [moveDeal, setMoveDeal] = useState(null); // deal a mover de tablero
  const [colSort, setColSort] = useState({}); // {stageId: modo}
  const dragId = useRef(null);
  const [overCol, setOverCol] = useState(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const unassigned = deals.filter((d) => !d.pipelineId);

  const pipeline = useMemo(
    () => pipelines.find((p) => p.id === pipeId) || pipelines[0],
    [pipelines, pipeId]
  );

  if (loading || !pipeline) {
    return (
      <div className="crmpipe crm">
        <div className="crm-loading">Cargando embudos…</div>
      </div>
    );
  }

  const isNeg = board === "neg";
  const stages = getStages(pipeline, board);
  const palette = isNeg ? NEG_COLORS : STAGE_COLORS;
  const q = search.trim().toLowerCase();

  const colMode = (sid) => colSort[sid] || "presupuesto";
  const dealsIn = (stageId) =>
    sortDeals(
      deals.filter(
        (d) =>
          d.pipelineId === pipeline.id &&
          (d.board || "pos") === board &&
          d.stage === stageId &&
          (!q || [d.title, d.contact, d.company].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)))
      ),
      colMode(stageId)
    );
  const cycleColSort = (sid) => {
    const cur = colMode(sid);
    const i = SORT_MODES.findIndex((m) => m[0] === cur);
    setColSort((c) => ({ ...c, [sid]: SORT_MODES[(i + 1) % SORT_MODES.length][0] }));
  };
  const moveDealOrder = (d, dir) => {
    const list = dealsIn(d.stage);
    const i = list.findIndex((x) => x.id === d.id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    crmUpdate("deals", d.id, { order: (list[j].order ?? j) + (dir > 0 ? 0.5 : -0.5) });
  };

  const totalDeals = deals.filter((d) => d.pipelineId === pipeline.id && (d.board || "pos") === board).length;

  /* ---------- acciones ---------- */
  const saveNewDeal = async (form) => {
    const match = contacts.find(
      (c) => `${c.firstName || ""} ${c.lastName || ""}`.trim().toLowerCase() === form.contact.trim().toLowerCase()
    );
    const ref = await crmCreate("deals", orgId, {
      pipelineId: pipeline.id,
      board,
      stage: form.stage,
      title: form.title.trim() || "Negociación",
      amount: Number(form.amount) || 0,
      contact: form.contact.trim(),
      contactId: match?.id || null,
      company: form.company.trim(),
      clientType: form.clientType || "nuevo",
      priceType: form.priceType || "producto",
    });
    await logActivity(orgId, {
      type: "Nota",
      title: `Negocio creado: ${form.title} (${money(form.amount)})`,
      entity: match ? "contact" : "deal",
      entityId: match?.id || ref.id,
    });
    setNewDeal(null);
  };

  const quickSave = async (stageId, title, amount) => {
    if (!title.trim()) return;
    await crmCreate("deals", orgId, {
      pipelineId: pipeline.id,
      board,
      stage: stageId,
      title: title.trim(),
      amount: Number(amount) || 0,
      contact: "",
      company: "",
      clientType: "nuevo",
      priceType: "producto",
    });
  };

  const onDrop = async (stageId) => {
    setOverCol(null);
    const id = dragId.current;
    dragId.current = null;
    if (!id) return;
    const d = deals.find((x) => x.id === id);
    if (!d || d.stage === stageId) return;
    await crmUpdate("deals", id, { stage: stageId });
    // Bitrix: al entrar en una etapa se ejecutan sus reglas de automatización
    runStageAutomations(pipeline, { ...d, stage: stageId }, stageId, orgId);
  };

  const doMoveBoard = async (d, targetBoard, stageId) => {
    await crmUpdate("deals", d.id, { board: targetBoard, stage: stageId });
    await logActivity(orgId, {
      type: "Nota",
      title: `"${d.title}" movido a ${targetBoard === "neg" ? "Kanban Negativo" : "Kanban positivo"}`,
      entity: d.contactId ? "contact" : "deal",
      entityId: d.contactId || d.id,
    });
    setMoveDeal(null);
    setBoard(targetBoard);
  };

  const renameStage = (sid, current) => {
    const name = window.prompt("Nuevo nombre de la etapa:", current);
    if (name && name.trim()) renameStageDb(pipeline, board, sid, name.trim());
  };
  const removeStage = (sid, name) => {
    if (flattenStages(stages).length <= 1) return alert("El embudo debe tener al menos una etapa.");
    if (window.confirm(`¿Eliminar la etapa "${name}"? Las negociaciones se quedarán sin columna.`))
      deleteStageDb(pipeline, board, sid);
  };
  const addStage = () => {
    const name = window.prompt("Nombre de la nueva etapa:");
    if (name && name.trim()) addStageDb(pipeline, board, name.trim());
  };
  const addPipeline = () => {
    const name = window.prompt("Nombre del nuevo embudo:");
    if (name && name.trim()) createPipeline(orgId, name.trim(), pipelines.length);
    setShowPipeMenu(false);
  };

  /* ---------- render de columna (funciones, NO componentes, para no re-montar) ---------- */
  const colHead = (s, color, sub) => (
    <div className={`deal-colhead${sub ? " sub-head" : ""}`} style={{ background: sub ? "#eef3f3" : color, color: sub ? "#516060" : "#fff" }}>
      <span className="colmove">
        <button onClick={() => moveStageDb(pipeline, board, s.id, -1)} title="Mover a la izquierda">◀</button>
        <button onClick={() => moveStageDb(pipeline, board, s.id, 1)} title="Mover a la derecha">▶</button>
      </span>
      <span className="colhead-name" onClick={() => renameStage(s.id, s.name)} title="Editar nombre">
        {s.name} <span className="colhead-pen">✎</span>
      </span>
      <span className="dcnt">{dealsIn(s.id).length}</span>
      <button className="colhead-add" title="Añadir negociación" onClick={() => setQuickCol(s.id)}>
        +
      </button>
    </div>
  );

  const renderColumn = (s, color, sub) => {
    const list = dealsIn(s.id);
    const total = list.reduce((a, d) => a + (Number(d.amount) || 0), 0);
    return (
      <div
        key={s.id}
        className={`col deal-col${overCol === s.id ? " dragover" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOverCol(s.id);
        }}
        onDragLeave={() => setOverCol((o) => (o === s.id ? null : o))}
        onDrop={() => onDrop(s.id)}
      >
        {colHead(s, color, sub)}
        <div className="deal-total">{money(total)}</div>
        {quickCol === s.id ? (
          <QuickAdd stageId={s.id} onSave={quickSave} onClose={() => setQuickCol(null)} />
        ) : (
          <button className="deal-quick" onClick={() => setQuickCol(s.id)}>+ Negociación rápida</button>
        )}
        <div className="col-sort" onClick={() => cycleColSort(s.id)} title="Ordenar columna: € Presupuesto / ⭐ Cliente / Manual">
          ⇅ {(SORT_MODES.find((m) => m[0] === colMode(s.id)) || SORT_MODES[0])[1]}
        </div>
        <div className="col__body">{list.map((d) => renderCard(d, color))}</div>
      </div>
    );
  };

  const renderCard = (d, color) => {
    const bt = budgetTier(d.amount);
    const vip = d.clientType === "vip";
    return (
      <div
        key={d.id}
        className="kcard deal-card"
        draggable
        style={{ borderLeft: `3px solid ${bt.color}` }}
        onDragStart={() => (dragId.current = d.id)}
        onClick={() => navigate(`/dashboard/crm/deals/${d.id}`)}
        title={`Prioridad presupuesto: ${bt.label}`}
      >
        <div className="deal-badge">{d.itemsCount || (d.items ? d.items.length : 0)}</div>
        <div className="card-tools">
          <button
            className="ct-move"
            title={isNeg ? "Devolver al Kanban positivo" : "Enviar al Kanban Negativo"}
            onClick={(e) => {
              e.stopPropagation();
              setMoveDeal(d);
            }}
          >
            {isNeg ? "↩" : "➡"}
          </button>
          <button title="Editar" onClick={(e) => { e.stopPropagation(); editDeal(d); }}>✎</button>
          <button className="ct-del" title="Eliminar" onClick={(e) => { e.stopPropagation(); if (window.confirm(`¿Eliminar "${d.title}"?`)) crmRemove("deals", d.id); }}>🗑</button>
        </div>
        <div className="deal-icons" onClick={(e) => e.stopPropagation()}>
          <span title="Llamar">{DICON.phone}</span>
          <span title="Correo">{DICON.mail}</span>
          <span title="Comentario">{DICON.chat}</span>
        </div>
        {(d.status === "ganado" || d.status === "perdido") && (
          <div className="deal-closed" style={{ background: d.status === "ganado" ? "#e9f9ef" : "#fdeef1", color: d.status === "ganado" ? "#1a7d43" : "#b0304c" }}>
            {d.status === "ganado" ? "🏆 Ganada" : `❌ Perdida${d.lostReason ? " · " + d.lostReason : ""}`}
          </div>
        )}
        <div className="kn">{vip ? "⭐ " : ""}{d.title}</div>
        <div className="deal-amt" style={{ color: bt.color, fontWeight: 700 }}>
          {d.priceType === "estimado" && (d.estMin || d.estMax)
            ? `Est. ${money(d.estMin)} – ${money(d.estMax)}`
            : money(d.amount)}
          {d.priceType === "estimado" && <span className="est-tag"> estimado</span>}
        </div>
        {d.contact && <div className="deal-contact kc">{d.contact}</div>}
        {d.company && <div className="kc">{d.company}</div>}
        {d.items && d.items.length > 0 && (
          <div className="deal-prod">📦 {d.items[0].name}{d.items.length > 1 && <b> +{d.items.length - 1}</b>}</div>
        )}
        <div className="deal-date2">{d.date || ""}</div>
        <div className="deal-foot">
          <span className="deal-act" onClick={(e) => e.stopPropagation()}>+ Actividad</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {colMode(d.stage) === "manual" && (
              <span className="prio-arrows" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => moveDealOrder(d, -1)} title="Subir">▲</button>
                <button onClick={() => moveDealOrder(d, 1)} title="Bajar">▼</button>
              </span>
            )}
            <span className="av" style={{ width: 24, height: 24, fontSize: 10 }}>
              {(d.responsable || "·").slice(0, 2).toUpperCase()}
            </span>
          </div>
        </div>
      </div>
    );
  };

  const editDeal = (d) => {
    const title = window.prompt("Título de la negociación:", d.title);
    if (title === null) return;
    const amount = window.prompt("Importe (€):", d.amount || 0);
    crmUpdate("deals", d.id, { title: title.trim() || d.title, amount: Number(amount) || 0 });
  };

  return (
    <div className="crmpipe">
      {unassigned.length > 0 && (
        <div style={{ background: "#fff7e6", border: "1px solid #f0d9a8", borderRadius: 10, padding: "10px 14px", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span>📥 <b>{unassigned.length}</b> negociaciones importadas de Bitrix aún no tienen embudo.</span>
          <button className="crm-btn sm" onClick={() => setAssignOpen(true)}>Asignar a embudos</button>
        </div>
      )}
      {assignOpen && <AssignImportedDeals deals={unassigned} pipelines={pipelines} onClose={() => setAssignOpen(false)} />}
      {/* Barra de herramientas */}
      <div className="dealbar">
        <div className="dealbar-l">
          <h1>Negociaciones</h1>
          <button className="crear-split" onClick={() => navigate("/dashboard/crm/newdeal")}>
            + Crear <span className="cx">▾</span>
          </button>
          <div className="pipesel" onClick={() => setShowPipeMenu((v) => !v)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16, color: "var(--teal)" }}><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3Z" /></svg>
            <b>{pipeline.name}</b>
            {isNeg && <span className="neg-flag">Negativo</span>}
            <span style={{ color: "var(--muted)" }}>▾</span>
          </div>
          <span className="viewchip">
            Negociaciones en progreso <b onClick={() => setSearch("")}>✕</b>
          </span>
          <div className="dealsearch">
            <input placeholder="buscar" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <button className="iconbtn" title="Ajustes del embudo">⚙</button>
        {showPipeMenu && (
          <div className="pipemenu">
            {pipelines.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setPipeId(p.id);
                  setBoard("pos");
                  setShowPipeMenu(false);
                }}
              >
                {p.id === pipeline.id ? "✓ " : ""}
                {p.name}
              </button>
            ))}
            <button className="new" onClick={addPipeline}>+ Crear embudo nuevo</button>
          </div>
        )}
      </div>

      {/* Sub-barra */}
      <div className="dealsub">
        <div className="viewtabs dealtabs">
          <button className={view === "kanban" && !isNeg ? "on" : ""} onClick={() => { setView("kanban"); setBoard("pos"); }}>Kanban</button>
          <button className={`tab-neg ${view === "kanban" && isNeg ? "on" : ""}`} onClick={() => { setView("kanban"); setBoard("neg"); }}>Kanban Negativo</button>
          <button className={view === "lista" ? "on" : ""} onClick={() => setView("lista")}>Lista</button>
          <button onClick={() => navigate("/dashboard/crm/activities")}>Actividades</button>
          <button onClick={() => navigate("/dashboard/tasks/calendar")}>Calendario</button>
        </div>
        <div className="dealcounters">
          <span><b>0</b> Entrante</span>
          <span><b>0</b> Planeado</span>
          <span><b>{totalDeals}</b> Más ▾</span>
        </div>
        <div className="dealactions">
          <button>↻ Ventas recurrentes</button>
          <button onClick={() => navigate("/dashboard/crm/automation")}>⚙ Reglas de automatización</button>
          <button>Extensiones ▾</button>
        </div>
      </div>

      {view === "lista" ? (
        <ListView deals={deals} pipeline={pipeline} board={board} q={q} navigate={navigate} />
      ) : (
       <>
      {/* Tablero */}
      <div className="board deals">
        {stages.map((s, i) => {
          const color = palette[i % palette.length];
          if (s.group && s.sub) {
            const inGroup = s.sub.reduce((acc, ss) => acc.concat(dealsIn(ss.id)), []);
            const gtotal = inGroup.reduce((a, d) => a + (Number(d.amount) || 0), 0);
            return (
              <div className="col-group" key={s.id}>
                <div className="group-head" style={{ background: color }}>
                  <span className="colmove">
                    <button onClick={() => moveStageDb(pipeline, board, s.id, -1)}>◀</button>
                    <button onClick={() => moveStageDb(pipeline, board, s.id, 1)}>▶</button>
                  </span>
                  <span className="colhead-name" onClick={() => renameStage(s.id, s.name)}>
                    {s.name} <span className="colhead-pen">✎</span>
                  </span>
                  <span className="dcnt">{inGroup.length}</span>
                  <span className="group-tot">{money(gtotal)}</span>
                </div>
                <div className="group-cols">
                  {s.sub.map((ss) => renderColumn(ss, color, true))}
                </div>
              </div>
            );
          }
          return renderColumn(s, color);
        })}
        <div className="col addstage-col" onClick={addStage} title="Añadir etapa">
          <div className="addstage-inner">
            <span className="addstage-plus">+</span>
            <span>Añadir etapa</span>
          </div>
        </div>
      </div>
      </>
      )}

      {newDeal && (
        <NewDealModal
          stages={flattenStages(stages)}
          preStage={newDeal.stage}
          contacts={contacts}
          onClose={() => setNewDeal(null)}
          onSave={saveNewDeal}
        />
      )}

      {moveDeal && (
        <MoveBoardModal
          deal={moveDeal}
          pipeline={pipeline}
          toBoard={isNeg ? "pos" : "neg"}
          onClose={() => setMoveDeal(null)}
          onConfirm={doMoveBoard}
        />
      )}
    </div>
  );
}

/* ---------- vista Lista de negociaciones ---------- */
function ListView({ deals, pipeline, board, q, navigate }) {
  const rows = deals
    .filter((d) => d.pipelineId === pipeline.id && (d.board || "pos") === board && (!q || [d.title, d.contact, d.company].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))))
    .sort((a, b) => (b.amount || 0) - (a.amount || 0));
  const stageName = (sid) => findStage(getStages(pipeline, board), sid)?.name || "—";
  const total = rows.reduce((a, d) => a + (Number(d.amount) || 0), 0);
  return (
    <div className="crm" style={{ padding: 0 }}>
      <table className="crm-table">
        <thead><tr><th>Negociación</th><th>Etapa</th><th>Contacto</th><th>Empresa</th><th>Cliente</th><th>Importe</th></tr></thead>
        <tbody>
          {rows.length ? rows.map((d) => {
            const bt = budgetTier(d.amount);
            const tier = CLIENT_TIERS[d.clientType] || CLIENT_TIERS.nuevo;
            return (
              <tr key={d.id}>
                <td><span className="crm-link" onClick={() => navigate(`/dashboard/crm/deals/${d.id}`)}>{d.clientType === "vip" ? "⭐ " : ""}{d.title}</span></td>
                <td><span className="crm-chip" style={{ borderLeft: `3px solid ${bt.color}` }}>{stageName(d.stage)}</span></td>
                <td>{d.contact || "—"}</td>
                <td>{d.company || "—"}</td>
                <td>{tier.icon} {tier.label}</td>
                <td style={{ color: bt.color, fontWeight: 700 }}>{money(d.amount)}</td>
              </tr>
            );
          }) : <tr><td colSpan="6" className="crm-empty">Sin negociaciones en esta vista.</td></tr>}
        </tbody>
        {rows.length > 0 && <tfoot><tr><td colSpan="5" style={{ textAlign: "right", fontWeight: 700 }}>TOTAL</td><td style={{ fontWeight: 700 }}>{money(total)}</td></tr></tfoot>}
      </table>
    </div>
  );
}

/* ---------- alta rápida inline ---------- */
function QuickAdd({ stageId, onSave, onClose }) {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const submit = async () => {
    await onSave(stageId, title, amount);
    setTitle("");
    setAmount("");
  };
  return (
    <div className="quick-add">
      <input
        className="qa-in"
        autoFocus
        placeholder="Nombre de la negociación"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") onClose();
        }}
      />
      <input
        className="qa-in qa-amt"
        type="number"
        placeholder="Importe €"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <div className="qa-row">
        <button className="qa-save" onClick={submit}>Añadir</button>
        <button className="qa-cancel" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  );
}

/* ---------- modal nueva negociación ---------- */
function NewDealModal({ stages, preStage, contacts, onClose, onSave }) {
  const [form, setForm] = useState({
    title: "",
    amount: 0,
    stage: preStage || stages[0]?.id,
    contact: "",
    company: "",
    clientType: "nuevo",
    priceType: "producto",
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };
  return (
    <CrmModal
      title="Nueva negociación"
      onClose={onClose}
      footer={
        <>
          <button className="crm-btn ghost" onClick={onClose}>Cancelar</button>
          <button className="crm-btn" onClick={save} disabled={saving}>{saving ? "Guardando…" : "Crear negociación"}</button>
        </>
      }
    >
      <div className="crm-field"><label>Título</label><input value={form.title} onChange={set("title")} autoFocus placeholder="Ej. Contrato anual SEO" /></div>
      <div className="crm-two">
        <div className="crm-field"><label>Importe (€)</label><input type="number" value={form.amount} onChange={set("amount")} /></div>
        <div className="crm-field"><label>Etapa</label>
          <select value={form.stage} onChange={set("stage")}>
            {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>
      <div className="crm-field"><label>Contacto</label>
        <input value={form.contact} onChange={set("contact")} list="crm-dl-contacts" />
        <datalist id="crm-dl-contacts">
          {contacts.map((c) => <option key={c.id} value={`${c.firstName || ""} ${c.lastName || ""}`.trim()} />)}
        </datalist>
      </div>
      <div className="crm-field"><label>Empresa</label><input value={form.company} onChange={set("company")} /></div>
      <div className="crm-two">
        <div className="crm-field"><label>Tipología</label>
          <select value={form.clientType} onChange={set("clientType")}>
            {Object.entries(CLIENT_TIERS).map(([k, t]) => <option key={k} value={k}>{t.icon} {t.label}</option>)}
          </select>
        </div>
        <div className="crm-field"><label>Tipo de precio</label>
          <select value={form.priceType} onChange={set("priceType")}>
            <option value="producto">Precio de producto</option>
            <option value="estimado">Precio estimado</option>
          </select>
        </div>
      </div>
    </CrmModal>
  );
}

/* ---------- modal enviar a otro tablero (elige columna) ---------- */
function MoveBoardModal({ deal, pipeline, toBoard, onClose, onConfirm }) {
  const stages = getStages(pipeline, toBoard);
  const [stage, setStage] = useState(flattenStages(stages)[0]?.id);
  return (
    <CrmModal
      title={toBoard === "neg" ? "Enviar al Kanban Negativo" : "Devolver al Kanban positivo"}
      onClose={onClose}
      footer={
        <>
          <button className="crm-btn ghost" onClick={onClose}>Cancelar</button>
          <button className={`crm-btn ${toBoard === "neg" ? "danger" : ""}`} onClick={() => onConfirm(deal, toBoard, stage)}>
            {toBoard === "neg" ? "Enviar a negativo" : "Devolver a positivo"}
          </button>
        </>
      }
    >
      <p style={{ margin: 0 }}>Negociación: <b>{deal.title}</b></p>
      <div className="crm-field">
        <label>¿A qué columna quieres que caiga?</label>
        <select value={stage} onChange={(e) => setStage(e.target.value)}>
          {stages.map((s) =>
            s.group && s.sub ? (
              <optgroup key={s.id} label={s.name}>
                {s.sub.map((ss) => <option key={ss.id} value={ss.id}>{s.name} · {ss.name}</option>)}
              </optgroup>
            ) : (
              <option key={s.id} value={s.id}>{s.name}</option>
            )
          )}
        </select>
      </div>
    </CrmModal>
  );
}
