import "./CampaignTable.styles.css";
import { Link } from "react-router-dom";
import { useState } from "react";
import CampaignActionsMenu from "../modals/CampaignActionsMenu";

export default function CampaignTable({ campaigns, onContinue }) {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // 🔧 Función para convertir timestamps en fechas legibles
  const formatDate = (timestamp) => {
    if (!timestamp) return "-";
    if (timestamp.seconds) {
      return new Date(timestamp.seconds * 1000).toLocaleDateString();
    }
    return timestamp.toString();
  };

  // 🔹 Calcular índices de paginación
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentCampaigns = campaigns.slice(indexOfFirstItem, indexOfLastItem);

  // 🔁 Cambiar página
  const totalPages = Math.ceil(campaigns.length / itemsPerPage);

  const nextPage = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };

  const prevPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  // 🗣️ Traducción de estados y tipos de envío
  const translateStatus = (status) => {
    switch (status) {
      case "sent":
        return "Enviada";
      case "draft":
        return "Borrador";
      case "inactive":
        return "Inactiva";
      case "pending":
        return "Pendiente";
      case "scheduled":
        return "Programada";
      case "sending":
        return "Enviando";
      default:
        return "Pendiente";
    }
  };

  const translateScheduleType = (type) => {
    switch (type) {
      case "now":
        return "Ahora";
      case "scheduled":
        return "Programada";
      default:
        return "-";
    }
  };

  return (
    <div className="CampaignTable">
      <table className="CampaignTable__table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Estado</th>
            <th>Fecha creación</th>
            <th>Tipo</th>
            <th>Listas</th>
            <th>Emails</th>
            <th>Acciones</th>
          </tr>
        </thead>

        <tbody>
          {currentCampaigns.map((c) => (
            <tr key={c.id}>
              <td>{c.config?.campaignName || "Sin nombre"}</td>

              <td>
                <span
                  className={`CampaignTable__status ${
                    c.status === "sent"
                      ? "sent"
                      : c.status === "draft"
                      ? "draft"
                      : c.status === "inactive"
                      ? "inactive"
                      : "pending"
                  }`}
                >
                  {translateStatus(c.status)}
                </span>
              </td>

              <td>
                {c.config?.createdAt
                  ? formatDate(c.config.createdAt)
                  : formatDate(c.createdAt)}
              </td>

              <td>{c.type || "newsletter"}</td>

              <td>{c.lists?.totalSubscribers || 0}</td>

              <td>{c.send?.scheduleType === "scheduled" && c.send?.scheduledAt ? new Date(c.send.scheduledAt).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }) : translateScheduleType(c.send?.scheduleType)}</td>

              <td className="CampaignTable__actionsCell">

                {/* 🔥 BOTÓN CONTINUAR SOLO PARA BORRADORES */}
                {c.status === "draft" && (
                  <button
                    className="CampaignTable__continueButton"
                    onClick={() => onContinue(c)}
                  >
                    Continuar
                  </button>
                )}

                {/* 🔥 MENÚ DE ACCIONES */}
                <CampaignActionsMenu
                  campaignId={c.id}
                  status={c.status}
                  reportId={c.reportId}
                  onDelete={(id) => console.log("Eliminar campaña:", id)}
                  onDeactivate={(id) => console.log("Dar de baja campaña:", id)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 🔹 Paginación visual estilo ISLAS SEM */}
      <div className="CampaignTable__pagination">
        <button
          onClick={prevPage}
          disabled={currentPage === 1}
          className={`CampaignTable__pageButton ${
            currentPage === 1 ? "disabled" : ""
          }`}
        >
          Anterior
        </button>

        <span className="CampaignTable__pageInfo">
          Página {currentPage} de {totalPages}
        </span>

        <button
          onClick={nextPage}
          disabled={currentPage === totalPages}
          className={`CampaignTable__pageButton ${
            currentPage === totalPages ? "disabled" : ""
          }`}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}
