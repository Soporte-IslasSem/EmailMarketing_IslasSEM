import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  collection,
  getDocs,
  deleteDoc,
  doc
} from "firebase/firestore";
import { db } from "../../../../config/firebaseConfig";

import FieldActionsMenu from "./FieldActionsMenu";
import CreateOrEditFieldModal from "./modals/CreateOrEditFieldModal";
import "./ListCampos.styles.css";

export default function ListCampos() {
  const { id: listId } = useParams();

  const [fields, setFields] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingField, setEditingField] = useState(null);

  // 🔹 PAGINACIÓN
  const [currentPage, setCurrentPage] = useState(1);
  const fieldsPerPage = 10;

  const loadFields = async () => {
    const ref = collection(db, "lists", listId, "fields");
    const snap = await getDocs(ref);

    const data = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    setFields(data);
  };

  useEffect(() => {
    loadFields();
  }, [listId]);

  const handleAddField = () => {
    setEditingField(null);
    setModalOpen(true);
  };

  const handleEditField = (field) => {
    setEditingField(field);
    setModalOpen(true);
  };

  const handleDeleteField = async (fieldId) => {
    if (!confirm("¿Eliminar este campo?")) return;

    await deleteDoc(doc(db, "lists", listId, "fields", fieldId));
    loadFields();
  };

  // 🔹 Cálculo de paginación
  const totalPages = Math.ceil(fields.length / fieldsPerPage);
  const startIndex = (currentPage - 1) * fieldsPerPage;
  const currentFields = fields.slice(startIndex, startIndex + fieldsPerPage);

  const handlePrev = () => currentPage > 1 && setCurrentPage(currentPage - 1);
  const handleNext = () => currentPage < totalPages && setCurrentPage(currentPage + 1);

  return (
    <div className="ListCampos">
      <h2>Campos personalizados</h2>
      <p>Aquí podrás gestionar los campos adicionales de los suscriptores.</p>

      <button className="add-field-btn" onClick={handleAddField}>
        Añadir campo
      </button>

      {modalOpen && (
        <CreateOrEditFieldModal
          listId={listId}
          field={editingField}
          onClose={() => {
            setModalOpen(false);
            loadFields();
          }}
        />
      )}

      <table className="fields-table">
        <thead>
          <tr>
            <th>Campo de etiqueta</th>
            <th>Estado</th>
            <th>Tipo</th>
            <th>Comando</th>
            <th>Acciones</th>
          </tr>
        </thead>

        <tbody>
          {currentFields.map((f) => (
            <tr key={f.id}>
              <td>{f.label}</td>
              <td>{f.visible ? "Visible y editable" : "Oculto"}</td>
              <td>{f.type}</td>
              <td>{f.tag}</td>

              <td className="field-actions-cell">
                <FieldActionsMenu
                  onCopy={() => navigator.clipboard.writeText(f.tag)}
                  onEdit={() => handleEditField(f)}
                  onDelete={() => handleDeleteField(f.id)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 🔹 PAGINACIÓN ISLAS SEM */}
      {fields.length > 10 && (
        <div className="pagination">
          <button
            className="page-btn"
            onClick={handlePrev}
            disabled={currentPage === 1}
          >
            Anterior
          </button>

          <span className="page-info">
            Página {currentPage} de {totalPages}
          </span>

          <button
            className="page-btn"
            onClick={handleNext}
            disabled={currentPage === totalPages}
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}
