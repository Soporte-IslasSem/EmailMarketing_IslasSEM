// Listas del CRM en Email Marketing (Listas): "CRM · Todos los contactos", una por cada tipo de
// cliente (con el mismo nombre que el tipo) y "CRM · Empresas". La lógica está en lib/crmLink.js.
// Aquí: revisión completa al abrir Listas (como mucho cada 10 min, o al pulsar "Actualizar"),
// creando las listas que falten. Los cambios del día a día van al momento (useCrmLink).
import { useCallback, useEffect, useState } from "react";
import { usePerms } from "../../crm/lib/permissions";
import { useClientTypes } from "../../crm/lib/clientTypes";
import { useOrg } from "../../crm/lib/useOrg";
import { syncAll } from "../lib/crmLink";

const EVERY_MS = 10 * 60e3;
export const SYNC_KEY = "islassem_crm_lists_sync";

export default function useCrmListsSync() {
  const { orgId } = useOrg();
  const perms = usePerms();
  const { types } = useClientTypes();
  const [state, setState] = useState({ busy: false, last: null, error: "" });

  const sync = useCallback(async () => {
    if (!orgId || !perms.ready) return;
    setState((s) => ({ ...s, busy: true, error: "" }));
    try {
      await syncAll({ orgId, types, visible: perms.visible, create: true });
      try { localStorage.setItem(SYNC_KEY, String(Date.now())); } catch { /* sin almacenamiento */ }
      setState({ busy: false, last: Date.now(), error: "" });
    } catch (e) {
      setState({ busy: false, last: null, error: e.message });
    }
  }, [orgId, perms, types]);

  useEffect(() => {
    if (!perms.ready || !types.length) return;
    let last = 0;
    try { last = Number(localStorage.getItem(SYNC_KEY)) || 0; } catch { /* sin almacenamiento */ }
    if (Date.now() - last > EVERY_MS) { const t = setTimeout(sync, 0); return () => clearTimeout(t); }
  }, [perms.ready, types.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return { ...state, sync };
}
