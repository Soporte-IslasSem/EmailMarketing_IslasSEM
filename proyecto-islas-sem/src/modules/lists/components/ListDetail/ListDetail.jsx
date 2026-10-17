import { Link, NavLink, Outlet, useParams, useNavigate } from "react-router-dom";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "../../../../config/firebaseConfig";
import { useEffect, useState } from "react";
import { useOrg } from "../../../crm/lib/useOrg";
import { typeIdOfList, EMAIL_RE, normEmail } from "../../lib/crmLink";
import "./ListDetail.styles.css";

export default function ListDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [list, setList] = useState(null);
  const { orgId } = useOrg();
  const [noEmailOf, setNoEmailOf] = useState({ key: "", n: 0 }); // contactos del tipo sin email

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

  // Lista de un tipo de cliente: cuántos contactos de ese tipo no tienen email (no pueden recibir
  // correos, así que no están en la lista; por eso el CRM puede mostrar más que la lista).
  const typeId = typeIdOfList(list);
  const noEmail = typeId && noEmailOf.key === typeId ? noEmailOf.n : 0;
  useEffect(() => {
    if (!typeId || !orgId) return;
    const col = collection(db, "contacts");
    Promise.all([
      getDocs(query(col, where("orgId", "==", orgId), where("clientTypes", "array-contains", typeId))),
      getDocs(query(col, where("orgId", "==", orgId), where("clientType", "==", typeId))),
    ]).then(([a, b]) => {
      const all = new Map([...a.docs, ...b.docs].map((d) => [d.id, d.data()]));
      setNoEmailOf({ key: typeId, n: [...all.values()].filter((c) => !EMAIL_RE.test(normEmail(c.email))).length });
    }).catch(() => {}); // sin permiso para ver todos los contactos: no se muestra
  }, [typeId, orgId]);

  if (!list) return <p>Cargando...</p>;

  return (
    <div className="ListDetail">

      {/* HEADER */}
      <div className="ListDetail__top">
        <div>
          <h1>{list.name}</h1>
          <p className="ListDetail__subCount">
            {list.subscribersCount || 0} suscriptores
            {noEmail > 0 && (
              <span className="ListDetail__noEmail">
                {" · "}{noEmail} {noEmail === 1 ? "contacto" : "contactos"} de este tipo sin email (no pueden recibir correos){" "}
                <Link to={`/dashboard/crm/contacts?tipo=${encodeURIComponent(typeId)}&sinEmail=1`}>Ver y completar</Link>
              </span>
            )}
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
