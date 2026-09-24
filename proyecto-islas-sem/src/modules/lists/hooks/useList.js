import { useEffect, useState } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../../../config/firebaseConfig";

export function useList(id) {
  const [list, setList] = useState(null);
  const [loadingList, setLoadingList] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // 🔹 Obtener la lista
  useEffect(() => {
    const fetchList = async () => {
      try {
        const ref = doc(db, "lists", id);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setList({ id: snap.id, ...snap.data() });
        }
      } catch (err) {
        console.error("Error cargando lista:", err);
        setError("No se pudo cargar la lista");
      }
      setLoadingList(false);
    };
    fetchList();
  }, [id]);

  // 🔹 Actualizar la lista
  const updateList = async (data) => {
    setSaving(true);
    setError(null);

    try {
      const ref = doc(db, "lists", id);
      await updateDoc(ref, data);

      // Actualizar estado local
      setList((prev) => ({ ...prev, ...data }));
    } catch (err) {
      console.error("Error actualizando lista:", err);
      setError("No se pudo guardar los cambios");
    }

    setSaving(false);
  };

  return { list, loadingList, updateList, saving, error };
}
