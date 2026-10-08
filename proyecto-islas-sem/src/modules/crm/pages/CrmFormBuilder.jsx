// Constructor de formulario (CRM › Formularios › Crear / Editar), igual que el prototipo:
// izquierda "Añadir campo", centro el formulario en vivo (clic en un campo para editarlo),
// derecha los ajustes del formulario o del campo seleccionado. Vista previa y Publicar.
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { db } from "../../../config/firebaseConfig";
import CrmModal from "../components/CrmModal";
import { useCrmCollection, crmCreate, crmUpdate } from "../lib/crm";
import { useOrg } from "../lib/useOrg";
import { BUILTIN_FORMS, BUILTIN_LIST } from "../../forms/public/builtinForms";
import { FIELD_LIB, TYPES, libField, draftFromTemplate, draftFromBuiltin, draftFromDoc, toDoc } from "../lib/formBuilder";
import ShareFormModal from "../components/ShareFormModal";
import "../crm.styles.css";
import "./crmforms.styles.css";

export default function CrmFormBuilder() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, orgId } = useOrg();
  const { items: forms, loading } = useCrmCollection("crmForms");
  const isBuiltin = !!(id && BUILTIN_FORMS[id]);
  const saved = id ? forms.find((f) => f.id === id) : null;

  const [edited, setFb] = useState(null); // borrador con cambios del usuario
  const [sel, setSel] = useState(null); // índice del campo seleccionado
  const [lists, setLists] = useState([]);
  const [preview, setPreview] = useState(false);
  const [published, setPublished] = useState(null); // id publicado
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Borrador inicial: plantilla, formulario guardado o SEPA/Jurídicos (null = cargando,
  // false = no existe). Los cambios del usuario viven en "edited".
  const tpl = params.get("tpl") || "Desde cero";
  const initial = useMemo(() => {
    if (!id) return draftFromTemplate(tpl);
    if (loading) return null;
    if (saved) return draftFromDoc(saved);
    if (isBuiltin) return draftFromBuiltin(id);
    return false;
  }, [id, tpl, loading, saved, isBuiltin]);
  const fb = edited || initial;

  // Listas de Email Marketing del usuario (Lista destino).
  useEffect(() => {
    if (!user) return;
    getDocs(query(collection(db, "lists"), where("userId", "==", user.uid)))
      .then((s) => setLists(s.docs.map((d) => ({ id: d.id, name: d.data().name || "Lista" })).sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => setLists([]));
  }, [user]);

  const fields = useMemo(() => fb?.fields || [], [fb]);
  const edit = (fn) => setFb((x) => fn(x || initial));
  const setForm = (patch) => edit((x) => ({ ...x, ...patch }));
  const setField = (i, patch) => edit((x) => ({ ...x, fields: x.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) }));
  const addField = (key) => { edit((x) => ({ ...x, fields: [...x.fields, libField(key)] })); setSel(fields.length); };
  const delField = (i) => { edit((x) => ({ ...x, fields: x.fields.filter((_, j) => j !== i) })); setSel(null); };
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= fields.length) return;
    edit((x) => { const f = [...x.fields]; [f[i], f[j]] = [f[j], f[i]]; return { ...x, fields: f }; });
    setSel(j);
  };
  const changeType = (i, type) => setField(i, { type, ...(type === "select" && !fields[i].options ? { options: ["Opción 1", "Opción 2"] } : {}) });

  const publish = async () => {
    setError("");
    const meta = BUILTIN_LIST.find((b) => b.type === id);
    const { error: err, data } = toDoc({ ...fb, name: isBuiltin ? meta?.name : fb.title });
    if (err) return setError(err);
    setSaving(true);
    try {
      let formId = id;
      if (isBuiltin) {
        await setDoc(doc(db, "crmForms", id), { ...data, orgId, builtin: true, updatedAt: serverTimestamp(), ...(saved ? {} : { createdAt: serverTimestamp() }) }, { merge: true });
      } else if (saved) {
        await crmUpdate("crmForms", id, data);
      } else {
        formId = (await crmCreate("crmForms", orgId, data)).id;
      }
      setPublished(formId);
    } catch (e) {
      setError(e.code === "permission-denied"
        ? "Sin permiso para guardar formularios: falta publicar las reglas de la base de datos."
        : "No se pudo guardar: " + (e.message || e));
    } finally {
      setSaving(false);
    }
  };

  const restore = async () => {
    if (!window.confirm("¿Volver al formulario original? Se perderán los cambios que hiciste en él.")) return;
    await deleteDoc(doc(db, "crmForms", id));
    navigate("/dashboard/crm/forms");
  };

  if (fb === null) return <div className="crm"><div className="crm-loading">Cargando formulario…</div></div>;
  if (fb === false) {
    return (
      <div className="crm">
        <p className="crm-empty">Este formulario no existe o se eliminó.</p>
        <button className="crm-btn" onClick={() => navigate("/dashboard/crm/forms")}>← Volver a Formularios</button>
      </div>
    );
  }

  const f = sel !== null ? fields[sel] : null;

  return (
    <div className="crm">
      <div className="cf-top">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="crm-btn ghost sm" onClick={() => navigate("/dashboard/crm/forms")}>← Volver</button>
          <h1>Constructor de formulario</h1>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {isBuiltin && saved && <button className="crm-btn ghost" onClick={restore}>Restaurar original</button>}
          <button className="crm-btn ghost" onClick={() => setPreview(true)}>Vista previa</button>
          <button className="crm-btn cf-gold" onClick={publish} disabled={saving}>{saving ? "Publicando…" : "Publicar"}</button>
        </div>
      </div>
      <p className="cf-sub">
        Añade campos, y edítalo <b>todo</b>: título, encabezado, etiquetas, textos de ayuda, colores y botón. Haz clic en un campo del formulario para editarlo.
      </p>
      {error && <div className="cf-err" style={{ marginBottom: 14 }}>{error}</div>}

      <div className="cf-builder">
        <div>
          <div className="cf-palette__t">Añadir campo</div>
          {Object.keys(FIELD_LIB).map((k) => (
            <button key={k} className="cf-pitem" onClick={() => addField(k)}>＋ {FIELD_LIB[k].k}</button>
          ))}
        </div>

        <div className="cf-canvas" style={{ background: fb.bg, "--fc": fb.color }}>
          <div className="cf-formhead" onClick={() => setSel(null)}>
            <h3 style={{ color: fb.color }}>{fb.title || "Título del formulario"}</h3>
            {fb.desc && <p>{fb.desc}</p>}
          </div>
          {fields.length ? fields.map((x, i) => (
            <div key={i} className={`cf-ff ${sel === i ? "sel" : ""}`} onClick={() => setSel(i)}>
              <FieldControl f={x} />
              <div className="cf-mv" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => move(i, -1)} disabled={i === 0} title="Subir">↑</button>
                <button onClick={() => move(i, 1)} disabled={i === fields.length - 1} title="Bajar">↓</button>
              </div>
              <button className="del" title="Quitar campo" onClick={(e) => { e.stopPropagation(); delField(i); }}>×</button>
            </div>
          )) : <div className="cf-empty">← Añade campos desde la izquierda</div>}
          <button className="cf-formbtn" style={{ background: fb.color }} onClick={(e) => e.preventDefault()}>{fb.btn || "Enviar"}</button>
        </div>

        <div className="cf-panel">
          {f ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div className="cf-palette__t" style={{ margin: 0 }}>Editar campo</div>
                <button className="crm-btn ghost sm" onClick={() => setSel(null)}>Hecho</button>
              </div>
              <div className="crm-field"><label>Etiqueta</label><input value={f.k} onChange={(e) => setField(sel, { k: e.target.value })} /></div>
              {!["check", "select"].includes(f.type) && (
                <div className="crm-field"><label>Texto de ayuda (placeholder)</label><input value={f.ph || ""} onChange={(e) => setField(sel, { ph: e.target.value })} /></div>
              )}
              <div className="crm-field">
                <label>Tipo de campo</label>
                <select value={f.type} onChange={(e) => changeType(sel, e.target.value)}>
                  {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              {f.type === "select" && (
                <div className="crm-field">
                  <label>Opciones (una por línea)</label>
                  <textarea rows={4} value={(f.options || []).join("\n")} onChange={(e) => setField(sel, { options: e.target.value.split("\n") })} />
                </div>
              )}
              <label className="cf-switch"><input type="checkbox" checked={!!f.req} onChange={(e) => setField(sel, { req: e.target.checked })} /> Campo obligatorio</label>
              <button className="crm-btn danger" style={{ width: "100%", marginTop: 14 }} onClick={() => delField(sel)}>Quitar campo</button>
            </>
          ) : (
            <>
              <div className="cf-palette__t">Ajustes del formulario</div>
              <div className="crm-field"><label>Título</label><input value={fb.title} onChange={(e) => setForm({ title: e.target.value })} /></div>
              <div className="crm-field"><label>Encabezado / descripción</label><textarea rows={2} value={fb.desc} onChange={(e) => setForm({ desc: e.target.value })} /></div>
              <div className="crm-field"><label>Texto del botón</label><input value={fb.btn} onChange={(e) => setForm({ btn: e.target.value })} /></div>
              <div className="cf-two">
                <ColorField label="Color principal" value={fb.color} onChange={(v) => setForm({ color: v })} />
                <ColorField label="Color de fondo" value={fb.bg} onChange={(v) => setForm({ bg: v })} />
              </div>
              {fields.some((x) => x.type === "check") && (
                <div className="crm-field"><label>Título del consentimiento</label><input value={fb.consentTitle || ""} placeholder="Ej.: Aceptación del Tratamiento y la Protección de Datos" onChange={(e) => setForm({ consentTitle: e.target.value })} /></div>
              )}
              <div className="crm-field">
                <label>Lista destino (Email Marketing)</label>
                <select value={fb.listId || ""} onChange={(e) => setForm({ listId: e.target.value, listName: lists.find((l) => l.id === e.target.value)?.name || "" })}>
                  <option value="">— Ninguna —</option>
                  {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  {fb.listId && !lists.some((l) => l.id === fb.listId) && <option value={fb.listId}>{fb.listName || "Lista"}</option>}
                </select>
              </div>
              <div className="cf-note">
                Cada envío entra <b>solo</b> en el CRM: crea el <b>prospecto</b> (o se guarda en la ficha si el email ya existe)
                {fb.listId ? <> y suscribe el email a la lista <b>{fb.listName}</b>.</> : "."}
              </div>
              <label className="cf-switch"><input type="checkbox" checked={fb.active !== false} onChange={(e) => setForm({ active: e.target.checked })} /> Publicado (si lo desactivas, el enlace deja de funcionar)</label>
            </>
          )}
        </div>
      </div>

      {preview && (
        <CrmModal title="Vista previa" onClose={() => setPreview(false)} footer={<button className="crm-btn ghost" onClick={() => setPreview(false)}>Cerrar</button>}>
          <div className="cf-canvas" style={{ maxWidth: 440, margin: "0 auto", background: fb.bg, "--fc": fb.color }}>
            <div className="cf-formhead" style={{ cursor: "default" }}>
              <h3 style={{ color: fb.color }}>{fb.title}</h3>
              {fb.desc && <p>{fb.desc}</p>}
            </div>
            {fields.map((x, i) => <div key={i} className="cf-ff" style={{ cursor: "default" }}><FieldControl f={x} /></div>)}
            <button className="cf-formbtn" style={{ background: fb.color }}>{fb.btn}</button>
          </div>
        </CrmModal>
      )}

      {published && (
        <ShareFormModal
          formId={published}
          title={`${fb.title} · publicado ✓`}
          listName={fb.listId ? fb.listName : ""}
          onClose={() => navigate("/dashboard/crm/forms")}
        />
      )}
    </div>
  );
}

function FieldControl({ f }) {
  const req = f.req ? <span className="cf-req"> *</span> : null;
  if (f.type === "check") {
    return <label className="cf-check"><input type="checkbox" readOnly tabIndex={-1} /> {f.k}{req}</label>;
  }
  return (
    <>
      <label>{f.k}{req}</label>
      {f.type === "textarea" ? <textarea rows={3} placeholder={f.ph} readOnly tabIndex={-1} />
        : f.type === "select" ? <select tabIndex={-1}>{(f.options || []).filter(Boolean).map((o, i) => <option key={i}>{o}</option>)}</select>
        : <input type={f.type} placeholder={f.ph} readOnly tabIndex={-1} />}
    </>
  );
}

function ColorField({ label, value, onChange }) {
  const safe = /^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff";
  return (
    <div className="crm-field">
      <label>{label}</label>
      <div className="cf-colorrow">
        <input type="color" value={safe} onChange={(e) => onChange(e.target.value.toUpperCase())} />
        <input className="hex" value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}
