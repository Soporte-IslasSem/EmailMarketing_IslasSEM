// Añadir suscriptores a la lista desde el CRM: contactos o empresas ya existentes,
// agrupados por tipo de cliente y con filtros (tipo, relación, responsable, búsqueda).
// Devuelve los emails elegidos con onDataParsed (luego pasan por la vista previa normal).
import { useEffect, useMemo, useState } from "react";
import { useCrmCollection } from "../../../crm/lib/crm";
import { useClientTypes, typeOf, RELATIONS } from "../../../crm/lib/clientTypes";
import { usePerms } from "../../../crm/lib/permissions";
import { useTaskScope } from "../../../crm/lib/tasks";
import { ownerKey } from "../../../crm/lib/owners";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const nameOf = (x, kind) => (kind === "companies" ? x.name : `${x.firstName || ""} ${x.lastName || ""}`.trim()) || "(sin nombre)";

export default function CrmPicker({ onDataParsed }) {
  const [kind, setKind] = useState("contacts");
  const { items: contacts } = useCrmCollection("contacts");
  const { items: companies } = useCrmCollection("companies");
  const { types } = useClientTypes();
  const perms = usePerms();
  const scope = useTaskScope();
  const [type, setType] = useState("");
  const [relation, setRelation] = useState("");
  const [owner, setOwner] = useState("");
  const [term, setTerm] = useState("");
  const [sel, setSel] = useState(() => new Set());

  const all = useMemo(() => perms.visible(kind, kind === "contacts" ? contacts : companies), [perms, kind, contacts, companies]);
  const withEmail = useMemo(() => all.filter((x) => EMAIL_RE.test(String(x.email || "").trim())), [all]);
  const counts = useMemo(() => {
    const c = {};
    withEmail.forEach((x) => { const k = x.clientType || "__none"; c[k] = (c[k] || 0) + 1; });
    return c;
  }, [withEmail]);

  const rows = useMemo(() => {
    const t = term.trim().toLowerCase();
    const rank = Object.fromEntries(types.map((x, i) => [x.id, i]));
    return withEmail
      .filter((x) => !type || (type === "__none" ? !x.clientType : x.clientType === type))
      .filter((x) => kind !== "contacts" || !relation || (x.relation || "") === relation)
      .filter((x) => !owner || (owner === "__none" ? !ownerKey(x) && !x.responsable : ownerKey(x) === owner))
      .filter((x) => !t || [nameOf(x, kind), x.email, x.company].filter(Boolean).some((v) => String(v).toLowerCase().includes(t)))
      .sort((a, b) => (rank[a.clientType] ?? 999) - (rank[b.clientType] ?? 999) || nameOf(a, kind).localeCompare(nameOf(b, kind)));
  }, [withEmail, type, relation, owner, term, types, kind]);

  // Los emails elegidos se pasan al importador cada vez que cambia la selección.
  useEffect(() => {
    onDataParsed([...sel].map((id) => all.find((x) => x.id === id)?.email).filter(Boolean).map((e) => String(e).trim().toLowerCase()));
  }, [sel, all]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchKind = (k) => { setKind(k); setSel(new Set()); setType(""); setRelation(""); setOwner(""); };
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allShown = rows.length > 0 && rows.every((x) => sel.has(x.id));
  const toggleShown = () => setSel((s) => { const n = new Set(s); rows.forEach((x) => (allShown ? n.delete(x.id) : n.add(x.id))); return n; });

  const box = { border: "1px solid #dfe7e7", borderRadius: 8, padding: "7px 10px", fontSize: 13.5, background: "#fff" };
  const chip = (on) => ({ ...box, padding: "5px 10px", cursor: "pointer", background: on ? "#1a9190" : "#fff", color: on ? "#fff" : "#264544", fontWeight: 600, fontSize: 12.5 });
  let lastGroup = null;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" style={chip(kind === "contacts")} onClick={() => switchKind("contacts")}>Contactos</button>
        <button type="button" style={chip(kind === "companies")} onClick={() => switchKind("companies")}>Empresas</button>
        <span style={{ fontSize: 12.5, color: "#6b7d7d", alignSelf: "center" }}>
          {withEmail.length} con email{all.length > withEmail.length ? ` · ${all.length - withEmail.length} sin email (no se pueden añadir)` : ""}
        </span>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button type="button" style={chip(!type)} onClick={() => setType("")}>Todos ({withEmail.length})</button>
        {types.map((t) => (
          <button type="button" key={t.id} style={chip(type === t.id)} onClick={() => setType(t.id)}>{t.icon} {t.label} ({counts[t.id] || 0})</button>
        ))}
        <button type="button" style={chip(type === "__none")} onClick={() => setType("__none")}>Sin tipo ({counts.__none || 0})</button>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input style={{ ...box, flex: 1, minWidth: 200 }} placeholder="Buscar por nombre, email o empresa…" value={term} onChange={(e) => setTerm(e.target.value)} />
        {kind === "contacts" && (
          <select style={box} value={relation} onChange={(e) => setRelation(e.target.value)}>
            <option value="">Todas las relaciones</option>
            {RELATIONS.map((r) => <option key={r.id} value={r.id}>{r.icon} {r.label}</option>)}
          </select>
        )}
        <select style={box} value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">Todos los responsables</option>
          <option value="__none">— Sin responsable —</option>
          {scope.options.map((o) => <option key={o.key} value={o.key}>{o.type === "team" ? "👥 " : ""}{o.name}</option>)}
        </select>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={allShown} onChange={toggleShown} /> Seleccionar los {rows.length} mostrados
        </label>
        <b style={{ marginLeft: "auto" }}>{sel.size} seleccionados</b>
        {sel.size > 0 && <button type="button" style={{ ...box, padding: "4px 8px", cursor: "pointer" }} onClick={() => setSel(new Set())}>Quitar selección</button>}
      </div>

      <div style={{ maxHeight: 360, overflowY: "auto", border: "1px solid #e3eaea", borderRadius: 8, background: "#fff" }}>
        {rows.length ? rows.map((x) => {
          const g = x.clientType || "__none";
          const head = g !== lastGroup ? (lastGroup = g, (
            <div style={{ position: "sticky", top: 0, background: "#eef6f5", padding: "5px 10px", fontSize: 12, fontWeight: 700, color: "#136b68" }}>
              {g === "__none" ? "Sin tipo" : typeOf(types, g)?.label}
            </div>
          )) : null;
          return (
            <div key={x.id}>
              {head}
              <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderTop: "1px solid #f1f5f5", cursor: "pointer", fontSize: 13.5 }}>
                <input type="checkbox" checked={sel.has(x.id)} onChange={() => toggle(x.id)} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b>{nameOf(x, kind)}</b>
                  <span style={{ color: "#6b7d7d" }}> · {x.email}{kind === "contacts" && x.company ? ` · ${x.company}` : ""}</span>
                </span>
              </label>
            </div>
          );
        }) : <p style={{ padding: 14, margin: 0, color: "#6b7d7d", fontSize: 13.5 }}>Nadie con estos filtros.</p>}
      </div>
      <p style={{ margin: 0, fontSize: 12.5, color: "#6b7d7d" }}>Elige a quién añadir y pulsa <b>Añadir</b> arriba: verás la vista previa (los que ya están en la lista se omiten).</p>
    </div>
  );
}
