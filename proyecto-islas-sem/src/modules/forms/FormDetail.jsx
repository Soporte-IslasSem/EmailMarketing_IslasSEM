import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc, deleteDoc } from "firebase/firestore";
import { db } from "../../config/firebaseConfig";
import "./styles/FormDetail.styles.css";


export default function FormDetail() {
  const { formId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadForm = async () => {
      try {
        const ref = doc(db, "forms", formId);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          setError("No se encontró el formulario.");
          setLoading(false);
          return;
        }

        setFormData(snap.data());
        setLoading(false);
      } catch (err) {
        console.error(err);
        setError("Error al cargar el formulario.");
        setLoading(false);
      }
    };

    loadForm();
  }, [formId]);

  if (loading) return <p>Cargando formulario...</p>;
  if (error) return <p className="FormDetail__error">{error}</p>;
  if (!formData) return null;

  // Código embebible dinámico
  const htmlCode = `
<!-- Formulario generado con Islas SEM -->
<div id="islassem-form-${formId}" style="max-width: 420px;">
  <form>
    <p style="
      color: ${formData.design.textColor};
      font-size: ${formData.design.fontSize}px;
      font-weight: ${formData.design.fontWeight};
      font-style: ${formData.design.fontStyle};
      text-decoration: ${formData.design.textDecoration};
      font-family: ${formData.design.fontFamily};
    ">
      ${formData.design.titleText}
    </p>

    <input
      type="email"
      placeholder="Tu correo electrónico"
      style="
        width: 100%;
        padding: 10px;
        border-radius: ${formData.design.borderRadius}px;
        border: 1px solid #d1d5db;
        margin-bottom: 10px;
      "
    />

    <button
      type="submit"
      style="
        width: 100%;
        padding: 10px;
        background: ${formData.design.buttonColor};
        color: #ffffff;
        border-radius: ${formData.design.borderRadius}px;
        border: none;
        font-weight: 600;
      "
    >
      Suscribirme
    </button>
  </form>
</div>
  `.trim();

  const scriptCode = `
<script>
  console.log("Formulario ${formId} cargado correctamente.");
</script>
  `.trim();

  const fullCode = `${htmlCode}\n\n${scriptCode}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(fullCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = async () => {
    if (!confirm("¿Seguro que deseas eliminar este formulario?")) return;

    await deleteDoc(doc(db, "forms", formId));
    alert("Formulario eliminado.");
    navigate("/dashboard/forms");
  };

  return (
    <div className="FormDetail__container">
      <h2 className="FormDetail__title">{formData.design.titleText}</h2>
      <p className="FormDetail__subtitle">ID: {formId}</p>

      <div className="FormDetail__grid">

        {/* Información */}
        <div className="FormDetail__infoBox">
          <h3>Información del formulario</h3>
          <p><strong>Tipo:</strong> {formData.type}</p>
          <p><strong>Plantilla:</strong> {formData.templateId}</p>
          <p><strong>Estado:</strong> {formData.status}</p>
        </div>

        {/* Vista previa */}
        <div className="FormDetail__previewBox">
          <h3>Vista previa</h3>

          <div
            className="FormDetail__preview"
            style={{
              background: formData.design.bgColor,
              borderRadius: `${formData.design.borderRadius}px`,
            }}
          >
            <p
              style={{
                color: formData.design.textColor,
                fontSize: `${formData.design.fontSize}px`,
                fontWeight: formData.design.fontWeight,
                fontStyle: formData.design.fontStyle,
                textDecoration: formData.design.textDecoration,
                fontFamily: formData.design.fontFamily,
              }}
            >
              {formData.design.titleText}
            </p>

            <input
              type="email"
              placeholder="Tu correo electrónico"
              disabled
              style={{
                borderRadius: `${formData.design.borderRadius}px`,
                border: "1px solid #d1d5db",
              }}
            />

            <button
              disabled
              style={{
                background: formData.design.buttonColor,
                borderRadius: `${formData.design.borderRadius}px`,
              }}
            >
              Suscribirme
            </button>
          </div>
        </div>

        {/* Código */}
        <div className="FormDetail__codeBox">
          <h3>Código embebible</h3>
          <pre>{fullCode}</pre>

          <button className="FormDetail__copyButton" onClick={handleCopy}>
            {copied ? "¡Copiado!" : "Copiar código"}
          </button>
        </div>
      </div>

      {/* Acciones */}
      <div className="FormDetail__actions">
        <button
          className="FormDetail__editButton"
          onClick={() => navigate(`/dashboard/lists/${formData.listId}/formularios/${formId}`)}
        >
          Editar formulario
        </button>

        <button className="FormDetail__deleteButton" onClick={handleDelete}>
          Eliminar
        </button>
      </div>
    </div>
  );
}
