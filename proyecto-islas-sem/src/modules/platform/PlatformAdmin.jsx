// Panel de la plataforma (solo administración de la plataforma, PLATFORM_ADMINS en el servidor):
// todas las empresas con su plan, estado, usuarios, contactos y WhatsApp; cambiar de plan,
// ampliar la prueba, suspender/reactivar, notas internas y entrar como soporte.
import { useEffect, useMemo, useState } from "react";
import { api } from "../../shared/api";
import "../crm/crm.styles.css";

const dateEs = (ms) => (ms ? new Date(ms).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const STATUS = { active: ["Activa", "#1f8a5b"], suspended: ["Suspendida", "#b0304c"] };

export default function PlatformAdmin() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const load = () => api("platform/orgs").then(setData).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const rows = useMemo(() => (data?.orgs || []).filter((o) => !q || `${o.name} ${o.id} ${o.ownerEmail}`.toLowerCase().includes(q.toLowerCase())), [data, q]);
  const totals = useMemo(() => {
    const o = data?.orgs || [];
    return { all: o.length, active: o.filter((x) => x.status !== "suspended").length, paying: o.filter((x) => x.billing?.status === "active").length, trial: o.filter((x) => x.plan === "trial").length };
  }, [data]);

  const act = async (o, body, label) => {
    setBusy(o.id + label); setMsg("");
    try { await api("platform/org", { orgId: o.id, ...body }); setMsg(`✓ ${o.name}: ${label}`); await load(); } catch (e) { setMsg("No se pudo: " + e.message); }
    setBusy("");
  };
  const support = async (o) => {
    if (!window.confirm(`Entrar como soporte en «${o.name}» durante 60 minutos? Quedará registrado.`)) return;
    try { await api("platform/support", { orgId: o.id, minutes: 60 }); try { localStorage.removeItem("islassem:accessOk"); } catch { /* sin almacenamiento */ } window.location.href = "/dashboard"; }
    catch (e) { setMsg("No se pudo: " + e.message); }
  };

  if (err) return <div className="crm"><p style={{ color: "#b0304c" }}>{err}</p></div>;
  return (
    <div className="crm">
      <div className="crm__top">
        <div><h1>Plataforma</h1><p>{totals.all} empresas · {totals.active} activas · {totals.paying} pagando · {totals.trial} en prueba</p></div>
      </div>
      <input className="crm-search" placeholder="Buscar empresa, id o email…" value={q} onChange={(e) => setQ(e.target.value)} />
      {msg && <p style={{ fontSize: 13, color: /^No/.test(msg) ? "#b0304c" : "var(--crm-teal-dark)" }}>{msg}</p>}
      {!data ? <p>Cargando…</p> : (
        <div style={{ overflowX: "auto" }}>
          <table className="crm-table">
            <thead><tr><th>Empresa</th><th>Plan</th><th>Estado</th><th>Usuarios</th><th>Contactos</th><th>WhatsApp</th><th>Alta</th><th>Acciones</th></tr></thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td><b>{o.name}</b><div style={{ fontSize: 12, color: "var(--crm-muted)" }}>{o.id} · {o.ownerEmail}</div>
                    <textarea defaultValue={o.notes} placeholder="Notas internas" rows={1} style={{ width: "100%", fontSize: 12, marginTop: 4 }} onBlur={(e) => e.target.value !== o.notes && act(o, { notes: e.target.value }, "notas guardadas")} /></td>
                  <td>
                    <select value={o.plan} onChange={(e) => act(o, { plan: e.target.value }, `plan ${e.target.value}`)} disabled={!!busy}>
                      {data.plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    {o.plan === "trial" && <div style={{ fontSize: 12 }}>hasta {dateEs(o.trialEndsAt)}</div>}
                    {o.billing && <div style={{ fontSize: 12, color: "var(--crm-muted)" }}>Stripe: {o.billing.status}</div>}
                  </td>
                  <td><span style={{ color: STATUS[o.status]?.[1] || "inherit", fontWeight: 700 }}>{STATUS[o.status]?.[0] || o.status}</span></td>
                  <td>{o.seats}{o.limits?.users ? ` / ${o.limits.users}` : ""}</td>
                  <td>{o.contacts ?? "—"}</td>
                  <td>{o.whatsapp ? "✅" : "—"}</td>
                  <td>{dateEs(o.createdAt)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {o.plan === "trial" && <button className="crm-btn ghost sm" onClick={() => act(o, { trialDays: 14 }, "+14 días de prueba")} disabled={!!busy}>+14 días</button>}{" "}
                    {o.status === "suspended"
                      ? <button className="crm-btn sm" onClick={() => act(o, { status: "active" }, "reactivada")} disabled={!!busy}>Reactivar</button>
                      : o.id !== "islas-sem" && <button className="crm-btn ghost sm" onClick={() => window.confirm(`¿Suspender «${o.name}»? Nadie de la empresa podrá entrar.`) && act(o, { status: "suspended" }, "suspendida")} disabled={!!busy}>Suspender</button>}{" "}
                    {o.status !== "suspended" && <button className="crm-btn ghost sm" onClick={() => support(o)}>Soporte</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
