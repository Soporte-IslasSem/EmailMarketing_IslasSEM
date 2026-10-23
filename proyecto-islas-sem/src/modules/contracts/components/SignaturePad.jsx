// Recuadro para dibujar la firma con el ratón, el dedo o un lápiz. onChange(dataURL png | "").
import { useEffect, useRef, useState } from "react";
import "./contracts.css";

export default function SignaturePad({ onChange, height = 170 }) {
  const canvas = useRef(null);
  const drawing = useRef(false);
  const points = useRef(0);
  const last = useRef(null);
  const [empty, setEmpty] = useState(true);

  // Tamaño real del recuadro (nítido en pantallas de alta densidad).
  useEffect(() => {
    const c = canvas.current;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    c.width = c.offsetWidth * ratio;
    c.height = height * ratio;
    const ctx = c.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#14285a";
  }, [height]);

  const pos = (e) => {
    const r = canvas.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const start = (e) => {
    e.preventDefault();
    canvas.current.setPointerCapture?.(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const p = pos(e);
    const ctx = canvas.current.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    points.current++;
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    // Un simple clic no cuenta como firma.
    if (points.current > 12) { setEmpty(false); onChange?.(canvas.current.toDataURL("image/png")); }
  };
  const clear = () => {
    const c = canvas.current;
    c.getContext("2d").clearRect(0, 0, c.width, c.height);
    points.current = 0;
    setEmpty(true);
    onChange?.("");
  };

  return (
    <div className="ctr-pad">
      <canvas
        ref={canvas}
        style={{ height }}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        onPointerCancel={end}
      />
      {empty && <div className="ctr-pad__hint">Dibuja aquí tu firma con el ratón o con el dedo</div>}
      <button type="button" className="ctr-pad__clear" onClick={clear}>Borrar</button>
    </div>
  );
}
