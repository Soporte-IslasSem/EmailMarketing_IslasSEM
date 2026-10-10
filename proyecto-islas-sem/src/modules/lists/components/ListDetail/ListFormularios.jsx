// Listas › (lista) › Formularios: los formularios cuya "lista destino" es esta lista.
// Son los mismos formularios de Email Marketing › Formularios y CRM › Formularios.
import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useCrmCollection, crmUpdate } from "../../../crm/lib/crm";
import { useList } from "../../hooks/useList.js";
import { BUILTIN_LIST } from "../../../forms/public/builtinForms";
import ShareFormModal from "../../../crm/components/ShareFormModal";
import "./ListFormularios.styles.css";

export default function ListFormularios() {
  const { id: listId } = useParams();
  const navigate = useNavigate();
  const { items, loading } = useCrmCollection("crmForms");
  const { items: subs } = useCrmCollection("formSubmissions");
  const [share, setShare] = useState(null);
  const { list } = useList(listId);
  const [busy, setBusy] = useState("");
  // El resto de formularios del CRM: se pueden conectar a esta lista con un clic.
  // SEPA y Datos Jurídicos (fijos) aparecen aunque nunca se hayan editado.
  const others = useMemo(() => {
    const saved = items.filter((f) => f.listId !== listId);
    const builtins = BUILTIN_LIST.filter((b) => !items.some((f) => f.id === b.type)).map((b) => ({ id: b.type, name: b.name, builtin: true }));
    return [...saved, ...builtins].sort((a, b) => String(a.name || a.title || "").localeCompare(String(b.name || b.title || "")));
  }, [items, listId]);
  const connect = async (f) => {
    if (f.listId && !window.confirm(`"${f.name || f.title}" ahora suscribe a la lista "${f.listName || "otra lista"}". Un formulario solo tiene una lista destino: ¿cambiarla a "${list?.name || "esta lista"}"?`)) return;
    setBusy(f.id);
    try { await crmUpdate("crmForms", f.id, { listId, listName: list?.name || "" }); }
    catch (e) { alert("No se pudo conectar: " + e.message); }
    finally { setBusy(""); }
  };
  const disconnect = async (f) => {
    if (!window.confirm(`¿Quitar esta lista como destino de "${f.name || f.title}"? Los envíos seguirán llegando al CRM.`)) return;
    await crmUpdate("crmForms", f.id, { listId: "", listName: "" }).catch((e) => alert("No se pudo quitar: " + e.message));
  };

  const forms = useMemo(
    () => items.filter((f) => f.listId === listId).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)),
    [items, listId]
  );
  const counts = useMemo(() => {
    const c = {};
    subs.forEach((s) => { c[s.formType] = (c[s.formType] || 0) + 1; });
    return c;
  }, [subs]);

  return (
    <div className="ListFormularios">
      <div className="ListFormularios__header">
        <h2>Formularios de la lista</h2>
        <div className="ListFormularios__actions">
          <button className="ListFormularios__backBtn" onClick={() => navigate("/dashboard/lists")}>
            Volver a listas
          </button>
          <button className="ListFormularios__createBtn" onClick={() => navigate(`/dashboard/forms/new?list=${encodeURIComponent(listId)}`)}>
            Crear formulario
          </button>
        </div>
      </div>

      {loading && <p className="ListFormularios__loading">Cargando formularios...</p>}

      {!loading && forms.length === 0 && (
        <p className="ListFormularios__empty">
          Ningún formulario suscribe todavía a esta lista. Crea uno o, en un formulario existente, elige esta lista como
          "Lista destino".
        </p>
      )}

      {!loading && forms.length > 0 && (
        <div className="ListFormularios__tableWrapper">
          <table className="ListFormularios__table">
            <thead>
              <tr>
                <th>Formulario</th>
                <th>Campos</th>
                <th>Envíos</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {forms.map((f) => (
                <tr key={f.id} className="ListFormularios__row">
                  <td>{f.name || f.title || "Sin título"}</td>
                  <td>{(f.fields || []).filter((x) => x.type !== "check").length}</td>
                  <td>{counts[f.id] || 0}</td>
                  <td>{f.active === false ? "Desactivado" : "Publicado"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="ListFormularios__createBtn" onClick={() => setShare(f)}>Mostrar</button>{" "}
                    <button className="ListFormularios__backBtn" onClick={() => navigate(`/dashboard/forms/edit/${f.id}`)}>Editar</button>{" "}
                    <button className="ListFormularios__backBtn" onClick={() => disconnect(f)}>Quitar de la lista</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && others.length > 0 && (
        <div className="ListFormularios__tableWrapper" style={{ marginTop: 24 }}>
          <h3 style={{ margin: "0 0 4px" }}>Otros formularios del CRM</h3>
          <p className="ListFormularios__empty" style={{ marginTop: 0 }}>
            Conecta cualquiera a esta lista: quien lo rellene quedará suscrito aquí (además de entrar en el CRM).
          </p>
          <table className="ListFormularios__table">
            <thead>
              <tr><th>Formulario</th><th>Lista destino actual</th><th>Envíos</th><th>Estado</th><th>Acciones</th></tr>
            </thead>
            <tbody>
              {others.map((f) => (
                <tr key={f.id} className="ListFormularios__row">
                  <td>{f.name || f.title || "Sin título"}</td>
                  <td>{f.listId ? f.listName || "Otra lista" : "—"}</td>
                  <td>{counts[f.id] || 0}</td>
                  <td>{f.active === false ? "Desactivado" : "Publicado"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {f.builtin ? (
                      <button className="ListFormularios__createBtn" onClick={() => navigate(`/dashboard/forms/edit/${f.id}`)} title="Ábrelo, elige esta lista en «Lista destino» y pulsa Publicar">Abrir para conectar</button>
                    ) : (
                      <button className="ListFormularios__createBtn" disabled={busy === f.id} onClick={() => connect(f)}>{busy === f.id ? "Conectando…" : "Conectar a esta lista"}</button>
                    )}{" "}
                    <button className="ListFormularios__backBtn" onClick={() => setShare(f)}>Mostrar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {share && (
        <ShareFormModal formId={share.id} title={`Compartir · ${share.name || share.title}`} listName={share.listName} onClose={() => setShare(null)} />
      )}
    </div>
  );
}
