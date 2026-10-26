// Página pública /verificar/:code — comprueba que un contrato existe, su estado y sus huellas.
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { publicApi, fmtDate } from "../lib/api";
import "../../crm/crm.styles.css";
import "../components/contracts.css";

export default function VerifyContract() {
  const { code: param } = useParams();
  const navigate = useNavigate();
  const [code, setCode] = useState(param || "");
  // Resultado de la última comprobación (se ignora si es de otro código).
  const [result, setResult] = useState({ key: "", data: null, error: "" });
  const data = result.key === param ? result.data : null;
  const error = result.key === param ? result.error : "";

  useEffect(() => {
    if (!param) return;
    publicApi(`verify/${encodeURIComponent(param)}`)
      .then((d) => setResult({ key: param, data: d, error: "" }))
      .catch((e) => setResult({ key: param, data: null, error: e.message }));
  }, [param]);

  return (
    <div className="ctr-public crm"><div className="ctr-public__box" style={{ maxWidth: 640 }}>
      <div className="ctr-public__head">Verificar un documento firmado</div>
      <div className="ctr-public__card">
        <form onSubmit={(e) => { e.preventDefault(); navigate(`/verificar/${code.trim().toUpperCase()}`); }} style={{ display: "flex", gap: 8 }}>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ID del documento (ej.: 7F3A-92C1)" style={{ flex: 1, padding: "8px 10px", border: "1px solid #dfe7e7", borderRadius: 8 }} />
          <button className="crm-btn">Comprobar</button>
        </form>
        {error && <p style={{ color: "#b0304c" }}>{error}</p>}
        {data && (
          <div style={{ marginTop: 16, fontSize: 14 }}>
            <p style={{ margin: "0 0 6px" }}><b>{data.title}</b> · ID {data.code}</p>
            <p style={{ margin: "0 0 10px" }}>Estado: <b style={{ color: data.status.startsWith("Firmado") ? "#136B68" : "#8a5a00" }}>{data.status}</b></p>
            {data.provider && <p style={{ margin: "0 0 4px" }}>Prestador: {data.provider.company} ({data.provider.name}) · {fmtDate(data.provider.signedAt)}</p>}
            {data.client && <p style={{ margin: "0 0 10px" }}>Cliente: {data.client.name} ({data.client.dni}){data.client.company ? ` en representación de ${data.client.company}` : ""} · {fmtDate(data.client.signedAt)}</p>}
            {data.docs.map((d, i) => (
              <div key={i} style={{ fontSize: 12.5, borderTop: "1px solid #eef3f3", padding: "6px 0", wordBreak: "break-all" }}>
                <b>{d.name}</b><br />Huella del contenido: {d.contentHash || "—"}{d.signedHash && <><br />Huella del PDF firmado: {d.signedHash}</>}
              </div>
            ))}
            <p style={{ fontSize: 12, color: "#6b7d7d" }}>Para comprobar que tu PDF no ha sido modificado, su huella SHA-256 debe coincidir con la «Huella del PDF firmado».</p>
          </div>
        )}
      </div>
    </div></div>
  );
}
