import "./Campaigns.styles.css";
import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import useCampaigns from "../../hooks/useCampaigns";
import CampaignTable from "../CampaignTable/CampaignTable";
import CampaignTags from "../CampaignTags/CampaignTags";

// Firebase
import { db } from "../../../../config/firebaseConfig";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { getAuth } from "firebase/auth";

export default function Campaigns() {
  const { campaigns } = useCampaigns();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState("");

  // 🔹 Contador de etiquetas del usuario actual
  const [globalTagsCount, setGlobalTagsCount] = useState(0);

  useEffect(() => {
    const auth = getAuth();

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (!user) {
        setGlobalTagsCount(0);
        return;
      }

      const tagsQuery = query(
        collection(db, "templateTags"),
        where("userEmail", "==", user.email)
      );

      const unsubTags = onSnapshot(tagsQuery, (snapshot) => {
        setGlobalTagsCount(snapshot.docs.length);
      });

      return () => unsubTags();
    });

    return () => unsubscribeAuth();
  }, []);

  // Normalizar tipo de campaña
  const getType = (campaign) => campaign.type || "newsletter";

  // Contadores dinámicos por tipo
  const countByType = (type) =>
    campaigns.filter((c) => getType(c) === type).length;

  const tabs = [
    { key: "all", label: `Todas (${campaigns.length})` },
    { key: "newsletter", label: `Newsletter (${countByType("newsletter")})` },
    { key: "rss", label: `RSS (${countByType("rss")})` },
    { key: "autoresponder", label: `Autoresponder (${countByType("autoresponder")})` },
    { key: "ab_test", label: `Test A/B (${countByType("ab_test")})` },
    { key: "tags", label: `Etiquetas (${globalTagsCount})` },
  ];

  // 🔥 FLUJO PARA CONTINUAR CAMPAÑA
  const continueCampaign = (campaign) => {
    const id = campaign.id;
    const type = campaign.template?.type || "newsletter";

    switch (campaign.step) {
      case 1:
        navigate(`/dashboard/campaigns/create/config?id=${id}&type=${type}`);
        break;
      case 2:
        navigate(`/dashboard/campaigns/create/lists?id=${id}&type=${type}`);
        break;
      case 3:
        navigate(`/dashboard/campaigns/create/templates?id=${id}&type=${type}`);
        break;
      case 4:
        navigate(`/dashboard/campaigns/create/design?id=${id}&type=${type}`);
        break;
      case 5:
        navigate(`/dashboard/campaigns/create/send?id=${id}&type=${type}`);
        break;
      default:
        navigate(`/dashboard/campaigns/create/config?id=${id}&type=${type}`);
    }
  };

  // Filtrado dinámico
  const filteredCampaigns = campaigns.filter((c) => {
    const type = getType(c);
    const matchesType = activeTab === "all" || type === activeTab;
    const matchesSearch = c.config?.campaignName
      ?.toLowerCase()
      .includes(search.toLowerCase());
    const matchesTag =
      !selectedTag || (c.tags && c.tags.includes(selectedTag));

    return matchesType && matchesSearch && matchesTag;
  });

  // Empty states
  const emptyStateContent = {
    all: {
      img: "/assets/campaigns/empty.png",
      title: "Aún no tienes ninguna campaña",
      text: "Crea tu primera campaña haciendo clic sobre el botón “Nueva campaña”.",
      buttonLabel: "Nueva campaña",
    },
    newsletter: {
      img: "/assets/campaigns/newsletter.png",
      title: "Aún no tienes campañas Newsletter",
      text: "Crea tu primera campaña tipo Newsletter para comunicar novedades a tus suscriptores.",
      buttonLabel: "Nueva campaña",
    },
    rss: {
      img: "/assets/campaigns/rss.png",
      title: "Aún no tienes campañas RSS",
      text: "Conecta tu feed RSS para enviar automáticamente tus últimas publicaciones.",
      buttonLabel: "Nueva campaña",
    },
    autoresponder: {
      img: "/assets/campaigns/autoresponder.png",
      title: "Aún no tienes campañas Autoresponder",
      text: "Configura respuestas automáticas para tus nuevos suscriptores.",
      buttonLabel: "Nueva campaña",
    },
    ab_test: {
      img: "/assets/campaigns/test-ab.png",
      title: "Aún no tienes campañas Test A/B",
      text: "Crea una campaña A/B para comparar versiones y mejorar tus resultados.",
      buttonLabel: "Nueva campaña",
    },
  };

  const currentEmpty = emptyStateContent[activeTab] || emptyStateContent.all;

  return (
    <div className="Campaigns">
      {/* HEADER */}
      <div className="Campaigns__header">
        <div>
          <h1>Campañas</h1>
          <p className="Campaigns__subtitle">
            Accede a tus campañas y consulta su estado.
          </p>
        </div>

        {activeTab !== "tags" && filteredCampaigns.length > 0 && (
          <Link
            to="/dashboard/campaigns/create"
            className="Campaigns__newButton"
          >
            Nueva campaña
          </Link>
        )}
      </div>

      {/* TABS */}
      <div className="Campaigns__tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={activeTab === tab.key ? "active" : ""}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* SEARCH + FILTER */}
      <div className="Campaigns__filters">
        <input
          type="text"
          placeholder={
            activeTab === "tags" ? "Buscar etiqueta" : "Buscar campaña"
          }
          className="Campaigns__search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {activeTab !== "tags" && (
          <select
            className="Campaigns__select"
            value={selectedTag}
            onChange={(e) => setSelectedTag(e.target.value)}
          >
            <option value="">Seleccionar etiqueta</option>
            {[...new Set(campaigns.flatMap((c) => c.tags || []))].map(
              (tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              )
            )}
          </select>
        )}
      </div>

      {/* CONTENT */}
      {activeTab === "tags" ? (
        <CampaignTags />
      ) : filteredCampaigns.length > 0 ? (
        <CampaignTable
          campaigns={filteredCampaigns.map((c) => ({
            ...c,
            createdAtFormatted: c.createdAt
              ? new Date(c.createdAt.seconds * 1000).toLocaleDateString()
              : "-",
          }))}
          onContinue={continueCampaign} // 🔥 NUEVO
        />
      ) : (
        <div className="Campaigns__empty">
          <img src={currentEmpty.img} alt={currentEmpty.title} />
          <h3>{currentEmpty.title}</h3>
          <p>{currentEmpty.text}</p>

          <Link
            to="/dashboard/campaigns/create"
            className="Campaigns__newButton Campaigns__newButton--empty"
          >
            {currentEmpty.buttonLabel}
          </Link>
        </div>
      )}
    </div>
  );
}
