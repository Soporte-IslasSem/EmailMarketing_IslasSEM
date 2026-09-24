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
import { getFunctions, httpsCallable } from "firebase/functions";

// Modal
import CampaignSendModal from "./modals/CampaignSendModal";

export default function StepSend() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const campaignId = params.get("id");

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
      const functions = getFunctions();
      const sendTestEmailFn = httpsCallable(functions, "sendTestEmail");

      await sendTestEmailFn({
        to: testEmail,
        subject: campaign.config.subject,
        html: campaign.template?.html,
        from: campaign.config.senderEmail,
      });

      setTestMessage("Correo de prueba enviado correctamente");
    } catch (error) {
      console.error(error);
      setTestMessage("Error al enviar el correo de prueba");
    }

    setSendingTest(false);
  };

  // 3️⃣ Envío real uno por uno
  const handleConfirmSend = async () => {
    setSending(true);
    setProgress("Enviando campaña...");

    try {
      const functions = getFunctions();
      const sendCampaignEmailFn = httpsCallable(functions, "sendCampaignEmail");

      const result = await sendCampaignEmailFn({
        campaign: { id: campaignId, ...campaign },
        subscribers,
      });

      const data = result.data; // { success: true, reportId: "..." }

      setProgress("Campaña enviada ✔");

      await updateDoc(doc(db, "campaigns", campaignId), {
        status: "sent",
        send: {
          scheduleType: "now",
          scheduledAt: null,
          status: "sent",
        },
        step: 5,
        updatedAt: new Date(),
      });

      setTimeout(() => {
        navigate(`/dashboard/reports/${data.reportId}`); // 👈 antes era campaignId
      }, 1500);
    } catch (err) {
      console.error("❌ Error enviando campaña:", err);
      alert("Error enviando campaña");
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
