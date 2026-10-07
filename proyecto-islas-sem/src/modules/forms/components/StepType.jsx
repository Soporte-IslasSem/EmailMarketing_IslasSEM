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
  },
  {
    id: "bar",
    title: "Barra inferior",
    description: "Una barra fija en la parte inferior de tu página.",
  },
  {
    id: "exit_intent",
    title: "Exit intent",
    description: "Aparece cuando el usuario intenta salir de la página.",
  },
];

export default function StepType({ formId, onNext }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedType, setSelectedType] = useState("classic");
  // Opciones de visualización para popup / barra / exit intent
  const [display, setDisplay] = useState({ delaySeconds: 5, hideDays: 7 });
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
        if (data.display) setDisplay((d) => ({ ...d, ...data.display }));
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
        display: {
          delaySeconds: Math.max(0, Number(display.delaySeconds) || 0),
          hideDays: Math.max(0, Number(display.hideDays) || 0),
        },
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

      {selectedType !== "classic" && (
        <div className="StepType__options">
          <h4>Cuándo se muestra</h4>
          {selectedType === "popup" && (
            <label>
              Aparece a los{" "}
              <input type="number" min="0" value={display.delaySeconds} onChange={(e) => setDisplay({ ...display, delaySeconds: e.target.value })} />{" "}
              segundos de entrar en la página
            </label>
          )}
          {selectedType === "bar" && <p>La barra se muestra fija en la parte inferior desde que carga la página.</p>}
          {selectedType === "exit_intent" && (
            <p>Aparece cuando el visitante mueve el ratón para salir de la página (en móvil, a los 20 segundos de navegar).</p>
          )}
          <label>
            Si lo cierra, no volver a mostrarlo durante{" "}
            <input type="number" min="0" value={display.hideDays} onChange={(e) => setDisplay({ ...display, hideDays: e.target.value })} />{" "}
            días
          </label>
          <p className="StepType__hint">Quien ya se ha suscrito no lo vuelve a ver.</p>
        </div>
      )}

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
