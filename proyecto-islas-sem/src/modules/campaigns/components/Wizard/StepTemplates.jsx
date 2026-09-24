import "./StepTemplates.styles.css";
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
  where
} from "firebase/firestore";

export default function StepTemplates() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const campaignId = params.get("id");
  const type = params.get("type") || "newsletter";

  const { user } = useAuth();

  const [templates, setTemplates] = useState([]);
  const [selected, setSelected] = useState(null);

  // 1️⃣ Cargar plantillas del usuario
  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const q = query(
          collection(db, "templates"),
          where("userId", "==", user.uid)
        );
        const snapshot = await getDocs(q);

        const userTemplates = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        setTemplates(userTemplates);
      } catch (err) {
        console.error("❌ Error cargando plantillas:", err);
      }
    };

    if (user) loadTemplates();
  }, [user]);

  // 2️⃣ Cargar selección previa del borrador
  useEffect(() => {
    const loadCampaignTemplate = async () => {
      if (!campaignId) return;

      const ref = doc(db, "campaigns", campaignId);
      const snap = await getDoc(ref);

      if (!snap.exists()) return;

      const data = snap.data();

      if (data.template?.templateId) {
        setSelected(data.template.templateId);
      }
    };

    loadCampaignTemplate();
  }, [campaignId]);

  // 3️⃣ Guardar selección y continuar
  const handleNext = async () => {
    if (!selected) {
      alert("Selecciona una plantilla para continuar.");
      return;
    }

    if (!campaignId) {
      alert("No se encontró el ID de la campaña.");
      console.error("❌ campaignId vacío o inválido");
      return;
    }

    const template = templates.find((t) => t.id === selected);
    if (!template) {
      alert("No se encontró la plantilla seleccionada.");
      return;
    }

    try {
      console.log("✅ Actualizando campaña:", campaignId);

      await updateDoc(doc(db, "campaigns", campaignId), {
        template: {
          templateId: template.id,
          templateName: template.name,
          type: template.type || "html",
          html: template.html ?? "",
          storagePath: template.storagePath || null,
          thumbnail: template.thumbnail || null,
        },
        step: 3,
        updatedAt: new Date(),
      });

      console.log("✅ Campaña actualizada correctamente");
      navigate(`/dashboard/campaigns/create/design?id=${campaignId}&type=${type}`);
    } catch (err) {
      console.error("❌ Error actualizando campaña:", err);
      alert("Error guardando la plantilla. Revisa la consola.");
    }
  };

  return (
    <div className="StepTemplates">
      <WizardSteps />

      <h1 className="StepTemplates__title">Selecciona una plantilla</h1>
      <p className="StepTemplates__subtitle">
        Elige una plantilla para comenzar a diseñar tu campaña.
      </p>

      <div className="StepTemplates__grid">
        {templates.length === 0 && (
          <p className="StepTemplates__empty">No tienes plantillas creadas todavía.</p>
        )}

        {templates.map((template) => (
          <div
            key={template.id}
            className={`StepTemplates__card ${
              selected === template.id ? "active" : ""
            }`}
            onClick={() => setSelected(template.id)}
          >
            {template.thumbnail ? (
              <img src={template.thumbnail} alt={template.name} />
            ) : (
              <div className="StepTemplates__thumbnail--placeholder">
                <p>Sin imagen</p>
              </div>
            )}

            <h3>{template.name}</h3>
            <p>{template.description || "Sin descripción"}</p>
          </div>
        ))}
      </div>

      <div className="StepTemplates__buttons">
        <button className="secondary" onClick={() => navigate(-1)}>
          Atrás
        </button>
        <button className="primary" onClick={handleNext} disabled={!selected}>
          Siguiente
        </button>
      </div>
    </div>
  );
}
