// Página pública /firmar/:token — el cliente revisa el documento, confirma sus datos, dibuja su
// firma y firma. La fecha, la hora y la IP las registra el servidor.
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import ContractView from "../components/ContractView";
import SignaturePad from "../components/SignaturePad";
import { publicApi, fmtDate } from "../lib/api";
import "../../crm/crm.styles.css";
import "../components/contracts.css";

export default function SignContract() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", dni: "", company: "", cif: "" });
  const [asCompany, setAsCompany] = useState(false);
  const [accept, setAccept] = useState(false);
  const [signature, setSignature] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    publicApi(`public/${token}`).then((r) => {
      setData(r);
      setForm({ name: r.prefill?.name || "", dni: r.prefill?.dni || "", company: r.prefill?.company || "", cif: r.prefill?.cif || "" });
      setAsCompany(!!(r.prefill?.company || r.prefill?.cif));
    }).catch((e) => setError(e.message));
  }, [token]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const sign = async () => {
    setError("");
    if (form.name.trim().length < 3) return setError("Escribe tu nombre completo.");
    if (form.dni.trim().length < 5) return setError("Escribe tu DNI / NIF.");
    if (asCompany && (!form.company.trim() || form.cif.trim().length < 5)) return setError("Escribe la sociedad y su CIF.");
    if (!accept) return setError("Marca la casilla de aceptación.");
    if (!signature) return setError("Dibuja tu firma en el recuadro.");
    setSending(true);
    try {
      const r = await publicApi(`public/${token}/sign`, {
        name: form.name, dni: form.dni, ...(asCompany ? { company: form.company, cif: form.cif } : {}), signature, accept: true,
      });
      setDone(r);
    } catch (e) { setError(e.message); }
    finally { setSending(false); }
  };

  if (!data) {
    return (
      <div className="ctr-public crm"><div className="ctr-public__box">
        <div className="ctr-public__head">Firma de documentos</div>
        <div className="ctr-public__card">{error ? <p style={{ color: "#b0304c" }}>{error}</p> : <p>Cargando documento…</p>}</div>
      </div></div>
    );
  }

  if (done || data.status === "completed") {
    return (
      <div className="ctr-public crm"><div className="ctr-public__box">
        <div className="ctr-public__head">Firma de documentos</div>
        <div className="ctr-public__card ctr-ok">
          <div style={{ fontSize: 46 }}>✅</div>
          <h2>{done ? "¡Documento firmado!" : "Este documento ya está firmado"}</h2>
          <p>{done ? "Gracias. En unos minutos recibirás en tu correo la copia firmada por las dos partes, con su certificado de firma." : `Firmado${data.client?.signedAt ? ` el ${fmtDate(data.client.signedAt)}` : ""}. La copia firmada se envió por correo.`}</p>
          <p style={{ fontSize: 12.5, color: "#6b7d7d" }}>ID del documento: {data.code}</p>
        </div>
      </div></div>
    );
  }

  return (
    <div className="ctr-public crm"><div className="ctr-public__box">
      <div className="ctr-public__head">{data.provider?.company || "Documento"} · Documento para firmar</div>
      <div className="ctr-public__card">
        <h2 style={{ margin: "0 0 4px", color: "#136B68" }}>{data.title}</h2>
        <p style={{ margin: 0, fontSize: 13.5, color: "#5b6b6a" }}>
          Firmado por <b>{data.provider?.company}</b> ({data.provider?.name}) el {fmtDate(data.provider?.signedAt)}. Revisa el documento y fírmalo al final.
        </p>

        {data.docs.map((d, i) => (
          <div key={i}>
            <div className="ctr-public__docname">{data.docs.length > 1 ? `Documento ${i + 1} de ${data.docs.length} · ` : ""}{d.name}</div>
            {d.kind === "pdf"
              ? <><object data={d.url} type="application/pdf" className="ctr-public__pdf"><a href={d.url} target="_blank" rel="noreferrer">Abrir el PDF</a></object>
                <p style={{ fontSize: 12.5, margin: "4px 0 0" }}><a href={d.url} target="_blank" rel="noreferrer">Abrir el PDF en otra pestaña</a></p></>
              : <div className="ctr-public__paper"><ContractView blocks={d.blocks} values={{}} /></div>}
          </div>
        ))}

        <div className="ctr-public__docname" style={{ marginTop: 24 }}>Tus datos</div>
        <div className="crm-two" style={{ flexWrap: "wrap" }}>
          <div className="crm-field" style={{ flex: "1 1 45%" }}><label>Nombre completo</label><input value={form.name} onChange={set("name")} autoComplete="name" /></div>
          <div className="crm-field" style={{ flex: "1 1 45%" }}><label>DNI / NIF</label><input value={form.dni} onChange={set("dni")} /></div>
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "6px 0", fontSize: 14, cursor: "pointer" }}>
          <input type="checkbox" style={{ width: "auto" }} checked={asCompany} onChange={(e) => setAsCompany(e.target.checked)} /> Firmo en representación de una empresa
        </label>
        {asCompany && (
          <div className="crm-two" style={{ flexWrap: "wrap" }}>
            <div className="crm-field" style={{ flex: "1 1 45%" }}><label>Sociedad</label><input value={form.company} onChange={set("company")} /></div>
            <div className="crm-field" style={{ flex: "1 1 45%" }}><label>CIF</label><input value={form.cif} onChange={set("cif")} /></div>
          </div>
        )}

        <div className="ctr-public__docname">Tu firma</div>
        <SignaturePad onChange={setSignature} />

        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", margin: "14px 0", fontSize: 14, cursor: "pointer" }}>
          <input type="checkbox" style={{ width: "auto", marginTop: 3 }} checked={accept} onChange={(e) => setAccept(e.target.checked)} />
          <span>He leído {data.docs.length > 1 ? "los documentos" : "el documento"} y acepto su contenido. Firmo electrónicamente con los datos indicados; se registrarán la fecha, la hora y mi dirección IP como prueba de la firma.</span>
        </label>
        {error && <div className="cf-err" style={{ marginBottom: 10 }}>{error}</div>}
        <button className="crm-btn" style={{ width: "100%", padding: "12px", fontSize: 15 }} onClick={sign} disabled={sending}>{sending ? "Firmando…" : "✍️ Firmar"}</button>
        <p style={{ fontSize: 11.5, color: "#8a9a9a", marginTop: 10 }}>ID del documento: {data.code}. Firma electrónica simple con evidencias (Reglamento UE 910/2014, eIDAS).</p>
      </div>
    </div></div>
  );
}
