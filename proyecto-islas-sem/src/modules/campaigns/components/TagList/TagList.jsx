import "./TagList.styles.css";
import { useEffect, useState } from "react";
import { db } from "../../../../config/firebaseConfig";
import {
  collection,
  onSnapshot,
  deleteDoc,
  updateDoc,
  doc,
} from "firebase/firestore";
import TagEditModal from "../modals/TagEditModal";

export default function TagList({ onCreate }) {
  const [tags, setTags] = useState([]);
  const [editingTag, setEditingTag] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);

  useEffect(() => {
    const colRef = collection(db, "tags");
    const unsub = onSnapshot(colRef, (snapshot) => {
      const data = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      setTags(data);
    });
    return () => unsub();
  }, []);

  const handleDelete = async (id) => {
    await deleteDoc(doc(db, "tags", id));
    setOpenMenuId(null);
  };

  const handleSaveEdit = async (id, newName) => {
    await updateDoc(doc(db, "tags", id), { name: newName });
    setEditingTag(null);
  };

  const toggleMenu = (id) => {
    setOpenMenuId(openMenuId === id ? null : id);
  };

  return (
    <div className="TagList">
      {tags.length === 0 ? (
        <div className="TagList__empty">
          <img src="/assets/campaigns/empty-tags.png" alt="Sin etiquetas" />
          <h3>Aún no has creado ninguna etiqueta</h3>
          <p>
            Crea tu primera etiqueta haciendo clic sobre el botón “Nueva etiqueta”.
          </p>

          <button
            className="TagList__newButton TagList__newButton--empty"
            onClick={onCreate}
          >
            Nueva etiqueta
          </button>
        </div>
      ) : (
        <>
          <div className="TagList__header">
            <button className="TagList__newButton" onClick={onCreate}>
              Nueva etiqueta
            </button>
          </div>

          <table className="TagList__table">
            <thead>
              <tr>
                <th></th>
                <th>Nombre</th>
                <th>Campañas</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {tags.map((tag) => (
                <tr key={tag.id}>
                  <td><input type="checkbox" /></td>
                  <td>{tag.name}</td>
                  <td>0</td>
                  <td>
                    <div className="TagList__actions">
                      <button
                        className="TagList__menuButton"
                        onClick={() => toggleMenu(tag.id)}
                      >
                        ⋮
                      </button>

                      {openMenuId === tag.id && (
                        <div className="TagList__menu">
                          <button
                            className="TagList__edit"
                            onClick={() => {
                              setEditingTag(tag);
                              setOpenMenuId(null);
                            }}
                          >
                            Editar etiqueta
                          </button>
                          <button
                            className="TagList__delete"
                            onClick={() => handleDelete(tag.id)}
                          >
                            Eliminar etiqueta
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {editingTag && (
        <TagEditModal
          tag={editingTag}
          onClose={() => setEditingTag(null)}
          onSave={handleSaveEdit}
        />
      )}
    </div>
  );
}