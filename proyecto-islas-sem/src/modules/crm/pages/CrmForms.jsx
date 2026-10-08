import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useCrmCollection, crmRemove } from "../lib/crm";
import { BUILTIN_FORMS, BUILTIN_LIST } from "../../forms/public/builtinForms";
import { TEMPLATES, draftFromTemplate } from "../lib/formBuilder";
import FormThumb from "../components/FormThumb";
import ShareFormModal from "../components/ShareFormModal";
import "../crm.styles.css";
import "./crmforms.styles.css";

// Formularios del CRM (como el prototipo): plantillas para empezar, tus formularios
// (SEPA y Datos Jurídicos incluidos, editables) y la página pública de clientela.
export default function CrmForms() {
  const navigate = useNavigate();
  // Mismo módulo en CRM › Formularios y en Email Marketing › Formularios.
  const base = useLocation().pathname.startsWith("/dashboard/forms") ? "/dashboard/forms" : "/dashboard/crm/forms";
  const { items: subs } = useCrmCollection("formSubmissions");
  const { items: saved } = useCrmCollection("crmForms");
  const [share, setShare] = useState(null); // { id, name }

  const counts = useMemo(() => {
    const c = {};
    subs.forEach((s) => { c[s.formType] = (c[s.formType] || 0) + 1; });
    return c;
  }, [subs]);

  // Fijos primero (con su versión editada si existe) y luego los creados, más nuevos antes.
  const rows = useMemo(() => {
    const byId = Object.fromEntries(saved.map((f) => [f.id, f]));
    const fixed = BUILTIN_LIST.map((b) => {
      const o = byId[b.type];
      return {
        id: b.type, builtin: true, name: b.name, edited: !!o,
        fields: o ? (o.fields || []).filter((f) => f.type !== "check").length : BUILTIN_FORMS[b.type].fields.length,
        list: o?.listName || "", active: o ? o.active !== false : true,
      };
    });
    const created = saved
      .filter((f) => !BUILTIN_FORMS[f.id])
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      .map((f) => ({ id: f.id, name: f.name || f.title, fields: (f.fields || []).filter((x) => x.type !== "check").length, list: f.listName || "", active: f.active !== false }));
    return [...fixed, ...created];
  }, [saved]);

  const remove = async (r) => {
    if (!window.confirm(`¿Eliminar el formulario "${r.name}"? El enlace dejará de funcionar. Las respuestas recibidas se conservan y puedes restaurarlo desde la Papelera.`)) return;
    await crmRemove("crmForms", r.id);
  };

  return (
    <div className="crm">
      <div className="crm__top">
        <div>
          <h1>Formularios</h1>
          <p>Crea formularios editables. Cada envío entra directo en tu CRM.</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a className="crm-btn ghost" href="/clientela" target="_blank" rel="noreferrer">🏢 Página de clientela</a>
          <button className="crm-btn" onClick={() => navigate(`${base}/new`)}>+ Crear formulario</button>
        </div>
      </div>

      <h4 className="cf-h4">Empieza con una plantilla</h4>
      <div className="cf-gallery">
        {TEMPLATES.map(([t, d]) => (
          <button key={t} className="cf-tpl" onClick={() => navigate(`${base}/new?tpl=${encodeURIComponent(t)}`)}>
            <FormThumb form={draftFromTemplate(t)} />
            <div className="meta"><h4>{t}</h4><p>{d}</p></div>
          </button>
        ))}
      </div>

      <h4 className="cf-h4" style={{ marginTop: 28 }}>Tus formularios</h4>
      <table className="crm-table">
        <thead>
          <tr><th>Formulario</th><th>Campos</th><th>Envíos</th><th>Lista destino</th><th>Estado</th><th></th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td style={{ fontWeight: 600 }}>
                {r.name}
                {r.builtin && <span className="cf-ready">Listo</span>}
                {r.edited && <span style={{ fontSize: 11.5, color: "var(--crm-muted)", fontWeight: 400 }}> · editado</span>}
              </td>
              <td>{r.fields}</td>
              <td style={{ fontWeight: 700, fontVariant: "tabular-nums" }}>{counts[r.id] || 0}</td>
              <td>{r.list || "—"}</td>
              <td>{r.active ? <span className="crm-chip ok">Publicado</span> : <span className="crm-chip warn">Desactivado</span>}</td>
              <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                <button className="crm-btn sm" onClick={() => setShare(r)}>Mostrar</button>{" "}
                <button className="crm-btn ghost sm" onClick={() => navigate(`${base}/edit/${r.id}`)}>Editar</button>
                {!r.builtin && <> <button className="crm-btn ghost sm" title="Eliminar" onClick={() => remove(r)}>🗑</button></>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="crm-panel" style={{ marginTop: 16 }}>
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--crm-muted)" }}>
          💡 Para que un formulario se envíe <b>solo</b> cuando una negociación entra en una etapa, añade en
          <b> Automatización de ventas</b> una regla "Enviar formulario/documento" y elige el formulario. Las respuestas quedan
          en la <b>ficha del contacto y de la negociación</b> (o crean un prospecto si el email no existe).
        </p>
      </div>

      {share && <ShareFormModal formId={share.id} title={`Compartir · ${share.name}`} listName={share.list} onClose={() => setShare(null)} />}
    </div>
  );
}
