import { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  onSnapshot
} from "firebase/firestore";
import { db, auth } from "../../../../config/firebaseConfig";
import "./SubscribersTable.styles.css";


const STATUS_LABEL = {
  subscribed: "Suscrito",
  unsubscribed: "Dado de baja",
  bounced: "Rebotado",
  invalid: "No válido",
  pending: "Pendiente de confirmar",
};
export default function SubscribersTable({ listId }) {
  const [subscribers, setSubscribers] = useState([]);
  const [loading, setLoading] = useState(true);

  // 🔥 PAGINACIÓN
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    const ref = collection(db, "subscribers");
    const q = query(
      ref,
      where("listId", "==", listId),
      where("userId", "==", auth.currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const data = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // 🔥 Ordenar por fecha (más reciente primero)
      data.sort((a, b) => {
        const da = a.createdAt?.toMillis?.() ?? 0;
        const db = b.createdAt?.toMillis?.() ?? 0;
        return db - da;
      });

      setSubscribers(data);
      setLoading(false);

      // Reiniciar a página 1 cuando cambian los datos
      setCurrentPage(1);
    });

    return () => unsubscribe();
  }, [listId]);

  // 🔥 Si está cargando
  if (loading) {
    return <p className="loading-msg">Cargando suscriptores...</p>;
  }

  // 🔥 Si no hay suscriptores
  if (!loading && subscribers.length === 0) {
    return (
      <div className="empty-state">
        <p>No hay suscriptores en esta lista todavía.</p>
      </div>
    );
  }

  // 🔥 Cálculo de paginación
  const totalPages = Math.ceil(subscribers.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentItems = subscribers.slice(startIndex, startIndex + itemsPerPage);

  return (
    <div className="SubscribersTable">
      {/* 🔥 TABLA */}
      <table>
        <thead>
          <tr>
            <th>Email</th>
            <th>Estado</th>
            <th>Fecha alta</th>
          </tr>
        </thead>

        <tbody>
          {currentItems.map((sub) => (
            <tr key={sub.id}>
              <td>{sub.email}</td>
              <td>{STATUS_LABEL[sub.status] || sub.status}</td>
              <td>
                {sub.createdAt?.toDate
                  ? sub.createdAt.toDate().toLocaleString()
                  : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 🔥 PAGINACIÓN ABAJO */}
      <div className="Pagination bottom">
        <button
          className="Pagination__btn"
          disabled={currentPage === 1}
          onClick={() => setCurrentPage(currentPage - 1)}
        >
          Anterior
        </button>

        <span className="Pagination__info">
          Página {currentPage} de {totalPages}
        </span>

        <button
          className="Pagination__btn"
          disabled={currentPage === totalPages}
          onClick={() => setCurrentPage(currentPage + 1)}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}
