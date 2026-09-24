import "./StepConfig.styles.css";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import WizardSteps from "./WizardSteps";
import { useAuth } from "../../../../shared/hooks/useAuth";
import { v4 as uuidv4 } from "uuid";
import useCampaigns from "../../hooks/useCampaigns";

export default function StepConfig() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const type = params.get("type") || "newsletter";
  const campaignId = params.get("id"); // 🔹 Detectar si hay ID en la URL

  const { user } = useAuth();
  const { saveDraft, getCampaign } = useCampaigns(); // 🔹 Añadido getCampaign

  const [form, setForm] = useState({
    name: "",
    subject: "",
    senderEmail: user?.email || "",
    senderName: "",
    preheader: "",
  });

  // 🔹 Cargar datos si existe un borrador
  useEffect(() => {
    const loadCampaign = async () => {
      if (!campaignId) return;
      const data = await getCampaign(campaignId);
      if (data?.config) {
        setForm({
          name: data.config.campaignName || "",
          subject: data.config.subject || "",
          senderEmail: data.config.senderEmail || user?.email || "",
          senderName: data.config.senderName || "",
          preheader: data.config.preheader || "",
        });
      }
    };
    loadCampaign();
  }, [campaignId, user, getCampaign]);

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  // 🔹 Guardar borrador
  const handleSaveDraft = async () => {
    if (!form.name.trim()) {
      alert("Por favor, escribe un nombre para la campaña.");
      return;
    }

    const idToUse = campaignId || uuidv4(); // 🔹 Reutilizar ID si ya existe

    await saveDraft({
      id: idToUse,
      config: {
        campaignName: form.name,
        subject: form.subject,
        senderEmail: form.senderEmail,
        senderName: form.senderName,
        preheader: form.preheader,
        createdAt: new Date(),
        design: {
          editorType: "dragdrop",
          html: "",
        },
      },
      lists: {
        selectedLists: [],
        totalSubscribers: 0,
      },
      template: {
        templateId: null,
        templateName: null,
        type: type,
      },
      send: {
        scheduleType: "now",
        scheduledAt: null,
        status: "draft",
      },
    });

    alert("✅ Borrador guardado correctamente");
    navigate("/dashboard/campaigns"); // 🔹 Redirigir a la lista de campañas
  };

  // 🔹 Ir al siguiente paso
  const handleNext = async () => {
    if (!form.name.trim()) {
      alert("Por favor, escribe un nombre para la campaña.");
      return;
    }

    const idToUse = campaignId || uuidv4(); // 🔹 Reutilizar ID si ya existe

    await saveDraft({
      id: idToUse,
      config: {
        campaignName: form.name,
        subject: form.subject,
        senderEmail: form.senderEmail,
        senderName: form.senderName,
        preheader: form.preheader,
        createdAt: new Date(),
        design: {
          editorType: "dragdrop",
          html: "",
        },
      },
      lists: {
        selectedLists: [],
        totalSubscribers: 0,
      },
      template: {
        templateId: null,
        templateName: null,
        type: type,
      },
      send: {
        scheduleType: "now",
        scheduledAt: null,
        status: "draft",
      },
    });

    navigate(`/dashboard/campaigns/create/lists?id=${idToUse}&type=${type}`);
  };

  return (
    <div className="StepConfig">
      <WizardSteps />

      <h1 className="StepConfig__title">Creando campaña</h1>
      <p className="StepConfig__subtitle">
        Crea todo tipo de campañas de email marketing y analiza hasta el último detalle.
      </p>

      <div className="StepConfig__form">
        <label>
          Nombre de la campaña
          <input
            type="text"
            name="name"
            value={form.name}
            onChange={handleChange}
            maxLength={256}
          />
        </label>

        <label>
          Asunto del email
          <input
            type="text"
            name="subject"
            value={form.subject}
            onChange={handleChange}
            maxLength={128}
          />
        </label>

        <label>
          Email del remitente
          <input
            type="email"
            name="senderEmail"
            value={form.senderEmail}
            onChange={handleChange}
          />
        </label>

        <label>
          Nombre del remitente
          <input
            type="text"
            name="senderName"
            value={form.senderName}
            onChange={handleChange}
            maxLength={128}
          />
        </label>

        <label>
          Precabecera (opcional)
          <input
            type="text"
            name="preheader"
            value={form.preheader}
            onChange={handleChange}
            maxLength={128}
          />
        </label>
      </div>

      <div className="StepConfig__buttons">
        <button className="secondary" onClick={handleSaveDraft}>
          Guardar borrador
        </button>

        <button className="primary" onClick={handleNext}>
          Siguiente
        </button>
      </div>
    </div>
  );
}
