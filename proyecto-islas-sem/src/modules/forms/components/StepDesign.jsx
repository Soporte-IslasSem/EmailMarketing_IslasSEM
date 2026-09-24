import { useEffect, useState } from "react";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../../config/firebaseConfig";
import "./../styles/StepDesign.styles.css";

export default function StepDesign({ formId, onNext, onBack }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 🎨 Diseño visual
  const [bgColor, setBgColor] = useState("#ffffff");
  const [textColor, setTextColor] = useState("#000000");
  const [buttonColor, setButtonColor] = useState("#1A9190");
  const [borderRadius, setBorderRadius] = useState(8);

  // ✏️ Texto y tipografía
  const [titleText, setTitleText] = useState("Suscríbete a nuestra newsletter");
  const [fontFamily, setFontFamily] = useState("Inter");
  const [fontSize, setFontSize] = useState(17);
  const [fontWeight, setFontWeight] = useState("600");
  const [fontStyle, setFontStyle] = useState("normal");
  const [textDecoration, setTextDecoration] = useState("none");

  const [error, setError] = useState(null);

  useEffect(() => {
    const loadDesign = async () => {
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

        // 🎨 Diseño
        setBgColor(data.design?.bgColor || "#ffffff");
        setTextColor(data.design?.textColor || "#000000");
        setButtonColor(data.design?.buttonColor || "#1A9190");
        setBorderRadius(data.design?.borderRadius || 8);

        // ✏️ Texto y tipografía
        setTitleText(data.design?.titleText || "Suscríbete a nuestra newsletter");
        setFontFamily(data.design?.fontFamily || "Inter");
        setFontSize(data.design?.fontSize || 17);
        setFontWeight(data.design?.fontWeight || "600");
        setFontStyle(data.design?.fontStyle || "normal");
        setTextDecoration(data.design?.textDecoration || "none");

        setLoading(false);
      } catch (err) {
        console.error(err);
        setError("Error al cargar el diseño.");
        setLoading(false);
      }
    };

    if (formId) loadDesign();
  }, [formId]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      const ref = doc(db, "forms", formId);

      await updateDoc(ref, {
        design: {
          bgColor,
          textColor,
          buttonColor,
          borderRadius,
          titleText,
          fontFamily,
          fontSize,
          fontWeight,
          fontStyle,
          textDecoration,
        },
        step: 5,
        updatedAt: serverTimestamp(),
      });

      if (onNext) onNext();
    } catch (err) {
      console.error(err);
      setError("No se pudo guardar el diseño.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p>Cargando diseño...</p>;
  if (error) return <p className="StepDesign__error">{error}</p>;

  return (
    <div className="StepDesign__container">
      <h3 className="StepDesign__title">Personaliza el diseño</h3>
      <p className="StepDesign__subtitle">
        Ajusta los colores, el texto y los estilos del formulario.
      </p>

      <div className="StepDesign__layout">

        {/* Panel izquierdo */}
        <div className="StepDesign__panel">

          {/* Texto del título */}
          <div className="StepDesign__field">
            <label>Texto del título</label>
            <input
              type="text"
              value={titleText}
              onChange={(e) => setTitleText(e.target.value)}
              placeholder="Ej: Suscríbete a nuestra newsletter"
            />
          </div>

          {/* Fuente */}
          <div className="StepDesign__field">
            <label>Fuente</label>
            <select value={fontFamily} onChange={(e) => setFontFamily(e.target.value)}>
              <option value="Inter">Inter</option>
              <option value="Roboto">Roboto</option>
              <option value="Poppins">Poppins</option>
              <option value="Open Sans">Open Sans</option>
              <option value="Montserrat">Montserrat</option>
            </select>
          </div>

          {/* Tamaño */}
          <div className="StepDesign__field">
            <label>Tamaño de letra</label>
            <input
              type="range"
              min="12"
              max="32"
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
            />
            <span className="StepDesign__rangeValue">{fontSize}px</span>
          </div>

          {/* Estilos de texto */}
          <div className="StepDesign__field StepDesign__textStyleGroup">
            <label>Estilo del texto</label>
            <div className="StepDesign__textStyleButtons">
              <button
                type="button"
                className={fontWeight === "700" ? "active" : ""}
                onClick={() => setFontWeight(fontWeight === "700" ? "600" : "700")}
              >
                <strong>B</strong>
              </button>

              <button
                type="button"
                className={fontStyle === "italic" ? "active" : ""}
                onClick={() => setFontStyle(fontStyle === "italic" ? "normal" : "italic")}
              >
                <em>I</em>
              </button>

              <button
                type="button"
                className={textDecoration === "underline" ? "active" : ""}
                onClick={() =>
                  setTextDecoration(textDecoration === "underline" ? "none" : "underline")
                }
              >
                <u>U</u>
              </button>
            </div>
          </div>

          {/* Colores */}
          <div className="StepDesign__field">
            <label>Color de fondo</label>
            <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} />
          </div>

          <div className="StepDesign__field">
            <label>Color del texto</label>
            <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} />
          </div>

          <div className="StepDesign__field">
            <label>Color del botón</label>
            <input type="color" value={buttonColor} onChange={(e) => setButtonColor(e.target.value)} />
          </div>

          {/* Radio */}
          <div className="StepDesign__field">
            <label>Radio del borde</label>
            <input
              type="range"
              min="0"
              max="30"
              value={borderRadius}
              onChange={(e) => setBorderRadius(Number(e.target.value))}
            />
            <span className="StepDesign__rangeValue">{borderRadius}px</span>
          </div>
        </div>

        {/* Vista previa */}
        <div className="StepDesign__preview">
          <div
            className="StepDesign__previewBox"
            style={{
              background: bgColor,
              color: textColor,
              borderRadius: `${borderRadius}px`,
            }}
          >
            <p
              className="StepDesign__previewTitle"
              style={{
                fontFamily,
                fontSize: `${fontSize}px`,
                fontWeight,
                fontStyle,
                textDecoration,
                color: textColor,
              }}
            >
              {titleText}
            </p>

            <input
              type="email"
              placeholder="Tu correo electrónico"
              disabled
              style={{
                borderRadius: `${borderRadius}px`,
                border: "1px solid #d1d5db",
              }}
            />

            <button
              disabled
              style={{
                background: buttonColor,
                borderRadius: `${borderRadius}px`,
              }}
            >
              Suscribirme
            </button>
          </div>
        </div>
      </div>

      {error && <p className="StepDesign__error">{error}</p>}

      <div className="StepDesign__actions">
        {onBack && (
          <button
            type="button"
            className="StepDesign__backButton"
            onClick={onBack}
            disabled={saving}
          >
            Volver a configuración
          </button>
        )}

        <button
          type="button"
          className="StepDesign__nextButton"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Guardando..." : "Siguiente: Integración"}
        </button>
      </div>
    </div>
  );
}
