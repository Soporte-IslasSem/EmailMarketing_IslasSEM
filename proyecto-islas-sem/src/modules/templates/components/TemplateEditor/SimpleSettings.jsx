// Ajustes sencillos del elemento seleccionado en el editor: solo lo que se usa a diario
// (texto, botón, imagen, fila). Lo técnico queda en "Opciones avanzadas".
import { buttonParts, closestRow, closestTag, kindOf } from "./editorUtils";

const px = (v, d) => {
  const n = parseInt(String(v || ""), 10);
  return Number.isFinite(n) ? n : d;
};

function Color({ label, value, onChange }) {
  return (
    <label>{label}
      <span className="TE__color">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
        <code>{value}</code>
      </span>
    </label>
  );
}

export default function SimpleSettings({ comp, getEditor, toHex, onChange }) {
  const editor = getEditor();
  const kind = kindOf(comp);
  const style = comp.getStyle() || {};
  const set = (target, s) => { target.addStyle(s); onChange(); };
  const row = closestRow(comp);

  const moveRow = (dir) => {
    const coll = row.collection;
    const i = coll.indexOf(row);
    const j = i + dir;
    if (j < 0 || j >= coll.length) return;
    coll.remove(row, { temporary: true });
    coll.add(row, { at: j });
    editor.select(row);
    onChange();
  };

  // ---------- TEXTO
  if (kind === "text") {
    // Valores reales en pantalla (incluye lo heredado de la fila) cuando el elemento no los fija.
    const el = comp.getEl?.();
    const cs = el ? el.ownerDocument.defaultView.getComputedStyle(el) : {};
    const align = style["text-align"] || ({ start: "left", end: "right" }[cs.textAlign] ?? cs.textAlign) || "left";
    const bold = Number(style["font-weight"] || cs.fontWeight || 400) >= 600 || style["font-weight"] === "bold";
    const shown = { color: style.color || cs.color, size: style["font-size"] || cs.fontSize };
    const link = closestTag(comp, "a");
    return (
      <div className="TE__simple">
        <p className="TE__hint">Haz <strong>doble clic</strong> sobre el texto en el correo para escribir.</p>
        <Color label="Color del texto" value={toHex(shown.color || "#14262b")} onChange={(v) => set(comp, { color: v })} />
        <label>Tamaño · {px(shown.size, 16)} px
          <input type="range" min="10" max="72" value={px(shown.size, 16)} onChange={(e) => set(comp, { "font-size": `${e.target.value}px`, "line-height": "1.25" })} />
        </label>
        <div className="TE__seg">
          {[["left", "Izquierda"], ["center", "Centro"], ["right", "Derecha"]].map(([v, l]) => (
            <button key={v} className={align === v ? "is-on" : ""} onClick={() => set(comp, { "text-align": v })}>{l}</button>
          ))}
        </div>
        <div className="TE__seg">
          <button className={bold ? "is-on" : ""} onClick={() => set(comp, { "font-weight": bold ? "400" : "800" })}>Negrita</button>
        </div>
        {link && (
          <label>Enlace (al hacer clic)
            <input value={link.getAttributes().href || ""} placeholder="https://…" onChange={(e) => { link.addAttributes({ href: e.target.value }); onChange(); }} />
          </label>
        )}
      </div>
    );
  }

  // ---------- BOTÓN
  if (kind === "button") {
    const { link, cell } = buttonParts(comp);
    const lStyle = link.getStyle() || {};
    const setBtnBg = (v) => {
      cell.addAttributes({ bgcolor: v });
      cell.addStyle({ background: v });
      onChange();
    };
    return (
      <div className="TE__simple">
        <p className="TE__hint">Haz <strong>doble clic</strong> sobre el botón para cambiar su texto.</p>
        <label>Enlace del botón
          <input value={link.getAttributes().href || ""} placeholder="https://tuweb.com/oferta" onChange={(e) => { link.addAttributes({ href: e.target.value }); onChange(); }} />
        </label>
        <Color label="Color del botón" value={toHex(cell.getAttributes().bgcolor)} onChange={setBtnBg} />
        <Color label="Color del texto" value={toHex(lStyle.color || "#ffffff")} onChange={(v) => set(link, { color: v })} />
        <div className="TE__seg">
          {[["0px", "Recto"], ["8px", "Suave"], ["999px", "Redondo"]].map(([v, l]) => (
            <button key={v} onClick={() => { cell.addStyle({ "border-radius": v }); link.addStyle({ "border-radius": v }); onChange(); }}>{l}</button>
          ))}
        </div>
      </div>
    );
  }

  // ---------- IMAGEN
  if (kind === "image") {
    const link = closestTag(comp, "a");
    const width = String(style.width || "").endsWith("%") ? px(style.width, 100) : 100;
    return (
      <div className="TE__simple">
        <button className="TE__btn TE__btn--full TE__btn--accent" onClick={() => editor.runCommand("open-assets", { target: comp, types: ["image"], accept: "image/*" })}>
          Cambiar imagen
        </button>
        <p className="TE__hint">Sube una foto desde tu ordenador o pega la dirección (URL) de una imagen.</p>
        {link && (
          <label>Enlace al hacer clic en la imagen
            <input value={link.getAttributes().href || ""} placeholder="https://…" onChange={(e) => { link.addAttributes({ href: e.target.value }); onChange(); }} />
          </label>
        )}
        <label>Ancho · {width}%
          <input type="range" min="20" max="100" step="5" value={width} onChange={(e) => set(comp, { width: `${e.target.value}%`, "max-width": "100%", height: "auto" })} />
        </label>
        <label>Texto alternativo (si la imagen no carga)
          <input value={comp.getAttributes().alt || ""} onChange={(e) => { comp.addAttributes({ alt: e.target.value }); onChange(); }} />
        </label>
      </div>
    );
  }

  // ---------- FILA
  if (kind === "row") {
    const cell = comp.find("td")[0];
    const setPad = (v) => { if (cell) { cell.addStyle({ padding: v }); onChange(); } };
    const bg = comp.getAttributes().bgcolor || style.background || "#ffffff";
    return (
      <div className="TE__simple">
        <Color label="Color de fondo de la fila" value={toHex(bg)} onChange={(v) => { comp.addAttributes({ bgcolor: v }); set(comp, { background: v }); }} />
        <span className="TE__label">Espacio interior</span>
        <div className="TE__seg">
          {[["8px 32px", "Poco"], ["24px 32px", "Normal"], ["44px 32px", "Mucho"], ["0", "Nada"]].map(([v, l]) => (
            <button key={l} onClick={() => setPad(v)}>{l}</button>
          ))}
        </div>
        <span className="TE__label">Posición</span>
        <div className="TE__seg">
          <button onClick={() => moveRow(-1)}>↑ Subir</button>
          <button onClick={() => moveRow(1)}>↓ Bajar</button>
        </div>
      </div>
    );
  }

  return <p className="TE__hint">Usa «Seleccionar fila» o las opciones avanzadas para editar este elemento.</p>;
}
