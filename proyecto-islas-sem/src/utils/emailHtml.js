// Utilidades para que el HTML de las plantillas se vea igual en los clientes de correo.

// Origen público de la app (las imágenes de las plantillas se sirven desde aquí).
const PUBLIC_ORIGIN =
  (typeof window !== "undefined" && window.location?.origin) || "https://email-marketing.islassem.com";

// Rutas relativas ("/assets/...") → absolutas. En la bandeja del destinatario una ruta
// relativa no apunta a ninguna web y la imagen sale rota.
export function absolutizeUrls(html, origin = PUBLIC_ORIGIN) {
  return String(html || "").replace(/\b(src|href)=(["'])\/(?!\/)/gi, `$1=$2${origin}/`);
}

// GrapesJS guarda los estilos aparte (reglas "#id{...}" en getCss()) y getHtml() sale sin
// ellos: así se perdía el diseño al guardar. Aquí se meten como style="" en cada elemento
// (lo que exigen Gmail/Outlook) y el resto de reglas se conserva en un <style>.
export function inlineEditorHtml(editor) {
  const html = editor.getHtml();
  const css = editor.getCss() || "";
  if (!css.trim()) return absolutizeUrls(html);

  const doc = new DOMParser().parseFromString(`<div id="__root">${html}</div>`, "text/html");
  const root = doc.getElementById("__root");
  const leftover = [];
  // Reglas de nivel superior (las @media se dejan tal cual en el <style>).
  const re = /(@media[^{]+\{(?:[^{}]*\{[^}]*\})*\s*\})|([^{}]+)\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    if (m[1]) { leftover.push(m[1]); continue; }
    const selector = m[2].trim();
    const decl = m[3].trim();
    let els = [];
    try { els = /^[#.\w][\w\-#.\s>,:]*$/.test(selector) && !/:/.test(selector) ? [...root.querySelectorAll(selector)] : []; } catch { els = []; }
    if (!els.length) { if (!/^\*|^body$/.test(selector)) leftover.push(`${selector}{${decl}}`); continue; }
    els.forEach((el) => {
      const prev = el.getAttribute("style") || "";
      el.setAttribute("style", `${prev}${prev && !prev.trim().endsWith(";") ? ";" : ""}${decl}`);
    });
  }
  const style = leftover.length ? `<style>${leftover.join("")}</style>` : "";
  return absolutizeUrls(style + root.innerHTML);
}
