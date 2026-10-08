// Código para mostrar un formulario (de cualquier tipo) en otra web. Todos cargan la página
// pública /f/<id>?embed=1 en un <iframe>, que avisa de su altura y de cuándo se envió,
// así el formulario es siempre el mismo (reCAPTCHA, RGPD, CRM, lista destino…).
// - inline: dentro de la página, donde se pegue.
// - popup: ventana centrada tras N segundos.
// - bar: barra fija abajo.
// - exit_intent: popup al sacar el ratón por arriba (o a los 20 s en móvil).
// popup/bar/exit_intent no vuelven a salir en N días tras cerrarlos ni tras enviarlo.
export const EMBED_MODES = [
  ["inline", "Incrustado en la página"],
  ["popup", "Popup (ventana emergente)"],
  ["bar", "Barra inferior"],
  ["exit_intent", "Al intentar salir (exit intent)"],
];

export function buildFormEmbed(base, formId, mode = "inline", { delaySeconds = 5, hideDays = 7 } = {}) {
  const src = `${base}/f/${formId}?embed=1`;
  const id = `islassem-form-${formId}`;
  if (mode === "inline") {
    return `<!-- Formulario ISLAS SEM -->
<iframe id="${id}" src="${src}" title="Formulario" loading="lazy" style="width:100%;max-width:520px;height:640px;border:0;display:block;margin:0 auto"></iframe>
<script>
window.addEventListener("message", function (e) {
  var d = e.data || {}; var f = document.getElementById(${JSON.stringify(id)});
  if (f && e.source === f.contentWindow && d.islassem === "form-height") f.style.height = d.h + "px";
});
</script>`;
  }
  const delay = Math.max(0, Number(delaySeconds) || 0);
  const days = Math.max(0, Number(hideDays) || 0);
  return `<!-- Formulario ISLAS SEM (${mode === "bar" ? "barra inferior" : mode === "popup" ? "popup" : "exit intent"}): pegar antes de </body> -->
<script>
(function () {
  var KEY = ${JSON.stringify(id)}, MODE = ${JSON.stringify(mode)};
  try {
    var st = JSON.parse(localStorage.getItem(KEY) || "{}");
    if (st.done) return;
    if (st.closedAt && Date.now() - st.closedAt < ${days} * 86400000) return;
  } catch (e) {}
  function save(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} }
  function build() {
    if (document.getElementById(KEY)) return;
    var bar = MODE === "bar";
    var wrap = document.createElement("div");
    wrap.id = KEY;
    wrap.setAttribute("style", bar
      ? "position:fixed;left:0;right:0;bottom:0;z-index:2147483000;background:#fff;box-shadow:0 -4px 18px rgba(0,0,0,.18);max-height:70vh;overflow:auto"
      : "position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:16px");
    var box = document.createElement("div");
    box.setAttribute("style", bar ? "position:relative;max-width:560px;margin:0 auto" : "position:relative;width:100%;max-width:520px;max-height:92vh;overflow:auto;border-radius:14px;background:#fff");
    var frame = document.createElement("iframe");
    frame.src = ${JSON.stringify(src)}; frame.title = "Formulario";
    frame.setAttribute("style", "width:100%;height:560px;border:0;display:block");
    var close = document.createElement("button");
    close.type = "button"; close.setAttribute("aria-label", "Cerrar"); close.textContent = "\\u00d7";
    close.setAttribute("style", "position:absolute;top:6px;right:10px;z-index:2;border:0;background:transparent;font-size:26px;line-height:1;cursor:pointer;color:#666");
    close.onclick = function () { wrap.remove(); save({ closedAt: Date.now() }); };
    box.appendChild(close); box.appendChild(frame); wrap.appendChild(box);
    if (!bar) wrap.addEventListener("click", function (e) { if (e.target === wrap) close.onclick(); });
    document.body.appendChild(wrap);
    window.addEventListener("message", function (e) {
      var d = e.data || {};
      if (e.source !== frame.contentWindow) return;
      if (d.islassem === "form-height") frame.style.height = d.h + "px";
      if (d.islassem === "form-done") { save({ done: true }); setTimeout(function () { wrap.remove(); }, 3000); }
    });
  }
  function start() {
    if (MODE === "bar") return build();
    if (MODE === "popup") return setTimeout(build, ${delay * 1000});
    var shown = false;
    function show() { if (!shown) { shown = true; build(); } }
    document.addEventListener("mouseout", function (e) { if (!e.relatedTarget && e.clientY <= 0) show(); });
    if ("ontouchstart" in window) setTimeout(show, 20000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
</script>`;
}
