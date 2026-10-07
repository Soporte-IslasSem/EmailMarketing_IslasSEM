import { useEffect, useMemo, useState } from "react";
import { collection, query, where, getDocs, deleteDoc, doc } from "firebase/firestore";
import { db } from "../../config/firebaseConfig";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../shared/hooks/useAuth";
import FormActionsMenu from "./components/FormActionsMenu.jsx";
import { TYPE_LABEL } from "./lib/embedCode";
import "./styles/FormsList.styles.css";

// Todos los formularios de suscripción del usuario, con su lista y cuántas altas han traído.
export default function FormsList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [forms, setForms] = useState([]);
  const [lists, setLists] = useState([]);
  const [signups, setSignups] = useState({});
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [pickList, setPickList] = useState("");
  const [toDelete, setToDelete] = useState(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [fs, ls, ss] = await Promise.all([
          getDocs(query(collection(db, "forms"), where("userId", "==", user.uid))),
          getDocs(query(collection(db, "lists"), where("userId", "==", user.uid))),
          getDocs(query(collection(db, "subscribers"), where("userId", "==", user.uid))),
        ]);
        setForms(fs.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLists(ls.docs.map((d) => ({ id: d.id, ...d.data() })));
        const count = {};
        ss.docs.forEach((d) => {
          const f = d.data().formId;
          if (f) count[f] = (count[f] || 0) + 1;
        });
        setSignups(count);
      } catch (err) {
        console.error("Error al cargar formularios:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const listName = useMemo(() => Object.fromEntries(lists.map((l) => [l.id, l.name || "Sin nombre"])), [lists]);

  const startCreate = () => {
    if (lists.length === 1) return navigate(`/dashboard/lists/${lists[0].id}/formularios/nuevo`);
    setPickList(lists[0]?.id || "");
    setPicking(true);
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    await deleteDoc(doc(db, "forms", toDelete.id));
    setForms((prev) => prev.filter((f) => f.id !== toDelete.id));
    setToDelete(null);
  };

  return (
    <div className="FormsList__container">
      <div className="FormsList__head">
        <div>
          <h2 className="FormsList__title">Formularios</h2>
          <p className="FormsList__sub">Capta suscriptores desde tu web: cada alta entra sola en la lista que elijas.</p>
        </div>
        <button className="FormsList__create" onClick={startCreate}>Crear formulario</button>
      </div>

      {loading && <p className="FormsList__loading">Cargando formularios...</p>}

      {!loading && forms.length === 0 && (
        <div className="FormsList__emptyState">
          <div className="FormsList__emptyIcon">📝</div>
          <h3>Aún no tienes formularios</h3>
          <p>Crea uno, copia su código y pégalo en tu web. Puede ser un formulario fijo, una ventana emergente, una barra o aparecer cuando el visitante se va.</p>
          <button className="FormsList__create" onClick={startCreate}>Crear mi primer formulario</button>
        </div>
      )}

      {!loading && forms.length > 0 && (
        <table className="FormsList__table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Lista</th>
              <th>Altas</th>
              <th>Código para tu web</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {forms.map((form) => (
              <tr key={form.id} className="FormsList__row">
                <td>
                  <Link to={`/dashboard/forms/${form.id}`} className="FormsList__name">
                    {form.name || form.design?.titleText || "Sin título"}
                  </Link>
                </td>
                <td>{TYPE_LABEL[form.type] || TYPE_LABEL.classic}</td>
                <td>{listName[form.listId] || <em className="FormsList__muted">Lista eliminada</em>}</td>
                <td><strong>{signups[form.id] || 0}</strong></td>
                <td>
                  <Link to={`/dashboard/forms/${form.id}`} className="FormsList__codeBtn">Obtener código</Link>
                </td>
                <td>
                  <FormActionsMenu
                    formId={form.id}
                    onEdit={(id) => navigate(`/dashboard/lists/${form.listId}/formularios/${id}`)}
                    onDelete={() => setToDelete(form)}
                    onAssociate={(id) => navigate(`/dashboard/forms/${id}`)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Elegir lista para el formulario nuevo */}
      {picking && (
        <div className="FormsList__modal" onClick={() => setPicking(false)}>
          <div className="FormsList__modalBox" onClick={(e) => e.stopPropagation()}>
            <h3>¿A qué lista van las altas?</h3>
            {lists.length === 0 ? (
              <>
                <p>Primero necesitas una lista donde guardar a los suscriptores.</p>
                <div className="FormsList__modalActions">
                  <button className="FormsList__ghost" onClick={() => setPicking(false)}>Cancelar</button>
                  <button className="FormsList__create" onClick={() => navigate("/dashboard/lists")}>Crear una lista</button>
                </div>
              </>
            ) : (
              <>
                <select value={pickList} onChange={(e) => setPickList(e.target.value)}>
                  {lists.map((l) => <option key={l.id} value={l.id}>{l.name || "Sin nombre"}</option>)}
                </select>
                <div className="FormsList__modalActions">
                  <button className="FormsList__ghost" onClick={() => setPicking(false)}>Cancelar</button>
                  <button className="FormsList__create" disabled={!pickList} onClick={() => navigate(`/dashboard/lists/${pickList}/formularios/nuevo`)}>Continuar</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Confirmar borrado */}
      {toDelete && (
        <div className="FormsList__modal" onClick={() => setToDelete(null)}>
          <div className="FormsList__modalBox" onClick={(e) => e.stopPropagation()}>
            <h3>¿Eliminar este formulario?</h3>
            <p>Si está puesto en tu web, dejará de recoger altas. Los suscriptores que ya llegaron se quedan en la lista.</p>
            <div className="FormsList__modalActions">
              <button className="FormsList__ghost" onClick={() => setToDelete(null)}>Cancelar</button>
              <button className="FormsList__danger" onClick={confirmDelete}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
