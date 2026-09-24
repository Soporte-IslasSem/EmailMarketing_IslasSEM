import { useEffect, useState } from "react";
import { collection, getDocs, deleteDoc, doc } from "firebase/firestore";
import { db } from "../../../../config/firebaseConfig.js";
import { useParams } from "react-router-dom";

import SegmentModal from "./SegmentModal.jsx";
import SegmentTable from "./SegmentTable.jsx";

import "./ListSegmentos.styles.css";

export default function ListSegmentos() {
  const { id: listId } = useParams();

  const [segments, setSegments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  // 🔹 Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const segmentsPerPage = 10;

  const loadSegments = async () => {
    setLoading(true);
    const snap = await getDocs(collection(db, "lists", listId, "segments"));
    const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    setSegments(data);
    setLoading(false);
  };

  useEffect(() => {
    loadSegments();
  }, [listId]);

  const handleDelete = async (segmentId) => {
    if (!confirm("¿Eliminar este segmento?")) return;
    await deleteDoc(doc(db, "lists", listId, "segments", segmentId));
    loadSegments();
  };

  // 🔹 Cálculo de paginación
  const totalPages = Math.ceil(segments.length / segmentsPerPage);
  const startIndex = (currentPage - 1) * segmentsPerPage;
  const currentSegments = segments.slice(startIndex, startIndex + segmentsPerPage);

  const handlePrev = () => currentPage > 1 && setCurrentPage(currentPage - 1);
  const handleNext = () => currentPage < totalPages && setCurrentPage(currentPage + 1);

  return (
    <div className="ListSegmentos">
      <div className="ListSegmentos__header">
        <h2>Segmentos</h2>
        <button
          className="ListSegmentos__new"
          onClick={() => setModalOpen(true)}
        >
          Nuevo segmento
        </button>
      </div>

      <p className="ListSegmentos__desc">
        Aquí podrás crear segmentos basados en filtros avanzados.
      </p>

      {loading && <p>Cargando segmentos...</p>}

      {!loading && segments.length === 0 && (
        <div className="ListSegmentos__empty">
          <p>Aún no has creado ningún segmento.</p>
          <button
            className="ListSegmentos__new"
            onClick={() => setModalOpen(true)}
          >
            Crear tu primer segmento
          </button>
        </div>
      )}

      {!loading && segments.length > 0 && (
        <>
          <SegmentTable segments={currentSegments} onDelete={handleDelete} />

          {/* 🔹 Paginación ISLAS SEM */}
          {segments.length > segmentsPerPage && (
            <div className="ListSegmentos__pagination">
              <button
                className="ListSegmentos__pageBtn"
                onClick={handlePrev}
                disabled={currentPage === 1}
              >
                Anterior
              </button>

              <span className="ListSegmentos__pageInfo">
                Página {currentPage} de {totalPages}
              </span>

              <button
                className="ListSegmentos__pageBtn"
                onClick={handleNext}
                disabled={currentPage === totalPages}
              >
                Siguiente
              </button>
            </div>
          )}
        </>
      )}

      {modalOpen && (
        <SegmentModal
          listId={listId}
          onClose={() => {
            setModalOpen(false);
            loadSegments();
          }}
        />
      )}
    </div>
  );
}
