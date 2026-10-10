import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import CrmModal from "../components/CrmModal";
import AssignImportedDeals from "../components/AssignImportedDeals";
import PipelineSettingsModal from "../components/PipelineSettingsModal";
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
  moveStage as moveStageDb,
  createPipeline,
} from "../lib/pipelines";
import TaskModal from "../components/TaskModal";
import DealEditModal from "../components/DealEditModal";
import { CustomFieldsForm } from "../components/CustomFields";
import { CreateFieldModal, ExtraFieldsEditor } from "../components/DealFields";
import { useTaskScope, useGoogleStatus } from "../lib/tasks";
import { usePerms } from "../lib/permissions";
import { exportCsv } from "../lib/exportCsv";
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
  const { items: allDeals, orgId } = useCrmCollection("deals");
  const perms = usePerms();
  // "Propios": solo las negociaciones que lleva, creó o tiene asignadas.
  const deals = useMemo(() => perms.visible("deals", allDeals), [perms, allDeals]);
  const canAdd = perms.can("deals", "add");
  const isAdmin = perms.isAdmin; // embudos y etapas: solo administradores
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activityFor, setActivityFor] = useState(null); // { deal, type }
  const [editing, setEditing] = useState(null); // negociación en edición (✎)
  const scope = useTaskScope();
  const [google] = useGoogleStatus();
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

  // Alta completa (formulario con todos los campos) cayendo en esa etapa.
  const openNewDeal = (stageId) => {
    const qs = new URLSearchParams({ pipeline: pipeline.id, board, ...(stageId ? { stage: stageId } : {}) });
    navigate(`/dashboard/crm/newdeal?${qs}`);
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

  const quickSave = async (stageId, q) => {
    if (!q.title.trim()) return false;
    const match = contacts.find((c) => `${c.firstName || ""} ${c.lastName || ""}`.trim().toLowerCase() === q.contact.trim().toLowerCase());
    await crmCreate("deals", orgId, {
      pipelineId: pipeline.id,
      board,
      stage: stageId,
      title: q.title.trim(),
      amount: Number(q.amount) || 0,
      contact: q.contact.trim(),
      contactId: match?.id || null,
      contactEmail: match?.email || "",
      company: q.company.trim(),
      clientType: "nuevo",
      priceType: "producto",
      source: "Manual",
      custom: q.custom || {},
      extraFields: q.extraFields || [],
    });
    return true;
  };

  const onDrop = async (stageId) => {
    setOverCol(null);
    const id = dragId.current;
    dragId.current = null;
    if (!id) return;
    const d = deals.find((x) => x.id === id);
    if (!d || d.stage === stageId) return;
    if (!perms.can("deals", "edit", d)) return alert("Tu rol no permite mover esta negociación.");
    await crmUpdate("deals", id, { stage: stageId });
    // Bitrix: al entrar en una etapa se ejecutan sus reglas (las ejecuta el servidor).
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
      {isAdmin && (
        <span className="colmove">
          <button onClick={() => moveStageDb(pipeline, board, s.id, -1)} title="Mover a la izquierda">◀</button>
          <button onClick={() => moveStageDb(pipeline, board, s.id, 1)} title="Mover a la derecha">▶</button>
        </span>
      )}
      <span className="colhead-name" onClick={() => isAdmin && renameStage(s.id, s.name)} title={isAdmin ? "Editar nombre" : s.name}>
        {s.name} {isAdmin && <span className="colhead-pen">✎</span>}
      </span>
      <span className="dcnt">{dealsIn(s.id).length}</span>
      {canAdd && (
        <button className="colhead-add" title="Nueva negociación en esta etapa" onClick={() => openNewDeal(s.id)}>
          +
        </button>
      )}
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
        {!canAdd ? null : quickCol === s.id ? (
          <QuickAdd stageId={s.id} orgId={orgId} contacts={contacts} onSave={quickSave} onClose={() => setQuickCol(null)} onFull={() => openNewDeal(s.id)} />
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
        draggable={perms.can("deals", "edit", d)}
        style={{ borderLeft: `3px solid ${bt.color}` }}
        onDragStart={() => (dragId.current = d.id)}
        onClick={() => navigate(`/dashboard/crm/deals/${d.id}`)}
        title={`Prioridad presupuesto: ${bt.label}`}
      >
        <div className="deal-badge">{d.itemsCount || (d.items ? d.items.length : 0)}</div>
        <div className="card-tools">
          {perms.can("deals", "edit", d) && <button
            className="ct-move"
            title={isNeg ? "Devolver al Kanban positivo" : "Enviar al Kanban Negativo"}
            onClick={(e) => {
              e.stopPropagation();
              setMoveDeal(d);
            }}
          >
            {isNeg ? "↩" : "➡"}
          </button>}
          {perms.can("deals", "edit", d) && <button title="Editar" onClick={(e) => { e.stopPropagation(); editDeal(d); }}>✎</button>}
          {perms.can("deals", "delete", d) && <button className="ct-del" title="Eliminar" onClick={(e) => { e.stopPropagation(); if (window.confirm(`¿Eliminar "${d.title}"?`)) crmRemove("deals", d.id); }}>🗑</button>}
        </div>
        <div className="deal-icons" onClick={(e) => e.stopPropagation()}>
          <span title="Programar llamada" style={{ cursor: "pointer" }} onClick={() => setActivityFor({ deal: d, type: "Llamada" })}>{DICON.phone}</span>
          <span title="Programar correo" style={{ cursor: "pointer" }} onClick={() => setActivityFor({ deal: d, type: "Email" })}>{DICON.mail}</span>
          <span title="Añadir comentario" style={{ cursor: "pointer" }} onClick={() => setActivityFor({ deal: d, type: "Nota" })}>{DICON.chat}</span>
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
          <span className="deal-act" style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); setActivityFor({ deal: d, type: "Tarea" }); }}>+ Actividad</span>
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

  const editDeal = (d) => setEditing(d);

  return (
    <div className="crmpipe">
      {unassigned.length > 0 && (
        <div style={{ background: "#fff7e6", border: "1px solid #f0d9a8", borderRadius: 10, padding: "10px 14px", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span>📥 <b>{unassigned.length}</b> negociaciones importadas de Bitrix aún no tienen embudo.</span>
          <button className="crm-btn sm" onClick={() => setAssignOpen(true)}>Asignar a embudos</button>
        </div>
      )}
      {settingsOpen && (
        <PipelineSettingsModal
          pipeline={pipeline} pipelines={pipelines} board={board} deals={allDeals} orgId={orgId}
          onClose={() => setSettingsOpen(false)}
          onSwitch={(id) => { setPipeId(id); setBoard("pos"); }}
        />
      )}
      {assignOpen && <AssignImportedDeals deals={unassigned} pipelines={pipelines} onClose={() => setAssignOpen(false)} />}
      {/* Barra de herramientas */}
      <div className="dealbar">
        <div className="dealbar-l">
          <h1>Negociaciones</h1>
          {canAdd && (
            <button className="crear-split" onClick={() => openNewDeal()}>
              + Crear <span className="cx">▾</span>
            </button>
          )}
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
        {isAdmin && <button className="iconbtn" title="Ajustes del embudo: etapas, nombre, crear o eliminar embudos" onClick={() => setSettingsOpen(true)}>⚙</button>}
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
            {isAdmin && <button className="new" onClick={addPipeline}>+ Crear embudo nuevo</button>}
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
          {perms.can("deals", "export") && (
            <button onClick={() => exportCsv(`negociaciones-${pipeline.name}`, deals.filter((d) => d.pipelineId === pipeline.id && (d.board || "pos") === board), [
              ["Negociación", (d) => d.title], ["Etapa", (d) => findStage(getStages(pipeline, board), d.stage)?.name || d.stage], ["Importe", (d) => d.amount],
              ["Contacto", (d) => d.contact], ["Empresa", (d) => d.company], ["Responsable", (d) => d.responsable], ["Origen", (d) => d.source],
              ["Productos", (d) => (d.items || []).map((i) => i.name)], ["Estado", (d) => d.status || "abierta"],
            ])}>⬇ Exportar</button>
          )}
          <button onClick={() => navigate("/dashboard/crm/automation")}>⚙ Reglas de automatización</button>
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
                  {isAdmin && (
                    <span className="colmove">
                      <button onClick={() => moveStageDb(pipeline, board, s.id, -1)}>◀</button>
                      <button onClick={() => moveStageDb(pipeline, board, s.id, 1)}>▶</button>
                    </span>
                  )}
                  <span className="colhead-name" onClick={() => isAdmin && renameStage(s.id, s.name)}>
                    {s.name} {isAdmin && <span className="colhead-pen">✎</span>}
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
        {isAdmin && (
          <div className="col addstage-col" onClick={addStage} title="Añadir etapa">
            <div className="addstage-inner">
              <span className="addstage-plus">+</span>
              <span>Añadir etapa</span>
            </div>
          </div>
        )}
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

      {editing && <DealEditModal deal={editing} orgId={orgId} onClose={() => setEditing(null)} />}

      {activityFor && (
        <TaskModal
          orgId={orgId}
          task={null}
          scope={scope}
          google={google}
          preset={{
            type: activityFor.type,
            title: `${activityFor.type === "Nota" ? "Comentario" : activityFor.type}: ${activityFor.deal.title}`,
            entity: "deal", entityId: activityFor.deal.id, contactId: activityFor.deal.contactId || "",
            link: `Negociación «${activityFor.deal.title}»`,
          }}
          onClose={() => setActivityFor(null)}
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

/* ---------- alta rápida inline (con más campos opcionales) ---------- */
const EMPTY_QUICK = { title: "", amount: "", contact: "", company: "", custom: {}, extraFields: [] };
function QuickAdd({ stageId, orgId, contacts, onSave, onClose, onFull }) {
  const [q, setQ] = useState(EMPTY_QUICK);
  const [more, setMore] = useState(false);
  const [newField, setNewField] = useState(false);
  const set = (k) => (e) => setQ((x) => ({ ...x, [k]: e.target.value }));
  const submit = async () => {
    if (await onSave(stageId, q)) setQ(EMPTY_QUICK); // queda abierto para seguir añadiendo
  };
  const keys = (e) => {
    if (e.target.closest(".crm-modal")) return; // teclas dentro del modal "Crear campo"
    if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") submit();
    if (e.key === "Escape") onClose();
  };
  return (
    <div className="quick-add" onKeyDown={keys}>
      <input className="qa-in" autoFocus placeholder="Nombre de la negociación" value={q.title} onChange={set("title")} />
      <input className="qa-in qa-amt" type="number" placeholder="Importe €" value={q.amount} onChange={set("amount")} />
      <input className="qa-in" placeholder="Contacto" value={q.contact} onChange={set("contact")} list={`qa-c-${stageId}`} />
      <datalist id={`qa-c-${stageId}`}>{contacts.map((c) => <option key={c.id} value={`${c.firstName || ""} ${c.lastName || ""}`.trim()} />)}</datalist>
      <input className="qa-in" placeholder="Empresa" value={q.company} onChange={set("company")} />
      {more && (
        <div style={{ fontSize: 12 }}>
          <CustomFieldsForm entity="deals" values={q.custom} onChange={(custom) => setQ((x) => ({ ...x, custom }))} />
          <ExtraFieldsEditor value={q.extraFields} onChange={(extraFields) => setQ((x) => ({ ...x, extraFields }))} />
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, margin: "2px 0 6px" }}>
        <span className="crm-link" onClick={() => setMore((m) => !m)}>{more ? "− Menos campos" : "+ Más campos"}</span>
        <span className="crm-link" onClick={() => { setMore(true); setNewField(true); }}>+ Crear campo</span>
      </div>
      <div className="qa-row">
        <button className="qa-save" onClick={submit}>Añadir</button>
        <button className="qa-cancel" onClick={onClose}>Cancelar</button>
      </div>
      <button className="qa-cancel" style={{ width: "100%", marginTop: 6 }} onClick={onFull}>Con todos los campos →</button>
      {newField && (
        <CreateFieldModal orgId={orgId} onClose={() => setNewField(false)} onAddExtra={(f) => setQ((x) => ({ ...x, extraFields: [...x.extraFields, f] }))} />
      )}
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
        <div className="crm-field"><label>Relación con el cliente</label>
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
