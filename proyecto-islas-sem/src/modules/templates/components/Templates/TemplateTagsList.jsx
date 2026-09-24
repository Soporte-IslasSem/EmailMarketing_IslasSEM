import "./TemplateTagsList.styles.css";
import { useEffect, useState, useRef } from "react";
import { db } from "../../../../config/firebaseConfig";
import { collection, query, where, onSnapshot, deleteDoc, doc } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import TemplateTagsModal from "./modals/TemplateTagsModal";

export default function TemplateTagsList() {
  const [tags, setTags] = useState([]);
  const [filteredTags, setFilteredTags] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingTag, setEditingTag] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const tagsPerPage = 10;
  const menuRef = useRef(null);

  useEffect(() => {
    const auth = getAuth();

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (!user) {
        setTags([]);
        setFilteredTags([]);
        return;
      }

      const tagsQuery = query(
        collection(db, "templateTags"),
        where("userEmail", "==", user.email)
      );

      const unsubTags = onSnapshot(tagsQuery, (snapshot) => {
        const data = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        setTags(data);
        setFilteredTags(data);
        setCurrentPage(1);
      });

      return () => unsubTags();
    });

    return () => unsubscribeAuth();
  }, []);

  // 🔹 Filtrar etiquetas por nombre
  useEffect(() => {
    const filtered = tags.filter((tag) =>
      tag.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredTags(filtered);
    setCurrentPage(1);
  }, [searchTerm, tags]);

  const handleDelete = async (id) => {
    await deleteDoc(doc(db, "templateTags", id));
    setOpenMenuId(null);
  };

  const toggleMenu = (id, event) => {
    if (openMenuId === id) {
      setOpenMenuId(null);
      return;
    }

    const rect = event.target.getBoundingClientRect();
    setMenuPosition({
      x: rect.right - 150,
      y: rect.bottom + 4,
    });

    setOpenMenuId(id);
  };

  // 🔹 Cerrar menú al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 🔹 Paginación
  const totalPages = Math.ceil(filteredTags.length / tagsPerPage) || 1;
  const indexOfLastTag = currentPage * tagsPerPage;
  const indexOfFirstTag = indexOfLastTag - tagsPerPage;
  const currentTags = filteredTags.slice(indexOfFirstTag, indexOfLastTag);

  const nextPage = () => {
    setCurrentPage((prev) => (prev < totalPages ? prev + 1 : prev));
  };

  const prevPage = () => {
    setCurrentPage((prev) => (prev > 1 ? prev - 1 : prev));
  };

  return (
    <div className="TemplateTagsList">
      <div className="TemplateTagsList__header">
        <button
          className="TemplateTagsList__newButton"
          onClick={() => setShowCreateModal(true)}
        >
          Nueva etiqueta
        </button>
      </div>

      {/* 🔹 Campo de búsqueda */}
      <div className="TemplateTagsList__searchWrapper">
        <input
          type="text"
          placeholder="Buscar etiqueta..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="TemplateTagsList__searchInput"
        />
      </div>

      {filteredTags.length === 0 ? (
        <div className="TemplateTagsList__empty">
          <p>No se encontraron etiquetas.</p>
        </div>
      ) : (
        <>
          <table className="TemplateTagsList__table">
            <thead>
              <tr>
                <th></th>
                <th>Nombre</th>
                <th>Plantillas</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {currentTags.map((tag) => (
                <tr key={tag.id}>
                  <td>
                    <input type="checkbox" />
                  </td>
                  <td>{tag.name}</td>
                  <td>0</td>
                  <td>
                    <div className="TemplateTagsList__actions">
                      <button
                        className="TemplateTagsList__menuButton"
                        onClick={(e) => toggleMenu(tag.id, e)}
                      >
                        ⋮
                      </button>
                    </div>

                    {openMenuId === tag.id && (
                      <div
                        ref={menuRef}
                        className="TemplateTagsList__menu"
                        style={{
                          left: `${menuPosition.x}px`,
                          top: `${menuPosition.y}px`,
                        }}
                      >
                        <button
                          className="TemplateTagsList__edit"
                          onClick={() => {
                            setEditingTag(tag);
                            setOpenMenuId(null);
                          }}
                        >
                          Editar etiqueta
                        </button>
                        <button
                          className="TemplateTagsList__delete"
                          onClick={() => handleDelete(tag.id)}
                        >
                          Eliminar etiqueta
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* 🔹 Paginación visual estilo ISLAS SEM */}
          <div className="TemplateTagsList__pagination">
            <button
              onClick={prevPage}
              disabled={currentPage === 1}
              className={`TemplateTagsList__pageButton ${
                currentPage === 1 ? "disabled" : ""
              }`}
            >
              Anterior
            </button>

            <span className="TemplateTagsList__pageInfo">
              Página {currentPage} de {totalPages}
            </span>

            <button
              onClick={nextPage}
              disabled={currentPage === totalPages}
              className={`TemplateTagsList__pageButton ${
                currentPage === totalPages ? "disabled" : ""
              }`}
            >
              Siguiente
            </button>
          </div>
        </>
      )}

      {(showCreateModal || editingTag) && (
        <TemplateTagsModal
          onClose={() => {
            setShowCreateModal(false);
            setEditingTag(null);
          }}
          tag={editingTag}
        />
      )}
    </div>
  );
}
