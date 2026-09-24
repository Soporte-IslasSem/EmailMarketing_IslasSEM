import "./StepLists.styles.css";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import WizardSteps from "./WizardSteps";
import { useAuth } from "../../../../shared/hooks/useAuth";

// Firestore
import { db } from "../../../../config/firebaseConfig";
import {
  doc,
  updateDoc,
  getDocs,
  getDoc,
  collection,
  query,
  where,
} from "firebase/firestore";

export default function StepLists() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const campaignId = params.get("id");
  const type = params.get("type") || "newsletter";

  const { user } = useAuth();

  const [lists, setLists] = useState([]);
  const [selected, setSelected] = useState([]);

  // 1️⃣ Cargar listas del usuario desde Firestore
  useEffect(() => {
    const loadLists = async () => {
      try {
        const q = query(collection(db, "lists"), where("userId", "==", user.uid));
        const snapshot = await getDocs(q);

        const userLists = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        setLists(userLists);
      } catch (err) {
        console.error("❌ Error cargando listas:", err);
      }
    };

    if (user) loadLists();
  }, [user]);

  // 2️⃣ Cargar selección previa del borrador
  useEffect(() => {
    const loadCampaignLists = async () => {
      if (!campaignId) return;

      const ref = doc(db, "campaigns", campaignId);
      const snap = await getDoc(ref);

      if (!snap.exists()) return;

      const data = snap.data();

      if (data.lists?.selectedLists) {
        setSelected(data.lists.selectedLists);
      }
    };

    loadCampaignLists();
  }, [campaignId]);

  // 3️⃣ Seleccionar/deseleccionar listas
  const toggleList = (listId) => {
    setSelected((prev) =>
      prev.includes(listId)
        ? prev.filter((id) => id !== listId)
        : [...prev, listId]
    );
  };

  // 4️⃣ Guardar selección en Firestore y continuar
  const handleNext = async () => {
    if (selected.length === 0) {
      alert("Selecciona al menos una lista para continuar.");
      return;
    }

    const totalSubscribers = lists
      .filter((list) => selected.includes(list.id))
      .reduce((acc, list) => acc + (list.subscribersCount || 0), 0);

    await updateDoc(doc(db, "campaigns", campaignId), {
      lists: {
        selectedLists: selected,
        totalSubscribers,
      },
      step: 2,
      updatedAt: new Date(),
    });

    navigate(`/dashboard/campaigns/create/templates?id=${campaignId}&type=${type}`);
  };

  return (
    <div className="StepLists">
      <WizardSteps />

      <h1 className="StepLists__title">Selecciona las listas</h1>
      <p className="StepLists__subtitle">
        Elige las listas o segmentos a los que deseas enviar esta campaña.
      </p>

      <div className="StepLists__listContainer">
        {lists.length === 0 && (
          <p className="StepLists__empty">No tienes listas creadas todavía.</p>
        )}

        {lists.map((list) => (
          <div
            key={list.id}
            className={`StepLists__item ${
              selected.includes(list.id) ? "selected" : ""
            }`}
            onClick={() => toggleList(list.id)}
          >
            <h3>{list.name}</h3>
            <p>{list.subscribersCount || 0} suscriptores</p>
          </div>
        ))}
      </div>

      <div className="StepLists__buttons">
        <button className="secondary" onClick={() => navigate(-1)}>
          Atrás
        </button>
        <button
          className="primary"
          onClick={handleNext}
          disabled={selected.length === 0}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}
