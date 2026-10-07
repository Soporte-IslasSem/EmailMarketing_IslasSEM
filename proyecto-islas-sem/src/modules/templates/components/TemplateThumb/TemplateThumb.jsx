// Miniatura real de una plantilla: pinta el HTML a 650px de ancho dentro de un iframe
// y lo reduce para que quepa en la tarjeta (se ve el diseño completo, no un recorte).
import { useEffect, useRef, useState } from "react";
import "./TemplateThumb.styles.css";

const BASE_WIDTH = 650;

export default function TemplateThumb({ html, title = "", height = 300, onClick }) {
  const boxRef = useRef(null);
  const [scale, setScale] = useState(0.4);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / BASE_WIDTH || 0.4);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const doc = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;overflow:hidden;pointer-events:none}</style></head><body>${html || ""}</body></html>`;

  return (
    <div
      ref={boxRef}
      className={`TemplateThumb ${onClick ? "TemplateThumb--clickable" : ""}`}
      style={{ height }}
      onClick={onClick}
      title={onClick ? "Previsualizar plantilla" : undefined}
    >
      <iframe
        title={title}
        srcDoc={doc}
        loading="lazy"
        tabIndex={-1}
        scrolling="no"
        style={{ width: BASE_WIDTH, height: height / scale, transform: `scale(${scale})` }}
      />
      {onClick && <span className="TemplateThumb__hover">Previsualizar</span>}
    </div>
  );
}
