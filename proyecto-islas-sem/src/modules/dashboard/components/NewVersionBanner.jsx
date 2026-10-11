// Aviso de versión nueva: cada 3 minutos (y al volver a la pestaña) compara el archivo
// principal de la app que tiene cargado el navegador con el que sirve el servidor. Si se
// desplegó una versión nueva, ofrece recargar (si no, seguiría usando la vieja).
import { useEffect, useState } from "react";

const BUNDLE_RE = /assets\/index-[A-Za-z0-9_-]+\.js/;
const current = () => {
  const s = [...document.querySelectorAll("script[src]")].map((x) => x.getAttribute("src")).find((src) => BUNDLE_RE.test(src || ""));
  return s ? s.match(BUNDLE_RE)[0] : "";
};

export default function NewVersionBanner() {
  const [stale, setStale] = useState(false);
  useEffect(() => {
    const mine = current();
    if (!mine) return undefined; // en desarrollo no hay bundle con hash
    const check = async () => {
      try {
        const html = await (await fetch(`/?v=${Date.now()}`, { cache: "no-store" })).text();
        const live = (html.match(BUNDLE_RE) || [])[0];
        if (live && live !== mine) setStale(true);
      } catch { /* sin conexión: se reintenta luego */ }
    };
    const t = setInterval(check, 180e3);
    const onVis = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVis);
    const first = setTimeout(check, 5e3);
    return () => { clearInterval(t); clearTimeout(first); document.removeEventListener("visibilitychange", onVis); };
  }, []);
  if (!stale) return null;
  return (
    <div style={{ position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)", zIndex: 9999, background: "#136B68", color: "#fff", borderRadius: 10, padding: "10px 14px", display: "flex", gap: 12, alignItems: "center", boxShadow: "0 6px 20px rgba(0,0,0,.18)", fontSize: 14 }}>
      <span>🔄 Hay una versión nueva de la app.</span>
      <button onClick={() => window.location.reload()} style={{ background: "#E2B83C", color: "#1f2d2d", border: 0, borderRadius: 6, padding: "6px 12px", fontWeight: 700, cursor: "pointer" }}>Recargar</button>
    </div>
  );
}
