import { useEffect, useState } from "react";
import { collection, query, where, getDocs, deleteDoc, doc } from "firebase/firestore";
import { db } from "../../config/firebaseConfig";
import { useNavigate } from "react-router-dom";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import FormActionsMenu from "./components/FormActionsMenu.jsx";
import "./styles/FormsList.styles.css";

export default function FormsList() {
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const formsPerPage = 6;
  const navigate = useNavigate();
  const [user, setUser] = useState(null);

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const loadForms = async () => {
      if (!user) return;

      try {
        const q = query(collection(db, "forms"), where("userId", "==", user.uid));
        const snap = await getDocs(q);
        const data = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setForms(data);
      } catch (err) {
        console.error("Error al cargar formularios:", err);
      } finally {
        setLoading(false);
      }
    };

    loadForms();
  }, [user]);

  const handleEdit = (formId) => {
    navigate(`/dashboard/lists/${forms.find(f => f.id === formId)?.listId || ""}/formularios/${formId}`);
  };

  const handleDelete = async (formId) => {
    if (!confirm("¿Seguro que deseas eliminar este formulario?")) return;
    await deleteDoc(doc(db, "forms", formId));
    setForms(forms.filter((f) => f.id !== formId));
  };

  const handleAssociate = (formId) => {
    navigate(`/dashboard/campaigns?associateForm=${formId}`);
  };

  // 🔹 Botón volver
  const handleBack = () => {
    navigate("/dashboard");
  };

  // 🔹 Paginación
  const totalPages = Math.ceil(forms.length / formsPerPage);
  const startIndex = (currentPage - 1) * formsPerPage;
  const currentForms = forms.slice(startIndex, startIndex + formsPerPage);

  const handlePrev = () => currentPage > 1 && setCurrentPage(currentPage - 1);
  const handleNext = () => currentPage < totalPages && setCurrentPage(currentPage + 1);

  return (
    <div className="FormsList__container">
      <div className="FormsList__back">
        <button className="FormsList__backBtn" onClick={handleBack}>
           Volver
        </button>
      </div>

      <h2 className="FormsList__title">Formularios creados</h2>

      {loading && <p className="FormsList__loading">Cargando formularios...</p>}

      {!loading && forms.length === 0 && (
        <p className="FormsList__empty">No hay formularios creados todavía.</p>
      )}

      {!loading && forms.length > 0 && (
        <>
          <table className="FormsList__table">
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
                <tr key={form.id} className="FormsList__row">
                  <td>{form.design?.titleText || "Sin título"}</td>
                  <td>{form.type || "No especificado"}</td>
                  <td>{form.listId || "—"}</td>
                  <td>{form.status || "Sin estado"}</td>
                  <td>
                    <div
                      className="FormsList__preview"
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
                      onDelete={handleDelete}
                      onAssociate={handleAssociate}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="FormsList__pagination">
            <button
              className="FormsList__pageBtn"
              onClick={handlePrev}
              disabled={currentPage === 1}
            >
               Anterior
            </button>

            <span className="FormsList__pageInfo">
              Página {currentPage} de {totalPages}
            </span>

            <button
              className="FormsList__pageBtn"
              onClick={handleNext}
              disabled={currentPage === totalPages}
            >
              Siguiente 
            </button>
          </div>
        </>
      )}
    </div>
  );
}
