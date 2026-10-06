import "./StepSend.styles.css";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import WizardSteps from "./WizardSteps";

// Firestore
import { db, auth } from "../../../../config/firebaseConfig";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs
} from "firebase/firestore";
import { useOrg } from "../../../crm/lib/useOrg";
import { enqueueCampaign, enqueueTest } from "../../lib/campaignSend";

// Modal
import CampaignSendModal from "./modals/CampaignSendModal";

export default function StepSend() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const campaignId = params.get("id");
  const { orgId } = useOrg();

  const [campaign, setCampaign] = useState(null);
  const [subscribers, setSubscribers] = useState([]);
  const [listsInfo, setListsInfo] = useState([]);

  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [testMessage, setTestMessage] = useState("");

  const [showModal, setShowModal] = useState(false);

  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState("");

  // 1️⃣ Cargar campaña + listas + suscriptores
  useEffect(() => {
    const loadData = async () => {
      if (!campaignId) return;

      const ref = doc(db, "campaigns", campaignId);
      const snap = await getDoc(ref);

      if (!snap.exists()) return;

      const data = snap.data();
      setCampaign(data);

      const selectedLists = data.lists?.selectedLists || [];

      if (selectedLists.length > 0) {
        // 🔹 Cargar info de listas
        const listsQuery = query(
          collection(db, "lists"),
          where("__name__", "in", selectedLists)
        );

        const listsSnap = await getDocs(listsQuery);

        const listsData = listsSnap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        setListsInfo(listsData);

        // Cargar suscriptores reales
        const subsQuery = query(
          collection(db, "subscribers"),
          where("listId", "in", selectedLists),
          where("userId", "==", auth.currentUser.uid)
        );

        const subsSnap = await getDocs(subsQuery);

        const subs = subsSnap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        setSubscribers(subs);
      }
    };

    loadData();
  }, [campaignId]);

  // 2️⃣ Enviar email de prueba
  const handleSendTest = async () => {
    if (!testEmail) {
      setTestMessage("Introduce un correo válido");
      return;
    }

    setSendingTest(true);
    setTestMessage("");

    try {
      await enqueueTest(orgId, campaign, testEmail);
      setTestMessage("Prueba en cola — se enviará en el próximo ciclo del backend (~1 min).");
    } catch (error) {
      console.error(error);
      setTestMessage("Error al poner la prueba en cola");
    }

    setSendingTest(false);
  };

  // 3️⃣ Envío real uno por uno
  const handleConfirmSend = async () => {
    setSending(true);
    setProgress("Poniendo la campaña en cola...");
    setShowModal(false);

    try {
      const { enqueued, skipped } = await enqueueCampaign(orgId, campaignId, campaign, subscribers);
      setProgress(`Campaña en cola: ${enqueued} destinatario(s)${skipped ? ` · ${skipped} omitido(s)` : ""}. El backend los enviará con throttle.`);
      setTimeout(() => navigate(`/dashboard/campaigns`), 1800);
    } catch (err) {
      console.error("❌ Error encolando campaña:", err);
      alert("Error al poner la campaña en cola: " + (err.message || err));
    }

    setSending(false);
  };

  return (
    <>
      <div className="StepSend">
        <WizardSteps />

        <h1 className="StepSend__title">Enviar campaña</h1>
        <p className="StepSend__subtitle">
          Revisa los detalles y programa el envío.
        </p>

        <div className="StepSend__summary">
          {!campaign && <p>Cargando datos...</p>}

          {campaign && (
            <>
              <h3>Resumen de la campaña</h3>

              <p><strong>Nombre:</strong> {campaign.config?.campaignName}</p>
              <p><strong>Asunto:</strong> {campaign.config?.subject}</p>
              <p><strong>Remitente:</strong> {campaign.config?.senderEmail}</p>
              <p><strong>Plantilla:</strong> {campaign.template?.templateName}</p>

              <h3>Listas seleccionadas</h3>
              <ul>
                {listsInfo.map((list) => (
                  <li key={list.id}>
                    {list.name} — {list.subscribersCount || 0} suscriptores
                  </li>
                ))}
              </ul>

              <h3>Destinatarios reales</h3>
              <p><strong>Total:</strong> {subscribers.length}</p>

              {sending && (
                <div className="StepSend__progress">
                  <h3>Estado del envío:</h3>
                  <p>{progress}</p>
                </div>
              )}

              <h3>Enviar email de prueba</h3>
              <input
                type="email"
                placeholder="Correo para prueba"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
              />

              <button
                className="secondary"
                onClick={handleSendTest}
                disabled={sendingTest}
              >
                {sendingTest ? "Enviando..." : "Enviar prueba"}
              </button>

              {testMessage && <p>{testMessage}</p>}
            </>
          )}
        </div>

        <div className="StepSend__buttons">
          <button className="secondary" onClick={() => navigate(-1)}>
            Atrás
          </button>

          <button
            className="primary"
            onClick={() => setShowModal(true)}
            disabled={sending}
          >
            Enviar campaña
          </button>
        </div>
      </div>

      {showModal && (
        <CampaignSendModal
          campaign={campaign}
          listsInfo={listsInfo}
          subscribers={subscribers}
          onClose={() => setShowModal(false)}
          onConfirm={handleConfirmSend}
        />
      )}
    </>
  );
}
