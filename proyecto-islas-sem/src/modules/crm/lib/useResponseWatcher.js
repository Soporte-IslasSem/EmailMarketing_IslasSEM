// Reloj de respuesta: mientras la app está abierta, revisa cada minuto si
// alguna oferta venció sin respuesta y dispara la automatización de seguimiento.
// (El disparo 24/7 aunque nadie tenga la app abierta llegará con una Cloud
//  Function programada, cuando conectemos el correo real.)
import { useEffect, useRef } from "react";
import { useCrmCollection } from "./crm";
import { usePipelines } from "./pipelines";
import { useOrg } from "./useOrg";
import { runResponseWatch } from "./automations";

const CHECK_MS = 60 * 1000; // cada 60 s

export function useResponseWatcher() {
  const { orgId, ready } = useOrg();
  const { items: deals } = useCrmCollection("deals");
  const { pipelines } = usePipelines();
  const dealsRef = useRef(deals);
  dealsRef.current = deals;
  const pipesRef = useRef(pipelines);
  pipesRef.current = pipelines;

  useEffect(() => {
    if (!ready || !orgId) return;
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      try { await runResponseWatch(dealsRef.current, pipesRef.current, orgId); } catch { /* silencioso */ }
    };
    tick(); // una pasada al entrar
    const t = setInterval(tick, CHECK_MS);
    return () => { alive = false; clearInterval(t); };
  }, [ready, orgId]);
}
