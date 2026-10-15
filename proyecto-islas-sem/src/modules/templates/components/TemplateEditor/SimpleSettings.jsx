// Ajustes sencillos del elemento seleccionado en el editor: solo lo que se usa a diario
// (texto, botón, imagen, fila). Lo técnico queda en "Opciones avanzadas".
import { buttonParts, closestRow, closestTag, kindOf, socialGroup, networkName, alignComp, currentAlign } from "./editorUtils";

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

// Completa lo que falte: "web.com" → https://web.com, un correo → mailto:, un teléfono → tel:.
function normalizeLink(v) {
  const t = String(v || "").trim();
  if (!t || t === "#") return t;
  if (/^(https?:|mailto:|tel:|#|\{\{)/i.test(t)) return t;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return `mailto:${t}`;
  if (/^\+?[\d\s()-]{7,}$/.test(t)) return `tel:${t.replace(/[\s()-]/g, "")}`;
  return `https://${t.replace(/^\/+/, "")}`;
}

// Campo de enlace: avisa si no lleva a ningún sitio y permite probarlo.
function LinkField({ label, link, onChange, placeholder = "https://tuweb.com" }) {
  const href = link.getAttributes().href || "";
  const empty = !href || href === "#";
  const save = (v) => { link.addAttributes({ href: v, target: "_blank" }); onChange(); };
  return (
    <label className="TE__link">{label}
      <span className="TE__linkrow">
        <input value={href === "#" ? "" : href} placeholder={placeholder}
          onChange={(e) => save(e.target.value)} onBlur={(e) => save(normalizeLink(e.target.value) || "#")} />
        {!empty && <a href={href} target="_blank" rel="noreferrer" title="Abrir el enlace en otra pestaña">Probar ↗</a>}
      </span>
      <small className={empty ? "TE__linkwarn" : "TE__linkok"}>
        {empty ? "⚠ Sin enlace: al hacer clic no lleva a ningún sitio." : `✓ Al hacer clic abre: ${href}`}
      </small>
    </label>
  );
}

function Align({ comp, onChange }) {
  const cur = currentAlign(comp);
  return (
    <>
      <span className="TE__label">Alineación</span>
      <div className="TE__seg">
        {[["left", "⇤ Izquierda"], ["center", "↔ Centro"], ["right", "Derecha ⇥"]].map(([v, l]) => (
          <button key={v} className={cur === v ? "is-on" : ""} onClick={() => { alignComp(comp, v); onChange(); }}>{l}</button>
        ))}
      </div>
    </>
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
        <Align comp={comp} onChange={onChange} />
        <div className="TE__seg">
          <button className={bold ? "is-on" : ""} onClick={() => set(comp, { "font-weight": bold ? "400" : "800" })}>Negrita</button>
        </div>
        {link ? (
          <LinkField label="Enlace (a dónde lleva al hacer clic)" link={link} onChange={onChange} />
        ) : (
          <p className="TE__hint">Para enlazar una palabra: haz doble clic, selecciónala y pulsa el icono 🔗 de la barra. Luego pon aquí el destino.</p>
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
        <LinkField label="Enlace del botón (a dónde lleva al hacer clic)" link={link} onChange={onChange} placeholder="https://tuweb.com/oferta" />
        <Align comp={comp} onChange={onChange} />
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
        {link && <LinkField label="Enlace al hacer clic en la imagen" link={link} onChange={onChange} />}
        <Align comp={comp} onChange={onChange} />
        <label>Ancho · {width}%
          <input type="range" min="20" max="100" step="5" value={width} onChange={(e) => set(comp, { width: `${e.target.value}%`, "max-width": "100%", height: "auto" })} />
        </label>
        <label>Texto alternativo (si la imagen no carga)
          <input value={comp.getAttributes().alt || ""} onChange={(e) => { comp.addAttributes({ alt: e.target.value }); onChange(); }} />
        </label>
      </div>
    );
  }

  // ---------- REDES SOCIALES
  if (kind === "social") {
    const group = socialGroup(comp);
    const links = group.components().filter((a) => (a.get("tagName") || "").toLowerCase() === "a");
    return (
      <div className="TE__simple">
        <p className="TE__hint">Pon la dirección de tu perfil en cada red. Las que dejes vacías se pueden borrar seleccionándolas en el correo y pulsando «Eliminar».</p>
        {links.map((a) => (
          <LinkField key={a.cid} label={networkName(a)} link={a} onChange={onChange} placeholder={`https://${networkName(a).toLowerCase().split(" ")[0]}.com/tuempresa`} />
        ))}
        <Align comp={group} onChange={onChange} />
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

  return (
    <div className="TE__simple">
      <Align comp={comp} onChange={onChange} />
      <p className="TE__hint">Para más opciones usa «Seleccionar fila» o las opciones avanzadas.</p>
    </div>
  );
}
