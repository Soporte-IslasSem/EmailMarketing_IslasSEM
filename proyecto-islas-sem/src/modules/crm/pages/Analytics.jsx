import { useMemo } from "react";
import { useCrmCollection, money } from "../lib/crm";
import { usePipelines, getStages, flattenStages, STAGE_COLORS } from "../lib/pipelines";
import "../crm.styles.css";

export default function Analytics() {
  const { items: deals } = useCrmCollection("deals");
  const { items: leads } = useCrmCollection("leads");
  const { items: contacts } = useCrmCollection("contacts");
  const { pipelines } = usePipelines();
  const pipeline = pipelines[0];

  const posDeals = useMemo(() => deals.filter((d) => (d.board || "pos") === "pos"), [deals]);

  const won = posDeals.filter((d) => d.status === "ganado");
  const lost = posDeals.filter((d) => d.status === "perdido");
  const open = posDeals.filter((d) => d.status !== "ganado" && d.status !== "perdido");

  // Motivos de pérdida (para el bloque de Analítica)
  const lostReasons = useMemo(() => {
    const m = {};
    lost.forEach((d) => { const r = d.lostReason || "Sin motivo"; m[r] = (m[r] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [lost]);
  const pipelineValue = open.reduce((a, d) => a + (Number(d.amount) || 0), 0);
  const wonValue = won.reduce((a, d) => a + (Number(d.amount) || 0), 0);
  const convRate = posDeals.length ? Math.round((won.length / posDeals.length) * 100) : 0;

  const kpis = [
    { n: leads.length, l: "Prospectos" },
    { n: contacts.length, l: "Contactos" },
    { n: open.length, l: "Negocios abiertos" },
    { n: won.length, l: "Ganados", color: "#1faa59" },
    { n: lost.length, l: "Perdidos", color: "#d94f70" },
    { n: money(pipelineValue), l: "Valor del pipeline" },
    { n: money(wonValue), l: "Importe ganado", color: "#1faa59" },
    { n: convRate + "%", l: "Conversión" },
  ];

  const stages = pipeline ? flattenStages(getStages(pipeline, "pos")) : [];
  const funnel = stages.map((s, i) => {
    const ds = posDeals.filter((d) => d.stage === s.id);
    return { name: s.name, n: ds.length, sum: ds.reduce((a, d) => a + (Number(d.amount) || 0), 0), color: STAGE_COLORS[i % STAGE_COLORS.length] };
  });
  const maxN = Math.max(1, ...funnel.map((f) => f.n));

  return (
    <div className="crm">
      <div className="crm__top">
        <div>
          <h1>Analítica de ventas</h1>
          <p>Cuadro de mando del CRM con datos en tiempo real.</p>
        </div>
      </div>

      <div className="crm-kpis">
        {kpis.map((k, i) => (
          <div className="crm-kpi" key={i}>
            <div className="n" style={k.color ? { color: k.color } : undefined}>{k.n}</div>
            <div className="l">{k.l}</div>
          </div>
        ))}
      </div>

      <div className="crm-panel">
        <h4 style={{ marginTop: 0 }}>Embudo — {pipeline?.name || "—"}</h4>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {funnel.map((f, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 150, fontSize: 13, fontWeight: 600, textAlign: "right", color: "var(--crm-muted)" }}>{f.name}</div>
              <div style={{ flex: 1, background: "#eef3f3", borderRadius: 8, height: 26, position: "relative", overflow: "hidden" }}>
                <div style={{ width: `${(f.n / maxN) * 100}%`, minWidth: f.n ? 28 : 0, height: "100%", background: f.color, borderRadius: 8, transition: ".3s" }} />
                <span style={{ position: "absolute", left: 10, top: 4, fontSize: 12.5, fontWeight: 700, color: "#2a3a3a" }}>{f.n}</span>
              </div>
              <div style={{ width: 110, textAlign: "right", fontSize: 13, fontWeight: 700, fontVariant: "tabular-nums" }}>{money(f.sum)}</div>
            </div>
          ))}
        </div>
      </div>

      {lost.length > 0 && (
        <div className="crm-panel">
          <h4 style={{ marginTop: 0 }}>Motivos de pérdida ({lost.length})</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {lostReasons.map(([reason, n], i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 200, fontSize: 13, fontWeight: 600, textAlign: "right", color: "var(--crm-muted)" }}>{reason}</div>
                <div style={{ flex: 1, background: "#fdeef1", borderRadius: 8, height: 24, position: "relative", overflow: "hidden" }}>
                  <div style={{ width: `${(n / lost.length) * 100}%`, minWidth: 26, height: "100%", background: "#d94f70", borderRadius: 8 }} />
                  <span style={{ position: "absolute", left: 10, top: 3, fontSize: 12.5, fontWeight: 700, color: "#7a1f33" }}>{n}</span>
                </div>
                <div style={{ width: 60, textAlign: "right", fontSize: 13, fontWeight: 700 }}>{Math.round((n / lost.length) * 100)}%</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
