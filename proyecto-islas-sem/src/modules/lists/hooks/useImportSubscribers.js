import { useState, useEffect } from "react";
import {
  collection,
  addDoc,
  updateDoc,
  query,
  where,
  getDocs,
  doc,
  Timestamp,
  increment
} from "firebase/firestore";
import { db } from "../../../config/firebaseConfig";

// --- Normalización y validación ---
const normalizeEmail = (email) =>
  email
    ?.toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "")
    .replace(/[.,;:]+$/, "");

const isValidEmail = (email) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export function useImportSubscribers(listId, list) {
  const [method, setMethod] = useState(null);
  const [rawEmails, setRawEmails] = useState([]);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [error, setError] = useState("");
  const [previewData, setPreviewData] = useState(null);
  const [resetUploaderKey, setResetUploaderKey] = useState(0);

  const [pendingGoogleImport, setPendingGoogleImport] = useState(false);

  // --- Guardar suscriptores en Firestore ---
  const saveSubscribersToFirestore = async (emails, shouldUpdateExisting) => {
    if (!list) return;

    const subscribersRef = collection(db, "subscribers");
    let createdCount = 0;
    let updatedCount = 0;

    for (const email of emails) {
      const q = query(
        subscribersRef,
        where("email", "==", email),
        where("listId", "==", listId),
        where("userId", "==", list.userId)
      );
      const snap = await getDocs(q);

      if (!snap.empty) {
        if (shouldUpdateExisting) {
          const docRef = snap.docs[0].ref;
          await updateDoc(docRef, {
            status: "subscribed",
            updatedAt: Timestamp.now()
          });
          updatedCount++;
        }
      } else {
        await addDoc(subscribersRef, {
          email,
          listId,
          createdAt: Timestamp.now(),
          status: "subscribed",
          userId: list.userId
        });
        createdCount++;
      }
    }

    // --- Actualizar estadísticas de la lista ---
    const listRef = doc(db, "lists", listId);
    await updateDoc(listRef, {
      subscribersCount: increment(createdCount),
      lastImportAt: Timestamp.now(),
      lastImportSource: method,
      invalidEmailsCount: previewData.invalidEmails.length,
      duplicateEmailsCount: previewData.duplicateEmails.length
    });

    return { createdCount, updatedCount };
  };

  // --- Procesar emails antes de vista previa ---
  const handleAdd = async () => {
    setError("");

    if (!rawEmails || rawEmails.length === 0) {
      setError("No hay emails para procesar");
      return;
    }

    // Normalizar
    const cleaned = rawEmails
      .map((email) => normalizeEmail(email))
      .filter(Boolean);

    // Validar
    const valid = cleaned.filter((email) => isValidEmail(email));
    const invalid = cleaned.filter((email) => !isValidEmail(email));

    // Duplicados internos
    const duplicatesInternal = valid.filter(
      (email, index) => valid.indexOf(email) !== index
    );

    const uniqueValid = [...new Set(valid)];

    // Duplicados en Firestore
    const duplicatesFirestore = [];
    const subscribersRef = collection(db, "subscribers");

    for (const email of uniqueValid) {
      const q = query(
        subscribersRef,
        where("email", "==", email),
        where("listId", "==", listId),
        where("userId", "==", list.userId)
      );
      const snap = await getDocs(q);
      if (!snap.empty) duplicatesFirestore.push(email);
    }

    // Filtrar válidos finales
    const finalValid = uniqueValid.filter(
      (email) => !duplicatesFirestore.includes(email)
    );

    if (finalValid.length === 0) {
      setError("No hay emails válidos nuevos para importar");
      return;
    }

    setPreviewData({
      validEmails: finalValid,
      invalidEmails: invalid,
      duplicateEmails: [...duplicatesInternal, ...duplicatesFirestore]
    });
  };

  // --- Confirmar importación ---
  const confirmImport = async () => {
    if (!previewData || previewData.validEmails.length === 0) {
      alert("No hay emails válidos para importar");
      return;
    }

    const result = await saveSubscribersToFirestore(
      previewData.validEmails,
      updateExisting
    );

    alert(
      `Importación completada.\nNuevos: ${result.createdCount}\nActualizados: ${result.updatedCount}`
    );

    // Reset
    setPreviewData(null);
    setRawEmails([]);
    setMethod(null);
    setUpdateExisting(false);
    setResetUploaderKey(Date.now());
  };

  // --- Google Sheets ---
  useEffect(() => {
    if (pendingGoogleImport && rawEmails.length > 0) {
      handleAdd();
      setPendingGoogleImport(false);
    }
  }, [rawEmails, pendingGoogleImport]);

  const handleGoogleImport = (emails) => {
    setRawEmails(emails);
    setMethod("text");
    setPendingGoogleImport(true);
  };

  return {
    method,
    setMethod,
    rawEmails,
    setRawEmails,
    updateExisting,
    setUpdateExisting,
    error,
    setError,
    previewData,
    setPreviewData,
    handleAdd,
    confirmImport,
    handleGoogleImport,
    resetUploaderKey
  };
}
