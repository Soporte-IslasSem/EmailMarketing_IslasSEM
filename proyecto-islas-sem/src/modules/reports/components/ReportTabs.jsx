import "./ReportTabs.styles.css";

export default function ReportTabs({ activeTab, setActiveTab }) {
  const tabs = [
    { id: "resumen", label: "Resumen" },
    { id: "avanzado", label: "Avanzado" },
    { id: "mapa", label: "Mapa de clics" },
    { id: "urls", label: "Seguimiento URLs" },
    { id: "suscriptores", label: "Detalles suscriptores" },
  ];

  return (
    <div className="ReportTabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`ReportTabs__tab ${activeTab === tab.id ? "active" : ""}`}
          onClick={() => setActiveTab(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
