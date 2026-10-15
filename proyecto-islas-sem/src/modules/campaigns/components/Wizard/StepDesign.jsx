import "./StepDesign.styles.css";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useCallback, useRef, useState } from "react";
import WizardSteps from "./WizardSteps";

// Firestore
import { db } from "../../../../config/firebaseConfig";
import { doc, updateDoc } from "firebase/firestore";

// Editor visual: el mismo de Plantillas, guardando en la campaña (template.html).
// La plantilla de la que salió la campaña no se toca.
import TemplateEditor from "../../../templates/components/TemplateEditor/TemplateEditor";

export default function StepDesign() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const campaignId = params.get("id");
  const type = params.get("type") || "newsletter";
  const saveRef = useRef(null);
  const onSaveReady = useCallback((fn) => { saveRef.current = fn; }, []);
  const [busy, setBusy] = useState(false);

  // Guardar el diseño (el editor también guarda solo) y avanzar
  const handleNext = async () => {
    if (!campaignId) {
      alert("No se encontró el ID de la campaña.");
      return;
    }
    setBusy(true);
    try {
      await saveRef.current?.();
      await updateDoc(doc(db, "campaigns", campaignId), { step: 4, updatedAt: new Date() });
      navigate(`/dashboard/campaigns/create/send?id=${campaignId}&type=${type}`);
    } catch (err) {
      alert("No se pudo guardar el diseño: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="StepDesign">
      <WizardSteps />

      <h1 className="StepDesign__title">Diseña tu campaña</h1>
      <p className="StepDesign__subtitle">
        Personaliza el contenido y diseño del email. Los cambios se guardan solos en esta campaña (la plantilla original no cambia).
      </p>

      {campaignId ? (
        <TemplateEditor campaignId={campaignId} onSaveReady={onSaveReady} />
      ) : (
        <p className="StepDesign__loading">No se encontró la campaña.</p>
      )}

      <div className="StepDesign__buttons">
        <button className="secondary" onClick={() => navigate(-1)}>
          Atrás
        </button>
        <button className="primary" onClick={handleNext} disabled={busy}>
          {busy ? "Guardando…" : "Siguiente"}
        </button>
      </div>
    </div>
  );
}
