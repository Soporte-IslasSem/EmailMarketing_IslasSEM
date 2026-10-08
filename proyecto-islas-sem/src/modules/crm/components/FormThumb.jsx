// Miniatura de un formulario (galería de plantillas): pinta el formulario de verdad,
// en pequeño, con su título, sus campos y su botón.
export default function FormThumb({ form }) {
  const color = form.color || "#1A9190";
  const fields = (form.fields || []).slice(0, 5);
  return (
    <div className="cf-thumb" aria-hidden="true">
      <div className="cf-thumb__card" style={{ background: form.bg || "#fff" }}>
        <div className="cf-thumb__title" style={{ color }}>{form.title}</div>
        {fields.map((f, i) =>
          f.type === "check" ? (
            <div key={i} className="cf-thumb__check"><span />{f.k}</div>
          ) : (
            <div key={i} className={`cf-thumb__in ${f.type === "textarea" ? "tall" : ""}`}>
              {f.k}{f.type === "select" ? " ▾" : ""}
            </div>
          )
        )}
        <div className="cf-thumb__btn" style={{ background: color }}>{form.btn || "Enviar"}</div>
      </div>
    </div>
  );
}
