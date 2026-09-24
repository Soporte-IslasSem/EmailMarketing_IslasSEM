import "./StepDesign.styles.css";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import WizardSteps from "./WizardSteps";
import { useAuth } from "../../../../shared/hooks/useAuth";

// Firestore
import { db } from "../../../../config/firebaseConfig";
import { doc, getDoc, updateDoc } from "firebase/firestore";

// Editor visual
import Editor from "./Editor";

export default function StepDesign() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const campaignId = params.get("id");
  const type = params.get("type") || "newsletter";

  const { user } = useAuth();

  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(true);

  // 1️⃣ Cargar diseño desde Firestore (borrador o campaña existente)
  useEffect(() => {
    const loadDesign = async () => {
      if (!campaignId) return;

      const ref = doc(db, "campaigns", campaignId);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        console.warn("⚠ No existe la campaña:", campaignId);
        setLoading(false);
        return;
      }

      const data = snap.data();

      // Si existe template.html → cargarlo
      if (data.template?.html) {
        setHtml(data.template.html);
      } else {
        setHtml("");
      }

      setLoading(false);
    };

    loadDesign();
  }, [campaignId]);

  // 2️⃣ Guardar diseño y avanzar
  const handleNext = async () => {
    if (!campaignId) {
      alert("No se encontró el ID de la campaña.");
      return;
    }

    const ref = doc(db, "campaigns", campaignId);

    await updateDoc(ref, {
      "template.html": html, // 🔥 NO sobrescribe el objeto template completo
      step: 4,
      updatedAt: new Date(),
    });

    navigate(`/dashboard/campaigns/create/send?id=${campaignId}&type=${type}`);
  };

  return (
    <div className="StepDesign">
      <WizardSteps />

      <h1 className="StepDesign__title">Diseña tu campaña</h1>
      <p className="StepDesign__subtitle">
        Personaliza el contenido y diseño del email.
      </p>

      {loading ? (
        <p className="StepDesign__loading">Cargando diseño...</p>
      ) : (
        <div className="StepDesign__editor">
          <Editor html={html} onChange={setHtml} />
        </div>
      )}

      <div className="StepDesign__buttons">
        <button className="secondary" onClick={() => navigate(-1)}>
          Atrás
        </button>
        <button className="primary" onClick={handleNext}>
          Siguiente
        </button>
      </div>
    </div>
  );
}
