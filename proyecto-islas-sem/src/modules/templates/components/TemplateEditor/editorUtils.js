// Utilidades para reconocer qué tipo de elemento hay seleccionado en el editor.

const TEXT_TAGS = ["h1", "h2", "h3", "h4", "p", "li", "ul", "ol", "span", "strong", "em", "b", "i", "div", "td"];

export function closestRow(comp) {
  let c = comp;
  while (c) {
    if (c.get("type") === "ism-row") return c;
    c = c.parent();
  }
  return null;
}

export function closestTag(comp, tag) {
  let c = comp;
  while (c) {
    if ((c.get("tagName") || "").toLowerCase() === tag) return c;
    if (c.get("type") === "ism-row") return null;
    c = c.parent();
  }
  return null;
}

// Un "botón" de las plantillas es <td bgcolor><a>…</a></td>.
export function buttonParts(comp) {
  const link = closestTag(comp, "a");
  if (!link) return null;
  const cell = link.parent();
  const bg = cell?.getAttributes().bgcolor;
  if (!cell || (cell.get("tagName") || "").toLowerCase() !== "td" || !bg) return null;
  return { link, cell };
}

export function kindOf(comp) {
  if (!comp) return null;
  const type = comp.get("type");
  if (type === "ism-row") return "row";
  if (type === "image") return "image";
  if (buttonParts(comp)) return "button";
  const tag = (comp.get("tagName") || "").toLowerCase();
  if (type === "text" || type === "link" || TEXT_TAGS.includes(tag)) return "text";
  return "other";
}
