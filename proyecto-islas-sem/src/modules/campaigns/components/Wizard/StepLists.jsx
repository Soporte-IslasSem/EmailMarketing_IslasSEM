import "./StepLists.styles.css";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import WizardSteps from "./WizardSteps";
import { useAuth } from "../../../../shared/hooks/useAuth";
import { useCrmCollection } from "../../../crm/lib/crm";
import { useClientTypes, typeOf } from "../../../crm/lib/clientTypes";
import { finalRecipients } from "../../lib/campaignSend";

// Firestore
import { db } from "../../../../config/firebaseConfig";
import { doc, updateDoc, getDocs, getDoc, collection, query, where } from "firebase/firestore";

// Paso "Listas": elegir listas (las del CRM se actualizan solas) y, con los destinatarios
// resultantes a la vista, quitar o volver a poner personas concretas. Se guarda
// campaign.lists = { selectedLists, excludedEmails, totalSubscribers }.
export default function StepLists() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const campaignId = params.get("id");
  const type = params.get("type") || "newsletter";
  const { user } = useAuth();
  const { items: contacts } = useCrmCollection("contacts");
  const { items: companies } = useCrmCollection("companies");
  const { types } = useClientTypes();

  const [lists, setLists] = useState([]);
  const [selected, setSelected] = useState([]);
  const [excluded, setExcluded] = useState(() => new Set());
  const [subs, setSubs] = useState([]);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [term, setTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [saving, setSaving] = useState(false);

  // 1) Listas del usuario (las automáticas del CRM primero).
  useEffect(() => {
    if (!user) return;
    getDocs(query(collection(db, "lists"), where("userId", "==", user.uid)))
      .then((snap) => setLists(snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.crm ? 1 : 0) - (a.crm ? 1 : 0) || (a.crmKey === "all" ? -1 : b.crmKey === "all" ? 1 : String(a.name).localeCompare(String(b.name))))))
      .catch((err) => console.error("❌ Error cargando listas:", err));
  }, [user]);

  // 2) Selección previa del borrador.
  useEffect(() => {
    if (!campaignId) return;
    getDoc(doc(db, "campaigns", campaignId)).then((snap) => {
      const l = snap.exists() ? snap.data().lists : null;
      if (l?.selectedLists) setSelected(l.selectedLists);
      if (l?.excludedEmails) setExcluded(new Set(l.excludedEmails));
    });
  }, [campaignId]);

  // 3) Suscriptores de las listas elegidas (de 30 en 30: límite de Firestore para "in").
  useEffect(() => {
    if (!user || !selected.length) return undefined;
    let alive = true;
    const t = setTimeout(async () => {
      setLoadingSubs(true);
      try {
        const out = [];
        for (let i = 0; i < selected.length; i += 30) {
          const snap = await getDocs(query(collection(db, "subscribers"), where("listId", "in", selected.slice(i, i + 30)), where("userId", "==", user.uid)));
          snap.docs.forEach((d) => out.push({ id: d.id, ...d.data() }));
        }
        if (alive) setSubs(out);
      } finally {
        if (alive) setLoadingSubs(false);
      }
    }, 0);
    return () => { alive = false; clearTimeout(t); };
  }, [user, selected]);

  // Personas únicas (por email) que pueden recibir, con su tipo de cliente si vienen del CRM.
  const people = useMemo(() => {
    if (!selected.length) return [];
    const byContact = new Map(contacts.map((c) => [c.id, c]));
    const byCompany = new Map(companies.map((c) => [c.id, c]));
    const byEmail = new Map(contacts.filter((c) => c.email).map((c) => [String(c.email).toLowerCase(), c]));
    return finalRecipients(subs.filter((s) => selected.includes(s.listId)), {}).map((s) => {
      const email = String(s.email).toLowerCase();
      const c = byContact.get(s.contactId) || byEmail.get(email);
      const co = byCompany.get(s.companyId);
      const clientType = c?.clientType || co?.clientType || "";
      const name = s.name || (c ? `${c.firstName || ""} ${c.lastName || ""}`.trim() : co?.name) || "";
      return { email, name, clientType, company: c?.company || (co ? co.name : "") };
    });
  }, [subs, selected, contacts, companies]);

  const counts = useMemo(() => {
    const m = {};
    people.forEach((p) => { const k = p.clientType || "__none"; m[k] = (m[k] || 0) + 1; });
    return m;
  }, [people]);

  const shown = useMemo(() => {
    const t = term.trim().toLowerCase();
    const rank = Object.fromEntries(types.map((x, i) => [x.id, i]));
    return people
      .filter((p) => !typeFilter || (typeFilter === "__none" ? !p.clientType : p.clientType === typeFilter))
      .filter((p) => !t || [p.name, p.email, p.company].some((v) => String(v || "").toLowerCase().includes(t)))
      .sort((a, b) => (rank[a.clientType] ?? 999) - (rank[b.clientType] ?? 999) || (a.name || a.email).localeCompare(b.name || b.email));
  }, [people, term, typeFilter, types]);

  const finalCount = people.filter((p) => !excluded.has(p.email)).length;
  const toggleList = (id) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const togglePerson = (email) => setExcluded((s) => { const n = new Set(s); n.has(email) ? n.delete(email) : n.add(email); return n; });
  const setShown = (include) => setExcluded((s) => { const n = new Set(s); shown.forEach((p) => (include ? n.delete(p.email) : n.add(p.email))); return n; });

  const handleNext = async () => {
    if (!selected.length) return alert("Selecciona al menos una lista para continuar.");
    if (!finalCount) return alert("No queda ningún destinatario: vuelve a marcar a alguien.");
    setSaving(true);
    try {
      // Solo se guardan las exclusiones de personas que están en las listas elegidas.
      const inLists = new Set(people.map((p) => p.email));
      await updateDoc(doc(db, "campaigns", campaignId), {
        lists: { selectedLists: selected, excludedEmails: [...excluded].filter((e) => inLists.has(e)), totalSubscribers: finalCount },
        step: 2,
        updatedAt: new Date(),
      });
      navigate(`/dashboard/campaigns/create/templates?id=${campaignId}&type=${type}`);
    } finally {
      setSaving(false);
    }
  };

  const chip = (on) => ({ border: "1px solid #dfe7e7", borderRadius: 16, padding: "5px 11px", cursor: "pointer", fontSize: 12.5, fontWeight: 600, background: on ? "#1a9190" : "#fff", color: on ? "#fff" : "#264544" });
  let lastGroup = null;

  return (
    <div className="StepLists">
      <WizardSteps />

      <h1 className="StepLists__title">Selecciona a quién se envía</h1>
      <p className="StepLists__subtitle">
        Elige una o varias listas (las <b>CRM · …</b> se actualizan solas con tus contactos y empresas) y, abajo, quita o
        vuelve a poner a quien quieras. Nadie recibe la campaña dos veces aunque esté en varias listas.
      </p>

      <div className="StepLists__listContainer">
        {lists.length === 0 && <p className="StepLists__empty">No tienes listas creadas todavía.</p>}
        {lists.map((list) => (
          <div key={list.id} className={`StepLists__item ${selected.includes(list.id) ? "selected" : ""}`} onClick={() => toggleList(list.id)}>
            <h3>{list.name}{list.crm && <span style={{ marginLeft: 6, fontSize: 10.5, color: "#136b68", background: "#e6f4f1", borderRadius: 8, padding: "1px 6px", verticalAlign: 2 }}>CRM</span>}</h3>
            <p>{list.subscribersCount || 0} suscriptores</p>
          </div>
        ))}
      </div>

      {selected.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #e3eaea", borderRadius: 12, padding: 16, marginTop: 18, display: "grid", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>Destinatarios</h3>
            <span style={{ fontSize: 13.5 }}>
              {loadingSubs ? "Cargando…" : <><b>{finalCount}</b> de {people.length} recibirán la campaña</>}
            </span>
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" style={chip(!typeFilter)} onClick={() => setTypeFilter("")}>Todos ({people.length})</button>
            {types.filter((t) => counts[t.id]).map((t) => (
              <button type="button" key={t.id} style={chip(typeFilter === t.id)} onClick={() => setTypeFilter(t.id)}>{t.icon} {t.label} ({counts[t.id]})</button>
            ))}
            {counts.__none > 0 && <button type="button" style={chip(typeFilter === "__none")} onClick={() => setTypeFilter("__none")}>Sin tipo ({counts.__none})</button>}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input placeholder="Buscar por nombre, email o empresa…" value={term} onChange={(e) => setTerm(e.target.value)}
              style={{ flex: 1, minWidth: 220, border: "1px solid #dfe7e7", borderRadius: 8, padding: "8px 10px", fontSize: 13.5 }} />
            <button type="button" className="secondary" onClick={() => setShown(true)}>Marcar los {shown.length} mostrados</button>
            <button type="button" className="secondary" onClick={() => setShown(false)}>Quitar los {shown.length} mostrados</button>
          </div>

          <div style={{ maxHeight: 380, overflowY: "auto", border: "1px solid #eef3f3", borderRadius: 8 }}>
            {shown.length ? shown.map((p) => {
              const g = p.clientType || "__none";
              const head = g !== lastGroup ? (
                <div style={{ position: "sticky", top: 0, background: "#eef6f5", padding: "5px 10px", fontSize: 12, fontWeight: 700, color: "#136b68" }}>
                  {g === "__none" ? "Sin tipo" : typeOf(types, g)?.label}
                </div>
              ) : null;
              lastGroup = g;
              return (
                <div key={p.email}>
                  {head}
                  <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderTop: "1px solid #f4f7f7", cursor: "pointer", fontSize: 13.5, opacity: excluded.has(p.email) ? 0.5 : 1 }}>
                    <input type="checkbox" checked={!excluded.has(p.email)} onChange={() => togglePerson(p.email)} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <b>{p.name || p.email}</b>
                      <span style={{ color: "#6b7d7d" }}>{p.name ? ` · ${p.email}` : ""}{p.company ? ` · ${p.company}` : ""}</span>
                    </span>
                  </label>
                </div>
              );
            }) : <p style={{ padding: 14, margin: 0, color: "#6b7d7d", fontSize: 13.5 }}>{loadingSubs ? "Cargando destinatarios…" : "Nadie con estos filtros."}</p>}
          </div>
        </div>
      )}

      <div className="StepLists__buttons">
        <button className="secondary" onClick={() => navigate(-1)}>Atrás</button>
        <button className="primary" onClick={handleNext} disabled={!selected.length || saving || loadingSubs}>{saving ? "Guardando…" : `Siguiente (${finalCount})`}</button>
      </div>
    </div>
  );
}
