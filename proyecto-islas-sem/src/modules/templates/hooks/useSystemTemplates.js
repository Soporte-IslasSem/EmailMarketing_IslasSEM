// src/modules/templates/hooks/useSystemTemplates.js

import { addDoc, collection } from "firebase/firestore";
import { db } from "../../../config/firebaseConfig";
import { useAuth } from "../../../shared/hooks/useAuth";

export default function useSystemTemplates() {
  const { user } = useAuth();

  const useTemplate = async (template, customName) => {
    if (!user) return;

    const docRef = await addDoc(collection(db, "templates"), {
      name: customName || template.title,
      html: template.html || "",
      thumbnail: template.image || "",
      tags: template.tags || [],
      userId: user.uid,
      source: "system",
      createdAt: new Date(),
      updatedAt: new Date(),
      systemTemplateId: template.id,
    });

    return docRef.id;
  };

  return { useTemplate };
}
