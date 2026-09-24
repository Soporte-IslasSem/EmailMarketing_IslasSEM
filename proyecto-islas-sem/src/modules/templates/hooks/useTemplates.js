import { useEffect, useState } from "react";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../../config/firebaseConfig";
import { useAuth } from "../../../shared/hooks/useAuth";
import { getStorage, ref, uploadBytes } from "firebase/storage";
import JSZip from "jszip";

export default function useTemplates() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState([]);

  // ================================
  // Cargar plantillas del usuario
  // ================================
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, "templates"), where("userId", "==", user.uid));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
        thumbnail: docSnap.data().thumbnail || "/placeholder-template.png",
      }));

      setTemplates(data);
    });

    return () => unsubscribe();
  }, [user]);

  // ================================
  // Crear plantilla
  // ================================
  const createTemplate = async (data) => {
    if (!user) return;

    await addDoc(collection(db, "templates"), {
      ...data,
      userId: user.uid,
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: [],
      thumbnail: "/placeholder-template.png",
      type: "html",
    });
  };

  // ================================
  // Importar plantilla (ZIP o HTML)
  // ================================
  const importTemplate = async ({ name, file, html }) => {
    if (!user) return;

    const storage = getStorage();
    let extractedHtml = html || "";

    if (file) {
      const zip = await JSZip.loadAsync(file);
      const htmlFiles = Object.values(zip.files).filter(
        (f) => !f.dir && f.name.toLowerCase().endsWith(".html")
      );
      const htmlEntry =
        htmlFiles.find((f) => f.name.toLowerCase().endsWith("index.html")) ||
        htmlFiles[0];

      if (htmlEntry) {
        extractedHtml = await htmlEntry.async("string");
      }
    }

    const docRef = await addDoc(collection(db, "templates"), {
      name,
      userId: user.uid,
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: [],
      type: file ? "zip" : "html",
      thumbnail: "/placeholder-template.png",
      html: extractedHtml,
    });

    if (file) {
      const storagePath = `templates/${user.uid}/${docRef.id}/source.zip`;
      const fileRef = ref(storage, storagePath);
      await uploadBytes(fileRef, file);
      await updateDoc(doc(db, "templates", docRef.id), { storagePath });
    }

    return docRef.id;
  };

  // ================================
  // Actualizar plantilla
  // ================================
  const updateTemplate = async (id, data) => {
    await updateDoc(doc(db, "templates", id), data);
  };

  // ================================
  // Eliminar plantilla
  // ================================
  const deleteTemplate = async (id) => {
    await deleteDoc(doc(db, "templates", id));
  };

  // ================================
  // Renombrar plantilla
  // ================================
  const renameTemplate = async (id, newName) => {
    await updateDoc(doc(db, "templates", id), { name: newName });
  };

  // ================================
  // Duplicar plantilla
  // ================================
  const duplicateTemplate = async (template) => {
    if (!user) return;

    await addDoc(collection(db, "templates"), {
      name: template.name + " (copia)",
      html: template.html || "",
      userId: user.uid,
      createdAt: new Date(),
      tags: template.tags || [],
      thumbnail: template.thumbnail || "/placeholder-template.png",
      systemTemplateId: template.systemTemplateId || null,
    });
  };

  // ================================
  // Actualizar miniatura manual
  // ================================
  const updateThumbnail = async (template) => {
    await updateDoc(doc(db, "templates", template.id), {
      thumbnail: "/placeholder-template.png",
    });
  };

  // ================================
  // Asignar etiquetas
  // ================================
  const assignTags = async (id, tags) => {
    await updateDoc(doc(db, "templates", id), { tags });
  };

  // ================================
  // Eliminar etiquetas
  // ================================
  const removeTags = async (template) => {
    await updateDoc(doc(db, "templates", template.id), { tags: [] });
  };

  return {
    templates,
    createTemplate,
    importTemplate,
    updateTemplate,
    deleteTemplate,
    renameTemplate,
    duplicateTemplate,
    updateThumbnail,
    assignTags,
    removeTags,
  };
}
