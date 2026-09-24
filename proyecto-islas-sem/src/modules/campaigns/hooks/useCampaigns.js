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
  getDoc,
  setDoc
} from "firebase/firestore";
import { db } from "../../../config/firebaseConfig";
import { useAuth } from "../../../shared/hooks/useAuth";

export default function useCampaigns() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState([]);

  // 🔥 Escuchar campañas del usuario
  useEffect(() => {
    if (!user || !user.uid) {
      setCampaigns([]);
      return;
    }

    try {
      const q = query(
        collection(db, "campaigns"),
        where("ownerId", "==", user.uid)
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data()
        }));
        setCampaigns(data);
      });

      return () => unsubscribe();
    } catch (error) {
      console.error("Error al escuchar campañas:", error);
      setCampaigns([]);
    }
  }, [user]);

  // 🔥 Crear campaña
  const createCampaign = async (data) => {
    if (!user || !user.uid) return;

    await addDoc(collection(db, "campaigns"), {
      ...data,
      ownerId: user.uid,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  };

  // 🔥 Crear campaña vacía
  const createEmptyCampaign = async (campaignId, initialData) => {
    if (!user || !user.uid) return;

    await setDoc(doc(db, "campaigns", campaignId), {
      ...initialData,
      ownerId: user.uid,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  };

  // 🔥 Actualizar campaña
  const updateCampaign = async (id, data) => {
    await updateDoc(doc(db, "campaigns", id), {
      ...data,
      updatedAt: new Date(),
    });
  };

  // 🔥 Eliminar campaña
  const deleteCampaign = async (id) => {
    await deleteDoc(doc(db, "campaigns", id));
  };

  // 🔥 Obtener campaña por ID
  const getCampaign = async (id) => {
    const snap = await getDoc(doc(db, "campaigns", id));
    return snap.exists() ? snap.data() : null;
  };

  // 🔥 Guardar configuración (StepConfig)
  const saveConfig = async (id, config) => {
    await updateDoc(doc(db, "campaigns", id), {
      config,
      step: 1,
      updatedAt: new Date(),
    });
  };

  // 🔥 Guardar borrador (corregido: NO duplica)
  const saveDraft = async (data) => {
    if (!user || !user.uid) return;

    if (data.id) {
      // 🔹 Actualizar borrador existente
      await setDoc(
        doc(db, "campaigns", data.id),
        {
          ...data,
          ownerId: user.uid,
          status: "draft",
          step: 1,
          updatedAt: new Date(),
        },
        { merge: true } // 🔥 Mantiene datos previos y evita sobrescribir todo
      );
    } else {
      // 🔹 Crear nuevo borrador
      await addDoc(collection(db, "campaigns"), {
        ...data,
        ownerId: user.uid,
        status: "draft",
        step: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  };

  // 🔥 Guardar listas (StepLists)
  const saveLists = async (id, selectedLists, totalSubscribers) => {
    await updateDoc(doc(db, "campaigns", id), {
      lists: {
        selectedLists,
        totalSubscribers,
      },
      step: 2,
      updatedAt: new Date(),
    });
  };

  // 🔥 Guardar plantilla (StepTemplates)
  const saveTemplate = async (id, template) => {
    await updateDoc(doc(db, "campaigns", id), {
      template,
      step: 3,
      updatedAt: new Date(),
    });
  };

  // 🔥 Guardar diseño (StepDesign)
  const saveDesign = async (id, html) => {
    await updateDoc(doc(db, "campaigns", id), {
      "config.design.html": html,
      step: 4,
      updatedAt: new Date(),
    });
  };

  // 🔥 Enviar campaña (StepSend)
  const sendCampaign = async (id) => {
    await updateDoc(doc(db, "campaigns", id), {
      send: {
        scheduleType: "ahora",
        scheduledAt: null,
        status: "enviada",
      },
      step: 5,
      updatedAt: new Date(),
    });
  };

  // 🔥 Obtener datos para informes
  const getCampaignReport = async (id) => {
    const snap = await getDoc(doc(db, "campaigns", id));
    return snap.exists() ? snap.data() : null;
  };

  return {
    campaigns,
    createCampaign,
    createEmptyCampaign,
    updateCampaign,
    deleteCampaign,
    getCampaign,
    saveConfig,
    saveLists,
    saveTemplate,
    saveDesign,
    sendCampaign,
    getCampaignReport,
    saveDraft, // 🔥 corregido y funcional
  };
}
