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
  const [noEmailOf, setNoEmailOf] = useState({ key: "", n: 0 }); // fichas del CRM sin email

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

  // Listas del CRM (cada tipo, "Todos los contactos" y "Empresas"): cuántas fichas no tienen email.
  // No pueden recibir correos y por eso no están en la lista: así se entiende por qué el CRM
  // muestra más que la lista.
  const typeId = typeIdOfList(list);
  const crmKey = list?.crm ? String(list.crmKey || "") : "";
  const noEmail = crmKey && noEmailOf.key === crmKey ? noEmailOf.n : 0;
  useEffect(() => {
    if (!crmKey || !orgId || !(typeId || crmKey === "all" || crmKey === "companies")) return;
    const col = collection(db, crmKey === "companies" ? "companies" : "contacts");
    const queries = typeId
      ? [query(col, where("orgId", "==", orgId), where("clientTypes", "array-contains", typeId)), query(col, where("orgId", "==", orgId), where("clientType", "==", typeId))]
      : [query(col, where("orgId", "==", orgId))];
    Promise.all(queries.map((q) => getDocs(q))).then((snaps) => {
      const all = new Map(snaps.flatMap((s) => s.docs).map((d) => [d.id, d.data()]));
      setNoEmailOf({ key: crmKey, n: [...all.values()].filter((c) => !EMAIL_RE.test(normEmail(c.email))).length });
    }).catch(() => {}); // sin permiso para ver todas las fichas: no se muestra
  }, [crmKey, typeId, orgId]);

  if (!list) return <p>Cargando...</p>;
  const noEmailLink = crmKey === "companies" ? "/dashboard/crm/companies"
    : `/dashboard/crm/contacts?${typeId ? `tipo=${encodeURIComponent(typeId)}&` : ""}sinEmail=1`;

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
                {" · "}{noEmail} {crmKey === "companies" ? (noEmail === 1 ? "empresa" : "empresas") : (noEmail === 1 ? "contacto" : "contactos")}
                {typeId ? " de este tipo" : " del CRM"} sin email (no pueden recibir correos){" "}
                <Link to={noEmailLink}>Ver y completar</Link>
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
