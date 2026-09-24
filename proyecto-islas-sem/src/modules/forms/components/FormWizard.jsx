// src/modules/forms/components/FormWizard.jsx
import { useEffect, useState } from "react";
import { collection, addDoc, doc, getDoc } from "firebase/firestore";
import { db } from "../../../config/firebaseConfig";
import { useAuth } from "../../../shared/hooks/useAuth.jsx";

import StepType from "./StepType.jsx";
import StepTemplates from "./StepTemplates.jsx";
import StepConfig from "./StepConfig.jsx";
import StepDesign from "./StepDesign.jsx";
import StepIntegrate from "./StepIntegrate.jsx";

import "../styles/FormWizard.styles.css";

const STEPS = [
  { id: 1, label: "Tipo" },
  { id: 2, label: "Plantilla" },
  { id: 3, label: "Configuración" },
  { id: 4, label: "Diseño" },
  { id: 5, label: "Integración" },
];

export default function FormWizard({ listId, initialFormId = null, onClose }) {
  const { user } = useAuth();

  const [formId, setFormId] = useState(initialFormId);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        setError(null);

        if (initialFormId) {
          const ref = doc(db, "forms", initialFormId);
          const snap = await getDoc(ref);

          if (!snap.exists()) {
            setError("No se encontró el formulario.");
            setLoading(false);
            return;
          }

          const data = snap.data();
          setFormId(initialFormId);
          setStep(data.step || 1);
          setLoading(false);
          return;
        }

        if (!user) {
          setError("Debes iniciar sesión para crear un formulario.");
          setLoading(false);
          return;
        }

        setCreating(true);

        const ref = await addDoc(collection(db, "forms"), {
          userId: user.uid,
          listId: listId || null,
          name: "",
          type: "classic",
          templateId: "simple",
          successMessage: "¡Gracias por suscribirte!",
          redirectUrl: "",
          doubleOptIn: false,
          design: {
            bgColor: "#ffffff",
            textColor: "#000000",
            buttonColor: "#1A9190",
            borderRadius: 8,
          },
          step: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        setFormId(ref.id);
        setStep(1);
        setCreating(false);
        setLoading(false);
      } catch (err) {
        console.error(err);
        setError("No se pudo iniciar el asistente de formularios.");
        setLoading(false);
        setCreating(false);
      }
    };

    init();
  }, [initialFormId, listId, user]);

  const renderStep = () => {
    if (!formId) return null;

    switch (step) {
      case 1:
        return <StepType formId={formId} onNext={() => setStep(2)} />;
      case 2:
        return (
          <StepTemplates
            formId={formId}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        );
      case 3:
        return (
          <StepConfig
            formId={formId}
            onBack={() => setStep(2)}
            onNext={() => setStep(4)}
          />
        );
      case 4:
        return (
          <StepDesign
            formId={formId}
            onBack={() => setStep(3)}
            onNext={() => setStep(5)}
          />
        );
      case 5:
      default:
        return <StepIntegrate formId={formId} onBack={() => setStep(4)} />;
    }
  };

  return (
    <div className="FormWizard__container">
      <div className="FormWizard__header">
        <div>
          <h2 className="FormWizard__title">Crea un nuevo formulario</h2>
          <p className="FormWizard__subtitle">
            Sigue los pasos para configurar tu formulario de suscripción.
          </p>
        </div>

        {onClose && (
          <button
            type="button"
            className="FormWizard__close"
            onClick={onClose}
          >
            ✕
          </button>
        )}
      </div>

      <div className="FormWizard__steps">
        {STEPS.map((s) => (
          <div
            key={s.id}
            className={`FormWizard__step ${
              step === s.id ? "active" : step > s.id ? "completed" : ""
            }`}
          >
            <div className="FormWizard__stepCircle">{s.id}</div>
            <span className="FormWizard__stepLabel">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="FormWizard__body">
        {loading && (
          <p className="FormWizard__loading">
            {creating ? "Creando formulario..." : "Cargando asistente..."}
          </p>
        )}

        {error && <p className="FormWizard__error">{error}</p>}

        {!loading && !error && renderStep()}
      </div>
    </div>
  );
}
