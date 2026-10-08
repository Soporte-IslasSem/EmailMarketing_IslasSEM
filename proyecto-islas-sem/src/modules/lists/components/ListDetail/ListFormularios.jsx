// Listas › (lista) › Formularios: los formularios cuya "lista destino" es esta lista.
// Son los mismos formularios de Email Marketing › Formularios y CRM › Formularios.
import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useCrmCollection } from "../../../crm/lib/crm";
import ShareFormModal from "../../../crm/components/ShareFormModal";
import "./ListFormularios.styles.css";

export default function ListFormularios() {
  const { id: listId } = useParams();
  const navigate = useNavigate();
  const { items, loading } = useCrmCollection("crmForms");
  const { items: subs } = useCrmCollection("formSubmissions");
  const [share, setShare] = useState(null);

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
                    <button className="ListFormularios__backBtn" onClick={() => navigate(`/dashboard/forms/edit/${f.id}`)}>Editar</button>
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
