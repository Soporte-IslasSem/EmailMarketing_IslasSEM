// CRM ⇄ Email Marketing al momento (va en el panel, activo mientras la app está abierta):
// cada vez que cambia un contacto (alta, tipo, email, nombre, borrado — lo haga quien lo haga,
// también el servidor) se ponen al día sus suscripciones en las listas del CRM.
// Al entrar, si hace más de 10 min de la última revisión completa, se hace una (sin crear listas).
import { useEffect, useRef } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../../config/firebaseConfig";
import { useOrg } from "../../crm/lib/useOrg";
import { usePerms } from "../../crm/lib/permissions";
import { useClientTypes } from "../../crm/lib/clientTypes";
import { syncAll, syncContacts } from "../lib/crmLink";
import { SYNC_KEY } from "./useCrmListsSync";

export default function useCrmLink() {
  const { orgId } = useOrg();
  const perms = usePerms();
  const { types } = useClientTypes();
  const pending = useRef(new Map()); // id → datos del contacto (null = borrado)
  const timer = useRef(null);
  const latest = useRef({ types, perms });
  useEffect(() => { latest.current = { types, perms }; }, [types, perms]);

  // Cambios de contactos → sus listas (agrupados 1,5 s)
  useEffect(() => {
    if (!orgId) return undefined;
    let first = true;
    const unsub = onSnapshot(query(collection(db, "contacts"), where("orgId", "==", orgId)), (snap) => {
      if (first) { first = false; return; } // la carga inicial no es un cambio
      snap.docChanges().forEach((ch) => pending.current.set(ch.doc.id, ch.type === "removed" ? null : ch.doc.data()));
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const items = [...pending.current].map(([id, data]) => ({ id, data }));
        pending.current.clear();
        syncContacts(items, orgId).catch((e) => console.warn("[crm-link] sync contactos:", e.message));
      }, 1500);
    }, () => {});
    return () => { unsub(); clearTimeout(timer.current); };
  }, [orgId]);

  // Revisión completa al entrar (también recoge cambios de tipos: renombrar, borrar)
  const typesKey = types.map((t) => `${t.id}:${t.label}`).join("|");
  useEffect(() => {
    if (!orgId || !perms.ready || !types.length) return undefined;
    let last = 0;
    try { last = Number(localStorage.getItem(SYNC_KEY)) || 0; } catch { /* sin almacenamiento */ }
    const changed = typesKey !== sessionStorageGet("islassem_types_key");
    if (!changed && Date.now() - last < 10 * 60e3) return undefined;
    const t = setTimeout(() => {
      const { types: ty, perms: p } = latest.current;
      syncAll({ orgId, types: ty, visible: p.visible, create: false })
        .then(() => { try { localStorage.setItem(SYNC_KEY, String(Date.now())); sessionStorage.setItem("islassem_types_key", typesKey); } catch { /* sin almacenamiento */ } })
        .catch((e) => console.warn("[crm-link] revisión completa:", e.message));
    }, 2000);
    return () => clearTimeout(t);
  }, [orgId, perms.ready, typesKey]); // eslint-disable-line react-hooks/exhaustive-deps
}

function sessionStorageGet(k) {
  try { return sessionStorage.getItem(k) || ""; } catch { return ""; }
}
