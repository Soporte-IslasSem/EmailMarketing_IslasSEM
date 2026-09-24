import { NavLink, Outlet, useParams, useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../../../config/firebaseConfig";
import { useEffect, useState } from "react";
import "./ListDetail.styles.css";

export default function ListDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [list, setList] = useState(null);

  useEffect(() => {
    const fetchList = async () => {
      const ref = doc(db, "lists", id);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        setList({ id: snap.id, ...snap.data() });
      }
    };
    fetchList();
  }, [id]);

  if (!list) return <p>Cargando...</p>;

  return (
    <div className="ListDetail">

      {/* HEADER */}
      <div className="ListDetail__top">
        <div>
          <h1>{list.name}</h1>
          <p className="ListDetail__subCount">
            {list.subscribersCount || 0} suscriptores
          </p>
        </div>

        {/* 🔥 BOTÓN CORREGIDO */}
        <button
          className="ListDetail__back"
          onClick={() => navigate("/dashboard/lists")}
        >
          Volver a listas
        </button>
      </div>

      {/* SUBNAV */}
      <div className="ListDetail__subnav">
        <NavLink to={`/dashboard/lists/${id}`} end>Resumen</NavLink>
        <NavLink to={`/dashboard/lists/${id}/suscriptores`}>Suscriptores</NavLink>
        <NavLink to={`/dashboard/lists/${id}/campos`}>Campos</NavLink>
        <NavLink to={`/dashboard/lists/${id}/formularios`}>Formularios</NavLink>
        <NavLink to={`/dashboard/lists/${id}/segmentos`}>Segmentos</NavLink>
        <NavLink to={`/dashboard/lists/${id}/ajustes`}>Ajustes</NavLink>
        <NavLink to={`/dashboard/lists/${id}/notificaciones`}>Notificaciones</NavLink>
        <NavLink to={`/dashboard/lists/${id}/audiencias`}>Audiencias</NavLink>
        <NavLink to={`/dashboard/lists/${id}/herramientas`}>Herramientas</NavLink>
      </div>

      {/* SUBPÁGINAS */}
      <Outlet />
    </div>
  );
}
