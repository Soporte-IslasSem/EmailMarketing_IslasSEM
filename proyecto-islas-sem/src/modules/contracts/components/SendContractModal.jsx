// "Enviar contrato a firmar" desde la ficha del cliente o desde una negociación.
// 1) Eliges plantillas y/o subes documentos (.DOCX o PDF) solo para este cliente.
// 2) Ves los huecos ya rellenados con sus datos, cambias lo que quieras y ves la vista previa.
// 3) Envías: ISLAS SEM firma al enviar y el cliente recibe su enlace personal para firmar.
import { useEffect, useRef, useState } from "react";
import CrmModal from "../../crm/components/CrmModal";
import ContractView from "./ContractView";
import { contractsApi, toBase64 } from "../lib/api";
import { blocksFromDocx, holesOf, guessSource } from "../lib/docx";
import "./contracts.css";

export default function SendContractModal({ contactId, dealId, onClose, onSent }) {
  const [step, setStep] = useState("choose");
  const [templates, setTemplates] = useState(null);
  const [picked, setPicked] = useState([]); // ids de plantillas
  const [uploads, setUploads] = useState([]); // { key, name, kind, blocks?, fields?, file?, saveAsTemplate }
  const [title, setTitle] = useState("");
  const [prepared, setPrepared] = useState(null); // { docs, client, ready }
  const [values, setValues] = useState({}); // por documento: { idx: { hueco: valor } }
  const [preview, setPreview] = useState(-1);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const file = useRef(null);

  useEffect(() => {
    contractsApi("templates").then((r) => setTemplates(r.templates)).catch((e) => { setTemplates([]); setError(e.message); });
  }, []);

  const addFiles = async (list) => {
    setError("");
    for (const f of [...list]) {
      const kind = /\.docx$/i.test(f.name) ? "docx" : /\.pdf$/i.test(f.name) ? "pdf" : "";
      if (!kind) { setError(`"${f.name}": solo .docx o .pdf`); continue; }
      if (f.size > 10 * 1024 * 1024) { setError(`"${f.name}" pasa de 10 MB`); continue; }
      const name = f.name.replace(/\.(docx|pdf)$/i, "");
      try {
        if (kind === "docx") {
          const blocks = await blocksFromDocx(f);
          if (!blocks.length) throw new Error("el documento está vacío");
          setUploads((u) => [...u, { key: `${Date.now()}${Math.random()}`, name, kind, blocks, fields: holesOf(blocks).map((key) => ({ key, source: guessSource(key) })), saveAsTemplate: false }]);
        } else setUploads((u) => [...u, { key: `${Date.now()}${Math.random()}`, name, kind, file: f, saveAsTemplate: false }]);
      } catch (e) { setError(`"${f.name}": ${e.message}`); }
    }
    if (file.current) file.current.value = "";
  };

  const docsPayload = (withData) => Promise.all([
    ...picked.map((templateId) => ({ templateId })),
    ...uploads.map(async (u) => ({
      upload: { name: u.name, kind: u.kind, ...(u.kind === "docx" ? { blocks: u.blocks, fields: u.fields } : {}), ...(withData && u.kind === "pdf" ? { data: await toBase64(u.file) } : {}) },
      saveAsTemplate: u.saveAsTemplate,
    })),
  ]);

  const next = async () => {
    setError("");
    if (!picked.length && !uploads.length) return setError("Elige una plantilla o sube un documento.");
    setBusy("Preparando…");
    try {
      const r = await contractsApi("prepare", { contactId, dealId, docs: await docsPayload(false) });
      setPrepared(r);
      setValues(Object.fromEntries(r.docs.map((d, i) => [i, { ...(d.values || {}) }])));
      setStep("fill");
    } catch (e) { setError(e.message); }
    finally { setBusy(""); }
  };

  const missing = prepared ? prepared.docs.flatMap((d, i) => (d.fields || []).filter((f) => !String(values[i]?.[f.key] || "").trim()).map((f) => `${d.name}: ${f.key}`)) : [];

  const send = async () => {
    setError("");
    if (missing.length) return setError("Rellena los datos que faltan (en naranja).");
    setBusy("Enviando…");
    try {
      const docs = (await docsPayload(true)).map((d, i) => ({ ...d, values: values[i] || {} }));
      const r = await contractsApi("send", { contactId, dealId, title, docs });
      setResult(r);
      setStep("done");
      onSent?.();
    } catch (e) { setError(e.missing?.length ? `Faltan datos: ${e.missing.join(", ")}` : e.message); }
    finally { setBusy(""); }
  };

  const blocksOf = (i) => {
    if (i < picked.length) return templates?.find((t) => t.id === picked[i])?.preview || [];
    return uploads[i - picked.length]?.blocks || [];
  };

  const footer = step === "done"
    ? <button className="crm-btn" onClick={onClose}>Cerrar</button>
    : (
      <>
        <button className="crm-btn ghost" onClick={step === "fill" ? () => setStep("choose") : onClose}>{step === "fill" ? "← Atrás" : "Cancelar"}</button>
        {step === "choose"
          ? <button className="crm-btn" onClick={next} disabled={!!busy}>{busy || "Siguiente →"}</button>
          : <button className="crm-btn" onClick={send} disabled={!!busy || !prepared?.ready}>{busy || "✍️ Enviar a firmar"}</button>}
      </>
    );

  return (
    <CrmModal title="Enviar contrato a firmar" onClose={onClose} maxWidth={820} footer={footer}>
      {step === "choose" && (
        <>
          <div className="crm-field"><label>Título del envío (opcional)</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Si lo dejas vacío, se usan los nombres de los documentos" /></div>
          <div style={{ fontWeight: 700, fontSize: 13, margin: "10px 0 6px" }}>Plantillas</div>
          {templates === null ? <p>Cargando…</p> : templates.length ? templates.map((t) => (
            <label key={t.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0", cursor: "pointer" }}>
              <input type="checkbox" style={{ width: "auto" }} checked={picked.includes(t.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, t.id] : p.filter((x) => x !== t.id)))} />
              {t.kind === "pdf" ? "📄" : "📝"} {t.name}
            </label>
          )) : <p style={{ color: "var(--crm-muted)", fontSize: 13, margin: 0 }}>Aún no hay plantillas (se crean en Ventas › Contratos › Plantillas).</p>}

          <div style={{ fontWeight: 700, fontSize: 13, margin: "14px 0 6px" }}>Documentos solo para este cliente</div>
          {uploads.map((u, i) => (
            <div key={u.key} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0", flexWrap: "wrap" }}>
              <span>{u.kind === "pdf" ? "📄" : "📝"}</span>
              <input value={u.name} onChange={(e) => setUploads((l) => l.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} style={{ flex: 1, minWidth: 180 }} />
              <label style={{ fontSize: 12.5, display: "flex", gap: 5, alignItems: "center" }}>
                <input type="checkbox" style={{ width: "auto" }} checked={u.saveAsTemplate} onChange={(e) => setUploads((l) => l.map((x, j) => (j === i ? { ...x, saveAsTemplate: e.target.checked } : x)))} /> Guardar también como plantilla
              </label>
              <span style={{ color: "#b9c2c2", cursor: "pointer" }} onClick={() => setUploads((l) => l.filter((_, j) => j !== i))}>✕</span>
            </div>
          ))}
          <input ref={file} type="file" hidden multiple accept=".docx,.pdf" onChange={(e) => e.target.files?.length && addFiles(e.target.files)} />
          <button className="crm-btn ghost sm" onClick={() => file.current?.click()}>⬆ Subir documento (.docx o .pdf)</button>
          <p style={{ fontSize: 12, color: "var(--crm-muted)", margin: "6px 0 0" }}>En un Word, los datos que cambian van entre corchetes, por ejemplo [Nombre del Cliente]: se rellenan solos con los datos del CRM y luego puedes cambiarlos. Un PDF se envía tal cual.</p>
        </>
      )}

      {step === "fill" && prepared && (
        <>
          {!prepared.ready && <div className="cf-err" style={{ marginBottom: 10 }}>Antes de enviar, configura la firma de tu empresa en <b>Ventas › Contratos › Ajustes</b> (empresa, firmante y firma dibujada).</div>}
          <p style={{ margin: "0 0 10px", fontSize: 13.5 }}>Se enviará a <b>{prepared.client.name || "el cliente"}</b> ({prepared.client.email || <span style={{ color: "#b0304c" }}>sin email</span>}). Revisa los datos: puedes cambiar cualquiera.</p>
          {prepared.docs.map((d, i) => (
            <div key={i} className="crm-panel" style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <b>{d.kind === "pdf" ? "📄" : "📝"} {d.name}</b>
                {d.kind === "docx" && <button className="crm-btn ghost sm" onClick={() => setPreview(preview === i ? -1 : i)}>{preview === i ? "Ocultar vista previa" : "👁 Vista previa"}</button>}
              </div>
              {d.kind === "pdf" ? <p style={{ fontSize: 13, color: "var(--crm-muted)", margin: "6px 0 0" }}>PDF: se envía tal cual, con una hoja de firmas y el certificado al final.</p> : (
                <div className="crm-two" style={{ flexWrap: "wrap", marginTop: 8 }}>
                  {(d.fields || []).map((f) => {
                    const v = values[i]?.[f.key] || "";
                    return (
                      <div className="crm-field" key={f.key} style={{ minWidth: 220, flex: "1 1 45%" }}>
                        <label style={{ color: v ? undefined : "#8a5a00" }}>{f.key}{!v && " · falta"}</label>
                        <input value={v} onChange={(e) => setValues((x) => ({ ...x, [i]: { ...(x[i] || {}), [f.key]: e.target.value } }))} style={v ? undefined : { borderColor: "#e8b04a", background: "#fffaf0" }} />
                      </div>
                    );
                  })}
                </div>
              )}
              {preview === i && <div className="ctr-public__paper" style={{ marginTop: 8 }}><ContractView blocks={blocksOf(i)} values={values[i]} /></div>}
            </div>
          ))}
        </>
      )}

      {step === "done" && result && (
        <div className="ctr-ok">
          <h2>✍️ Enviado a firmar</h2>
          <p>El cliente ha recibido un correo con su enlace personal. Cuando firme, recibiréis los dos la copia firmada y aquí cambiará a <b>Firmado</b>.</p>
          <p style={{ fontSize: 12.5, color: "var(--crm-muted)" }}>ID del contrato: {result.code}</p>
        </div>
      )}

      {error && <div className="cf-err" style={{ marginTop: 10 }}>{error}</div>}
    </CrmModal>
  );
}
