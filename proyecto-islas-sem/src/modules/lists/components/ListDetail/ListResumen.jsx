import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db, auth } from "../../../../config/firebaseConfig";
import { useParams, useNavigate } from "react-router-dom";
import TrendChart from "../../components/TrendChart";
import GlobalStatsChart from "../../components/GlobalStatsChart";
import "./ListResumen.styles.css";

export default function ListResumen() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [subscribers, setSubscribers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Cargar suscriptores en tiempo real
  useEffect(() => {
    const ref = collection(db, "subscribers");
    const q = query(
      ref,
      where("listId", "==", id),
      where("userId", "==", auth.currentUser.uid)
    );

    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setSubscribers(data);
      setLoading(false);
    });

    return () => unsub();
  }, [id]);

  if (loading) return <p>Cargando resumen...</p>;

  // --- Cálculos ---
  const total = subscribers.length;
  const activos = subscribers.filter((s) => s.status === "subscribed").length;
  const inactivos = subscribers.filter((s) => s.status === "unsubscribed").length;

  const now = new Date();
  const last30 = new Date();
  last30.setDate(now.getDate() - 30);

  const altasMes = subscribers.filter(
    (s) => s.createdAt?.toDate && s.createdAt.toDate() >= last30
  ).length;

  const bajasMes = subscribers.filter(
    (s) =>
      s.status === "unsubscribed" &&
      s.updatedAt?.toDate &&
      s.updatedAt.toDate() >= last30
  ).length;

  return (
    <div className="ListResumen">

      <h2>Resumen general</h2>

      {/* GRID DE TARJETAS */}
      <div className="stats-grid">

        <div className="stat-card">
          <h3>{total}</h3>
          <p>Suscriptores totales</p>
        </div>

        <div className="stat-card">
          <h3>{activos}</h3>
          <p>Activos</p>
        </div>

        <div className="stat-card">
          <h3>{inactivos}</h3>
          <p>Inactivos</p>
        </div>

        <div className="stat-card">
          <h3>{altasMes}</h3>
          <p>Altas últimos 30 días</p>
        </div>

        <div className="stat-card">
          <h3>{bajasMes}</h3>
          <p>Bajas últimos 30 días</p>
        </div>

      </div>

      {/* ACCIONES RÁPIDAS */}
      <h3 className="acciones-title">Acciones rápidas</h3>

      <div className="acciones-grid">

        <div
          className="accion-card"
          onClick={() => navigate(`/dashboard/lists/${id}/campos`)}
        >
          <h4>Campos</h4>
          <p>Crea y edita los campos de la lista.</p>
        </div>

        <div
          className="accion-card"
          onClick={() => navigate(`/dashboard/lists/${id}/formularios`)}
        >
          <h4>Formularios</h4>
          <p>Diseña formularios y capta suscriptores.</p>
        </div>

        <div
          className="accion-card"
          onClick={() => navigate(`/dashboard/lists/${id}/segmentos`)}
        >
          <h4>Segmentos</h4>
          <p>Agrupa suscriptores por características comunes.</p>
        </div>

        <div
          className="accion-card"
          onClick={() => navigate(`/dashboard/lists/${id}/herramientas`)}
        >
          <h4>Herramientas</h4>
          <p>Optimiza y depura tu lista.</p>
        </div>

        <div
          className="accion-card"
          onClick={() => navigate(`/dashboard/lists/${id}/ajustes`)}
        >
          <h4>Ajustes</h4>
          <p>Configura tu lista.</p>
        </div>

      </div>

      {/* GRÁFICAS AISLADAS */}
      <div className="ListResumen__charts">
        <TrendChart subscribers={subscribers} />
        <GlobalStatsChart subscribers={subscribers} />
      </div>

    </div>
  );
}
