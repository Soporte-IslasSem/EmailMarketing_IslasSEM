import { useState } from "react";
import "./CampaignSendModal.styles.css";

export default function CampaignSendModal({
  campaign,
  listsInfo,
  subscribers,
  onClose,
  onConfirm
}) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    setSending(true);

    await onConfirm();

    setSending(false);
    setSent(true);
  };

  return (
    <div className="CampaignSendModal__overlay">
      <div className="CampaignSendModal__content">

        {/* MODAL 1 — RESUMEN */}
        {!sent && (
          <>
            <h2 className="CampaignSendModal__title">Resumen del envío</h2>

            <div className="CampaignSendModal__section">
              <p><strong>Nombre:</strong> {campaign?.config?.campaignName}</p>
              <p><strong>Asunto:</strong> {campaign?.config?.subject}</p>
              <p><strong>Remitente:</strong> {campaign?.config?.senderEmail}</p>
            </div>

            <div className="CampaignSendModal__section">
              <h3>Listas seleccionadas</h3>
              {listsInfo.map((l) => (
                <p key={l.id}>
                  {l.name} — {l.subscribersCount || 0} suscriptores
                </p>
              ))}
            </div>

            <div className="CampaignSendModal__section">
              <h3>Destinatarios reales</h3>
              <p><strong>Total:</strong> {subscribers.length}</p>
            </div>

            <button
              className="CampaignSendModal__confirm"
              onClick={handleSend}
              disabled={sending}
            >
              {sending ? "Enviando..." : "Enviar campaña"}
            </button>

            <button className="CampaignSendModal__close" onClick={onClose}>
              ✕
            </button>
          </>
        )}

        {/* MODAL 2 — CONFIRMACIÓN */}
        {sent && (
          <div className="CampaignSendModal__sent">
            <h2>Campaña enviada correctamente</h2>
            <p>Tu campaña está siendo enviada.</p>
            <p>Ya puedes acceder al informe del envío.</p>

            <div className="CampaignSendModal__illustration">
              <img src="/assets/placeholders/sent.png" alt="Campaña enviada" />
            </div>

            <button
              className="CampaignSendModal__report"
              onClick={() => window.location.href = `/dashboard/reports/${campaign.id}`}
            >
              Ir al informe
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
