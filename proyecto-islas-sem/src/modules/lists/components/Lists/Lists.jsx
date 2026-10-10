import { useState, useMemo } from "react";
import useLists from "../../hooks/useLists";
import useCrmListsSync from "../../hooks/useCrmListsSync";
import CreateListModal from "../CreateListModal/CreateListModal";
import ListActionsMenu from "./ListActionsMenu"; // 🔹 Import del nuevo componente
import { useNavigate } from "react-router-dom";
import { db, auth } from "../../../../config/firebaseConfig";
import { collection, doc, deleteDoc, getDocs, query, where, writeBatch } from "firebase/firestore";
import "./Lists.styles.css";

export default function Lists() {
  const { lists: rawLists } = useLists();
  const crmSync = useCrmListsSync();
  // Las listas automáticas del CRM primero (Todos, luego por tipo), después el resto.
  const lists = useMemo(
    () => [...rawLists].sort((a, b) => (b.crm ? 1 : 0) - (a.crm ? 1 : 0) || (a.crm && b.crm ? (a.crmKey === "all" ? -1 : b.crmKey === "all" ? 1 : a.name.localeCompare(b.name)) : 0)),
    [rawLists]
  );
  const [showModal, setShowModal] = useState(false);
  const [menuOpen, setMenuOpen] = useState(null);
  const [menuPosition, setMenuPosition] = useState(null);
  const [openUpward, setOpenUpward] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedTerm, setDebouncedTerm] = useState("");

  const [page, setPage] = useState(1);
  const pageSize = 10;

  const navigate = useNavigate();

  // 🔹 Debounce real (300 ms)
  useMemo(() => {
    const handler = setTimeout(() => {
      setDebouncedTerm(searchTerm);
      setPage(1);
    }, 300);

    return () => clearTimeout(handler);
  }, [searchTerm]);

  // 🔹 Eliminar lista
  // Borra la lista y sus suscriptores (antes quedaban huérfanos en la base de datos).
  const handleDelete = async (id) => {
    if (lists.find((l) => l.id === id)?.crm) {
      window.alert("Es una lista automática del CRM: se mantiene sola con tus contactos y no se puede eliminar.");
      return;
    }
    const subsSnap = await getDocs(
      query(collection(db, "subscribers"), where("listId", "==", id), where("userId", "==", auth.currentUser.uid))
    );
    const confirmDelete = window.confirm(
      `¿Eliminar esta lista y sus ${subsSnap.size} suscriptor(es)? Esta acción no se puede deshacer.`
    );
    if (!confirmDelete) return;

    const refs = subsSnap.docs.map((d) => d.ref);
    for (let i = 0; i < refs.length; i += 400) {
      const batch = writeBatch(db);
      refs.slice(i, i + 400).forEach((r) => batch.delete(r));
      await batch.commit();
    }
    await deleteDoc(doc(db, "lists", id));
  };

  // 🔹 Búsqueda avanzada
  const filteredLists = useMemo(() => {
    if (!debouncedTerm.trim()) return lists;

    const term = debouncedTerm.toLowerCase();

    return lists.filter((list) => {
      const name = list.name?.toLowerCase() || "";
      const subscribers = String(list.subscribersCount || 0);
      const id = list.id?.toLowerCase() || "";

      const createdDate = list.createdAt
        ? new Date(list.createdAt.seconds * 1000)
        : null;

      const dateString = createdDate
        ? `${createdDate.getDate()}/${createdDate.getMonth() + 1}/${createdDate.getFullYear()}`
        : "";

      return (
        name.includes(term) ||
        subscribers.includes(term) ||
        id.includes(term) ||
        dateString.includes(term)
      );
    });
  }, [lists, debouncedTerm]);

  // 🔹 Paginación
  const totalPages = Math.ceil(filteredLists.length / pageSize);

  const paginatedLists = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredLists.slice(start, start + pageSize);
  }, [filteredLists, page]);

  // 🔹 Detectar si el menú debe abrir hacia arriba y calcular posición
  const handleMenuToggle = (listId, event) => {
    const rect = event.target.getBoundingClientRect();
    const windowHeight = window.innerHeight;

    setOpenUpward(windowHeight - rect.bottom < 200);
    setMenuPosition(rect);
    setMenuOpen(menuOpen === listId ? null : listId);
  };

  return (
    <div className="Lists">

      {/* HEADER */}
      <div className="Lists__top">
        <div>
          <h1>Listas</h1>
          <p>Gestiona tus listas de suscriptores con facilidad y seguridad.</p>
        </div>

        <button className="Lists__newButton" onClick={() => setShowModal(true)}>
          Nueva Lista
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: "#eef6f5", border: "1px solid #d5e8e6", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13.5 }}>
        <span>🔄 Las listas <b>CRM · …</b> se crean y actualizan solas con tus contactos del CRM (todos y por tipo de cliente), listas para usar en campañas. Las bajas se respetan.</span>
        <span style={{ marginLeft: "auto", color: "#6b7d7d", fontSize: 12.5 }}>
          {crmSync.busy ? "Actualizando…" : crmSync.error ? `⚠ ${crmSync.error}` : crmSync.last ? `Actualizadas a las ${new Date(crmSync.last).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}` : ""}
        </span>
        <button className="Lists__newButton" style={{ padding: "6px 12px", fontSize: 12.5 }} onClick={crmSync.sync} disabled={crmSync.busy}>Actualizar ahora</button>
      </div>

      {/* BUSCADOR */}
      <input
        type="text"
        placeholder="Buscar lista..."
        className="Lists__search"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />

      {/* TABLA */}
      <table className="Lists__table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Suscriptores</th>
            <th>Creación</th>
            <th>Acciones</th>
          </tr>
        </thead>

        <tbody>
          {paginatedLists.length > 0 ? (
            paginatedLists.map((list) => (
              <tr key={list.id}>
                <td
                  className="ListNameCell"
                  onClick={() => navigate(`/dashboard/lists/${list.id}`)}
                >
                  {list.name}
                  {list.crm && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: "#136b68", background: "#e6f4f1", borderRadius: 10, padding: "2px 8px" }}>CRM · automática</span>}
                </td>

                <td>{list.subscribersCount || 0} suscriptores</td>

                <td>
                  {list.createdAt
                    ? new Date(list.createdAt.seconds * 1000).toLocaleDateString()
                    : "—"}
                </td>

                <td className="ActionsCell">
                  <button
                    className="ActionsBtn"
                    onClick={(e) => handleMenuToggle(list.id, e)}
                  >
                    ⋮
                  </button>

                  {/* 🔹 Menú de acciones renderizado con portal */}
                  {menuOpen === list.id && (
                    <ListActionsMenu
                      position={menuPosition}
                      openUpward={openUpward}
                      onView={() => navigate(`/dashboard/lists/${list.id}`)}
                      onDelete={() => handleDelete(list.id)}
                    />
                  )}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="4" style={{ textAlign: "center", padding: "20px" }}>
                No se encontraron listas que coincidan con la búsqueda.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* 🔹 Paginación */}
      {totalPages > 1 && (
        <div className="Lists__pagination">
          <button
            className="Lists__pageButton"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Anterior
          </button>

          <span className="Lists__pageInfo">
            Página {page} de {totalPages}
          </span>

          <button
            className="Lists__pageButton"
            disabled={page === totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente
          </button>
        </div>
      )}

      {showModal && <CreateListModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
