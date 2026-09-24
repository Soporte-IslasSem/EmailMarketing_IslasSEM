import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "../../../../config/firebaseConfig";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import FormActionsMenu from "../../../forms/components/FormActionsMenu.jsx";
import "./ListFormularios.styles.css";

export default function ListFormularios() {
  const { id: listId } = useParams();
  const navigate = useNavigate();

  const [forms, setForms] = useState([]);
  const [listName, setListName] = useState(""); // 🔹 nuevo estado
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const formsPerPage = 6;

  // Usuario autenticado
  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // 🔹 Obtener nombre de la lista
  useEffect(() => {
    const fetchListName = async () => {
      try {
        const ref = doc(db, "lists", listId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setListName(snap.data().name || "Sin nombre");
        } else {
          setListName("Lista no encontrada");
        }
      } catch (err) {
        console.error("Error obteniendo nombre de lista:", err);
        setListName("Error al cargar nombre");
      }
    };

    if (listId) fetchListName();
  }, [listId]);

  // Formularios de ESTA lista
  useEffect(() => {
    const loadForms = async () => {
      if (!user || !listId) return;

      try {
        setLoading(true);
        const q = query(
          collection(db, "forms"),
          where("userId", "==", user.uid),
          where("listId", "==", listId)
        );
        const snap = await getDocs(q);
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setForms(data);
      } catch (err) {
        console.error("Error cargando formularios:", err);
      } finally {
        setLoading(false);
      }
    };

    loadForms();
  }, [user, listId]);

  // Paginación
  const totalPages = Math.ceil(forms.length / formsPerPage);
  const startIndex = (currentPage - 1) * formsPerPage;
  const currentForms = forms.slice(startIndex, startIndex + formsPerPage);

  const handlePrev = () => currentPage > 1 && setCurrentPage(currentPage - 1);
  const handleNext = () => currentPage < totalPages && setCurrentPage(currentPage + 1);

  const handleBackToLists = () => navigate("/dashboard/lists");
  const handleCreate = () => navigate(`/dashboard/lists/${listId}/formularios/nuevo`);
  const handleEdit = (formId) => navigate(`/dashboard/lists/${listId}/formularios/${formId}`);
  const handleAssociate = (formId) => navigate(`/dashboard/campaigns?associateForm=${formId}`);
  const handleDeleteLocal = (formId) => setForms((prev) => prev.filter((f) => f.id !== formId));

  return (
    <div className="ListFormularios">
      <div className="ListFormularios__header">
        <h2>Formularios de la lista</h2>
        <div className="ListFormularios__actions">
          <button className="ListFormularios__backBtn" onClick={handleBackToLists}>
            Volver a listas
          </button>
          <button className="ListFormularios__createBtn" onClick={handleCreate}>
            Crear formulario
          </button>
        </div>
      </div>

      {loading && <p className="ListFormularios__loading">Cargando formularios...</p>}

      {!loading && forms.length === 0 && (
        <p className="ListFormularios__empty">
          No hay formularios asociados a esta lista todavía.
        </p>
      )}

      {!loading && currentForms.length > 0 && (
        <div className="ListFormularios__tableWrapper">
          <table className="ListFormularios__table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Tipo</th>
                <th>Lista asociada</th>
                <th>Estado</th>
                <th>Vista previa</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {currentForms.map((form) => (
                <tr key={form.id} className="ListFormularios__row">
                  <td>{form.design?.titleText || "Sin título"}</td>
                  <td>{form.type || "No especificado"}</td>
                  <td>{listName}</td> {/* 🔹 mostramos nombre de lista */}
                  <td>{form.status || "Sin estado"}</td>
                  <td>
                    <div
                      className="ListFormularios__preview"
                      style={{
                        background: form.design?.bgColor || "#fff",
                        borderRadius: `${form.design?.borderRadius || 8}px`,
                      }}
                    >
                      <p
                        style={{
                          color: form.design?.textColor || "#000",
                          fontSize: `${form.design?.fontSize || 16}px`,
                          fontWeight: form.design?.fontWeight || "600",
                        }}
                      >
                        {form.design?.titleText || "Suscríbete"}
                      </p>
                      <input
                        type="email"
                        placeholder="Tu correo"
                        disabled
                        style={{
                          borderRadius: `${form.design?.borderRadius || 8}px`,
                          border: "1px solid #d1d5db",
                        }}
                      />
                      <button
                        disabled
                        style={{
                          background: form.design?.buttonColor || "#1A9190",
                          borderRadius: `${form.design?.borderRadius || 8}px`,
                        }}
                      >
                        Suscribirme
                      </button>
                    </div>
                  </td>
                  <td>
                    <FormActionsMenu
                      formId={form.id}
                      onEdit={handleEdit}
                      onDelete={handleDeleteLocal}
                      onAssociate={handleAssociate}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* 🔹 Paginación */}
          <div className="ListFormularios__pagination">
            <button
              className="ListFormularios__pageBtn"
              onClick={handlePrev}
              disabled={currentPage === 1}
            >
              Anterior
            </button>

            <span className="ListFormularios__pageInfo">
              Página {currentPage} de {totalPages}
            </span>

            <button
              className="ListFormularios__pageBtn"
              onClick={handleNext}
              disabled={currentPage === totalPages}
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
