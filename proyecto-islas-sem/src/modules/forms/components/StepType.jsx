import { useEffect, useState } from "react";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../../config/firebaseConfig";
import "./../styles/StepType.styles.css";

const TYPE_OPTIONS = [
  {
    id: "classic",
    title: "Clásico",
    description: "Formulario embebido que puedes insertar en cualquier parte de tu web.",
    badge: "Recomendado",
  },
  {
    id: "popup",
    title: "Popup",
    description: "Se muestra como ventana emergente en tu sitio.",
    badge: "Próximamente",
    disabled: true,
  },
  {
    id: "bar",
    title: "Barra inferior",
    description: "Una barra fija en la parte inferior de tu página.",
    badge: "Próximamente",
    disabled: true,
  },
  {
    id: "exit_intent",
    title: "Exit intent",
    description: "Aparece cuando el usuario intenta salir de la página.",
    badge: "Próximamente",
    disabled: true,
  },
];

export default function StepType({ formId, onNext }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedType, setSelectedType] = useState("classic");
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadForm = async () => {
      try {
        setLoading(true);
        const ref = doc(db, "forms", formId);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          setError("No se encontró el formulario.");
          setLoading(false);
          return;
        }

        const data = snap.data();
        setSelectedType(data.type || "classic");
        setLoading(false);
      } catch (err) {
        console.error(err);
        setError("Error al cargar el formulario.");
        setLoading(false);
      }
    };

    if (formId) loadForm();
  }, [formId]);

  const handleSelect = (typeId, disabled) => {
    if (disabled) return;
    setSelectedType(typeId);
  };

  const handleContinue = async () => {
    try {
      setSaving(true);
      setError(null);

      const ref = doc(db, "forms", formId);
      await updateDoc(ref, {
        type: selectedType,
        step: 2,
        updatedAt: serverTimestamp(),
      });

      if (onNext) onNext();
    } catch (err) {
      console.error(err);
      setError("No se pudo guardar el tipo de formulario.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p>Cargando opciones de tipo...</p>;
  if (error) return <p className="StepType__error">{error}</p>;

  return (
    <div className="StepType__container">
      <h3 className="StepType__title">¿Qué tipo de formulario quieres crear?</h3>
      <p className="StepType__subtitle">
        Elige el tipo de formulario que mejor se adapte a cómo quieres captar suscriptores.
      </p>

      <div className="StepType__grid">
        {TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`StepType__card 
              ${selectedType === opt.id ? "selected" : ""} 
              ${opt.disabled ? "disabled" : ""}`}
            onClick={() => handleSelect(opt.id, opt.disabled)}
          >
            <div className="StepType__cardHeader">
              <h4>{opt.title}</h4>

              {opt.badge && (
                <span
                  className={`StepType__badge ${
                    opt.disabled ? "badge--secondary" : "badge--primary"
                  }`}
                >
                  {opt.badge}
                </span>
              )}
            </div>

            <p className="StepType__description">{opt.description}</p>

            {opt.disabled && (
              <p className="StepType__comingSoon">
                Disponible en próximas versiones
              </p>
            )}
          </button>
        ))}
      </div>

      {error && <p className="StepType__error">{error}</p>}

      <div className="StepType__actions">
        <button
          type="button"
          className="StepType__nextButton"
          onClick={handleContinue}
          disabled={saving}
        >
          {saving ? "Guardando..." : "Siguiente: Plantilla"}
        </button>
      </div>
    </div>
  );
}
