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

// Redes sociales: un grupo de enlaces redondos con la inicial de la red (f, in, ig, X, ▶…).
export const NETWORKS = {
  f: "Facebook", fb: "Facebook", in: "LinkedIn", ig: "Instagram", x: "X (Twitter)", "▶": "YouTube", yt: "YouTube",
  tk: "TikTok", tt: "TikTok", wa: "WhatsApp", "@": "Email", w: "Web", web: "Web",
};
const linkText = (a) => (a.getEl?.()?.textContent || a.components().map((c) => c.get("content") || "").join("")).trim();
export const networkName = (a) => NETWORKS[linkText(a).toLowerCase()] || NETWORKS[linkText(a)] || linkText(a) || "Red social";
const isSocialGroup = (c) => {
  const kids = c.components();
  return kids.length >= 2 && kids.every((k) => (k.get("tagName") || "").toLowerCase() === "a" && linkText(k).length <= 3 && /border-radius/.test(k.getEl?.()?.getAttribute("style") || ""));
};
export function socialGroup(comp) {
  let c = comp;
  for (let i = 0; c && i < 3; i++) {
    if (c.get("type") === "ism-row") return null;
    if (isSocialGroup(c)) return c;
    c = c.parent();
  }
  return null;
}

// Etiquetas que van "en línea": centrarlas solo funciona en el bloque que las contiene.
const INLINE = ["a", "span", "strong", "em", "b", "i", "u", "img", "font", "small"];
export function blockOf(comp) {
  let c = comp;
  while (c && INLINE.includes((c.get("tagName") || "").toLowerCase())) c = c.parent();
  return c || comp;
}

// Alinea un elemento (izquierda / centro / derecha) de forma que lo respeten Gmail y Outlook.
export function alignComp(comp, v) {
  const tag = (comp.get("tagName") || "").toLowerCase();
  if (comp.get("type") === "image" || tag === "img") {
    comp.addStyle({ display: "block", "margin-left": v === "left" ? "0" : "auto", "margin-right": v === "right" ? "0" : "auto" });
    comp.addAttributes({ align: v === "center" ? "center" : v });
    const box = blockOf(comp.parent() || comp);
    if (box && box !== comp) box.addStyle({ "text-align": v });
    return;
  }
  const btn = buttonParts(comp);
  if (btn) {
    // El botón es una tabla en línea: se alinea desde su contenedor.
    let table = btn.cell.parent();
    while (table && (table.get("tagName") || "").toLowerCase() !== "table") table = table.parent();
    const holder = table?.parent();
    if (holder) {
      holder.addStyle({ "text-align": v });
      if ((holder.get("tagName") || "").toLowerCase() === "td") holder.addAttributes({ align: v });
    }
    return;
  }
  const target = blockOf(comp);
  target.addStyle({ "text-align": v });
  if (["td", "table"].includes((target.get("tagName") || "").toLowerCase())) target.addAttributes({ align: v });
}

// Lee la alineación actual (la del propio elemento o la heredada).
export function currentAlign(comp) {
  let el = comp.getEl?.();
  const btn = buttonParts(comp);
  if (btn) el = btn.cell.getEl?.()?.closest("table")?.parentElement || el;
  if (!el) return "left";
  if (el.tagName === "IMG") {
    const cs = el.ownerDocument.defaultView.getComputedStyle(el);
    if (cs.marginLeft !== "0px" && cs.marginRight !== "0px" && cs.display === "block") return "center";
    if (cs.marginLeft !== "0px" && cs.display === "block") return "right";
    el = el.parentElement;
  }
  const a = el.ownerDocument.defaultView.getComputedStyle(el).textAlign;
  return { start: "left", end: "right", "-webkit-center": "center" }[a] || a || "left";
}

export function kindOf(comp) {
  if (!comp) return null;
  const type = comp.get("type");
  if (type === "ism-row") return "row";
  if (socialGroup(comp)) return "social";
  if (type === "image") return "image";
  if (buttonParts(comp)) return "button";
  const tag = (comp.get("tagName") || "").toLowerCase();
  if (type === "text" || type === "link" || TEXT_TAGS.includes(tag)) return "text";
  return "other";
}
