import "./StepTemplates.styles.css";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import WizardSteps from "./WizardSteps";
import { useAuth } from "../../../../shared/hooks/useAuth";
import TemplateThumb from "../../../templates/components/TemplateThumb/TemplateThumb";
import { systemTemplates, TEMPLATE_CATEGORIES } from "../../../../data/systemTemplates";

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

// Selección: id de "Mis plantillas" o "sys:<id>" para las plantillas de ISLAS SEM.
const SYS = "sys:";

export default function StepTemplates() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const campaignId = params.get("id");
  const type = params.get("type") || "newsletter";

  const { user } = useAuth();

  const [templates, setTemplates] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState(null); // "mine" | "system" (si es null se decide al cargar)
  const [category, setCategory] = useState("");
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);

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
      } finally {
        setLoaded(true);
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
      } else if (data.template?.systemTemplateId) {
        setSelected(SYS + data.template.systemTemplateId);
        setTab((t) => t || "system");
      }
    };

    loadCampaignTemplate();
  }, [campaignId]);

  // Sin plantillas propias se abre directamente la galería de ISLAS SEM.
  const activeTab = tab || (loaded && templates.length === 0 ? "system" : "mine");

  const visibleSystem = useMemo(
    () => systemTemplates.filter((t) => !category || t.tags.includes(category)),
    [category]
  );

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

    let template = null;
    if (selected.startsWith(SYS)) {
      const sys = systemTemplates.find((t) => t.id === selected.slice(SYS.length));
      if (sys) {
        template = {
          templateId: null,
          systemTemplateId: sys.id,
          templateName: sys.title,
          type: "html",
          html: sys.html || "",
          storagePath: null,
          thumbnail: null,
        };
      }
    } else {
      const t = templates.find((x) => x.id === selected);
      if (t) {
        template = {
          templateId: t.id,
          templateName: t.name,
          type: t.type || "html",
          html: t.html ?? "",
          storagePath: t.storagePath || null,
          thumbnail: t.thumbnail || null,
        };
      }
    }
    if (!template) {
      alert("No se encontró la plantilla seleccionada.");
      return;
    }

    setSaving(true);
    try {
      await updateDoc(doc(db, "campaigns", campaignId), {
        template,
        step: 3,
        updatedAt: new Date(),
      });

      navigate(`/dashboard/campaigns/create/design?id=${campaignId}&type=${type}`);
    } catch (err) {
      console.error("❌ Error actualizando campaña:", err);
      alert("Error guardando la plantilla. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="StepTemplates">
      <WizardSteps />

      <h1 className="StepTemplates__title">Selecciona una plantilla</h1>
      <p className="StepTemplates__subtitle">
        Elige una plantilla para comenzar a diseñar tu campaña. En el siguiente paso podrás editarla.
      </p>

      <div className="StepTemplates__tabs">
        <button className={activeTab === "mine" ? "active" : ""} onClick={() => setTab("mine")}>
          Mis plantillas ({templates.length})
        </button>
        <button className={activeTab === "system" ? "active" : ""} onClick={() => setTab("system")}>
          Plantillas de ISLAS SEM ({systemTemplates.length})
        </button>
        {activeTab === "system" && (
          <select className="StepTemplates__filter" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Todas las categorías</option>
            {TEMPLATE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
      </div>

      <div className="StepTemplates__grid">
        {activeTab === "mine" && loaded && templates.length === 0 && (
          <p className="StepTemplates__empty">
            No tienes plantillas propias todavía.{" "}
            <button className="StepTemplates__link" onClick={() => setTab("system")}>
              Elige una de las plantillas de ISLAS SEM
            </button>
          </p>
        )}

        {activeTab === "mine" &&
          templates.map((template) => (
            <div
              key={template.id}
              className={`StepTemplates__card ${selected === template.id ? "active" : ""}`}
              onClick={() => setSelected(template.id)}
            >
              {template.html ? (
                <TemplateThumb html={template.html} title={template.name} height={200} />
              ) : template.thumbnail ? (
                <img src={template.thumbnail} alt={template.name} />
              ) : (
                <div className="StepTemplates__thumbnail--placeholder">
                  <p>Sin imagen</p>
                </div>
              )}

              <h3>{template.name}</h3>
              <p>{template.description || (template.tags || []).join(" · ") || "Plantilla propia"}</p>
            </div>
          ))}

        {activeTab === "system" &&
          visibleSystem.map((t) => (
            <div
              key={t.id}
              className={`StepTemplates__card ${selected === SYS + t.id ? "active" : ""}`}
              onClick={() => setSelected(SYS + t.id)}
            >
              <TemplateThumb html={t.html} title={t.title} height={200} />
              <h3>{t.title}</h3>
              <p>{t.tags.join(" · ")}</p>
            </div>
          ))}
      </div>

      <div className="StepTemplates__buttons">
        <button className="secondary" onClick={() => navigate(-1)}>
          Atrás
        </button>
        <button className="primary" onClick={handleNext} disabled={!selected || saving}>
          {saving ? "Guardando…" : "Siguiente"}
        </button>
      </div>
    </div>
  );
}
