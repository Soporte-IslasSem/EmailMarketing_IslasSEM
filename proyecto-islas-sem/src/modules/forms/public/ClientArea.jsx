// Página pública de clientela (/clientela), como en el prototipo: cabecera con el logo y
// una banda por cada formulario publicado con su botón "IR AL FORMULARIO". Se genera sola.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BUILTIN_LIST } from "./builtinForms";

const API_BASE = import.meta.env.VITE_API_BASE || "https://email-marketing.islassem.com/api";

export default function ClientArea() {
  // Mientras carga se muestran los dos formularios fijos; luego la lista real.
  const [forms, setForms] = useState(BUILTIN_LIST.map((b) => ({ id: b.type, name: b.name })));
  useEffect(() => {
    let alive = true;
    fetch(`${API_BASE}/forms/public`)
      .then((r) => r.json())
      .then((out) => { if (alive && out.ok && Array.isArray(out.forms)) setForms(out.forms); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#f3f6f6", padding: "24px 16px", fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", border: "2px solid #2a9d8f", borderRadius: 4, overflow: "hidden", background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "14px 26px", borderBottom: "2px solid #2a9d8f", flexWrap: "wrap" }}>
          <img src="/islas-sem-logo.png" alt="ISLAS SEM" style={{ height: 42 }} />
          <div style={{ fontWeight: 800, color: "#1a9190", letterSpacing: 1, fontSize: 13, border: "2px solid #1a9190", borderRadius: 6, padding: "8px 16px" }}>ÁREA DE CLIENTELA</div>
        </div>
        {forms.map((f, i) => {
          const teal = i % 2 === 0;
          return (
            <div key={f.id} style={{ padding: "34px 20px", textAlign: "center", margin: 18, borderRadius: 2, background: teal ? "#1a9190" : "#f6d472" }}>
              <h2 style={{ margin: "0 0 18px", fontSize: "clamp(22px, 3.6vw, 40px)", fontWeight: 800, letterSpacing: 1, color: teal ? "#f2c94c" : "#1a7a74", textWrap: "balance" }}>
                {String(f.name || "").toUpperCase()}
              </h2>
              <Link
                to={`/f/${f.id}`}
                style={{ display: "inline-block", border: "none", borderRadius: 999, padding: "11px 24px", fontWeight: 700, fontSize: 13.5, letterSpacing: 0.5, textDecoration: "none", background: teal ? "#f2c94c" : "#e6b93f", color: "#1a7a74" }}
              >
                IR AL FORMULARIO
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
