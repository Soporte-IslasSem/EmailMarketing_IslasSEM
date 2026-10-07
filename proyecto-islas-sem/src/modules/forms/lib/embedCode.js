// Código para incrustar un formulario de suscripción en cualquier web.
// - "classic": HTML + script (el formulario aparece donde se pegue).
// - "popup" | "bar" | "exit_intent": un único <script> (pegar antes de </body>) que crea
//   el widget, respeta "no volver a mostrar durante N días" y no reaparece tras suscribirse.
// Única fuente del código: lo usan el asistente (StepIntegrate) y el detalle (FormDetail).
const API = "https://email-marketing.islassem.com/api/forms/subscribe";

const css = (o) => Object.entries(o).map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}:${v}`).join(";");

function styles(d) {
  return {
    title: css({
      color: d.textColor || "#111", fontSize: `${d.fontSize || 18}px`, fontWeight: d.fontWeight || 600,
      fontStyle: d.fontStyle || "normal", textDecoration: d.textDecoration || "none", fontFamily: d.fontFamily || "inherit", margin: "0 0 12px",
    }),
    input: css({ width: "100%", boxSizing: "border-box", padding: "10px", borderRadius: `${d.borderRadius ?? 8}px`, border: "1px solid #d1d5db", marginBottom: "10px", fontSize: "15px" }),
    button: css({ width: "100%", padding: "10px", background: d.buttonColor || "#1A9190", color: "#fff", borderRadius: `${d.borderRadius ?? 8}px`, border: "none", fontWeight: 600, cursor: "pointer", fontSize: "15px" }),
  };
}

const escHtml = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Lógica de envío compartida (se inserta dentro de cada script).
const submitJs = (formId, successMessage, redirectUrl) => `
  function islassemSubmit(form, input, msg, onDone) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      msg.textContent = "";
      fetch(${JSON.stringify(API)}, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formId: ${JSON.stringify(formId)}, email: input.value.trim() })
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data.success) {
            form.reset();
            msg.style.color = "#1a7f37";
            msg.textContent = data.pending ? (data.message || "Revisa tu correo y confirma la suscripción.") : ${JSON.stringify(successMessage)};
            if (onDone) onDone();
            if (${JSON.stringify(redirectUrl)} && !data.pending) window.location.href = ${JSON.stringify(redirectUrl)};
          } else {
            msg.style.color = "#c0392b";
            msg.textContent = data.error || "No se pudo completar la suscripción.";
          }
        })
        .catch(function () {
          msg.style.color = "#c0392b";
          msg.textContent = "No se pudo completar la suscripción. Inténtalo de nuevo.";
        });
    });
  }`;

function classic(formId, f, s) {
  const html = `<!-- Formulario generado con Islas SEM -->
<div id="islassem-widget-${formId}" style="max-width:420px;background:${escHtml(f.design?.bgColor || "transparent")};padding:16px;border-radius:${f.design?.borderRadius ?? 8}px">
  <form id="islassem-form-${formId}">
    <p style="${s.title}">${escHtml(f.design?.titleText || "Suscríbete a nuestra newsletter")}</p>
    <input type="email" id="islassem-email-${formId}" required placeholder="Tu correo electrónico" style="${s.input}" />
    <button type="submit" style="${s.button}">Suscribirme</button>
    <p id="islassem-msg-${formId}" style="margin-top:10px;font-size:14px;"></p>
  </form>
</div>`;
  const script = `<!-- Script de Islas SEM -->
<script>
(function () {${submitJs(formId, f.successMessage || "¡Gracias por suscribirte!", f.redirectUrl || "")}
  islassemSubmit(
    document.getElementById("islassem-form-${formId}"),
    document.getElementById("islassem-email-${formId}"),
    document.getElementById("islassem-msg-${formId}")
  );
})();
</script>`;
  return `${html}\n\n${script}`;
}

function widget(formId, f, s) {
  const type = f.type;
  const delay = Math.max(0, Number(f.display?.delaySeconds ?? 5));
  const hideDays = Math.max(0, Number(f.display?.hideDays ?? 7));
  const d = f.design || {};
  const title = JSON.stringify(d.titleText || "Suscríbete a nuestra newsletter");
  const bg = JSON.stringify(d.bgColor || "#ffffff");
  return `<!-- Formulario ${type === "bar" ? "barra inferior" : type === "popup" ? "popup" : "exit intent"} de Islas SEM: pegar antes de </body> -->
<script>
(function () {
  var KEY = "islassem-form-${formId}";
  try {
    var st = JSON.parse(localStorage.getItem(KEY) || "{}");
    if (st.subscribed) return;
    if (st.closedAt && Date.now() - st.closedAt < ${hideDays} * 86400000) return;
  } catch (e) {}
  function save(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} }
${submitJs(formId, f.successMessage || "¡Gracias por suscribirte!", f.redirectUrl || "")}

  function build() {
    if (document.getElementById(KEY)) return;
    var isBar = ${JSON.stringify(type === "bar")};
    var wrap = document.createElement("div");
    wrap.id = KEY;
    wrap.setAttribute("style", isBar
      ? "position:fixed;left:0;right:0;bottom:0;z-index:2147483000;background:" + ${bg} + ";box-shadow:0 -4px 18px rgba(0,0,0,.15);padding:14px 48px 14px 16px;font-family:inherit"
      : "position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:16px;font-family:inherit");
    var box = document.createElement("div");
    box.setAttribute("style", isBar
      ? "max-width:900px;margin:0 auto;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:center"
      : "position:relative;max-width:420px;width:100%;background:" + ${bg} + ";border-radius:${d.borderRadius ?? 12}px;padding:28px 24px;box-shadow:0 10px 40px rgba(0,0,0,.25)");
    var p = document.createElement("p");
    p.setAttribute("style", ${JSON.stringify(s.title)} + (isBar ? ";margin:0" : ""));
    p.textContent = ${title};
    var form = document.createElement("form");
    form.setAttribute("style", isBar ? "display:flex;gap:8px;flex-wrap:wrap;align-items:center" : "");
    var input = document.createElement("input");
    input.type = "email"; input.required = true; input.placeholder = "Tu correo electrónico";
    input.setAttribute("style", ${JSON.stringify(s.input)} + (isBar ? ";width:240px;margin:0" : ""));
    var btn = document.createElement("button");
    btn.type = "submit"; btn.textContent = "Suscribirme";
    btn.setAttribute("style", ${JSON.stringify(s.button)} + (isBar ? ";width:auto;padding:10px 18px" : ""));
    var msg = document.createElement("p");
    msg.setAttribute("style", "margin:" + (isBar ? "0" : "10px 0 0") + ";font-size:14px");
    var close = document.createElement("button");
    close.type = "button"; close.setAttribute("aria-label", "Cerrar"); close.textContent = "\\u00d7";
    close.setAttribute("style", "position:absolute;top:8px;right:12px;border:0;background:transparent;font-size:24px;line-height:1;cursor:pointer;color:#666");
    close.onclick = function () { wrap.remove(); save({ closedAt: Date.now() }); };
    form.appendChild(input); form.appendChild(btn);
    box.appendChild(p); box.appendChild(form); box.appendChild(msg);
    if (isBar) { wrap.appendChild(box); wrap.appendChild(close); } else { box.appendChild(close); wrap.appendChild(box); }
    if (!isBar) wrap.addEventListener("click", function (e) { if (e.target === wrap) close.onclick(); });
    document.body.appendChild(wrap);
    islassemSubmit(form, input, msg, function () {
      save({ subscribed: true });
      setTimeout(function () { wrap.remove(); }, 2500);
    });
  }

  function start() {
    var type = ${JSON.stringify(type)};
    if (type === "bar") return build();
    if (type === "popup") return setTimeout(build, ${delay * 1000});
    // exit intent: al sacar el ratón por arriba (escritorio) o a los 20 s (táctil)
    var shown = false;
    function show() { if (!shown) { shown = true; build(); } }
    document.addEventListener("mouseout", function (e) { if (!e.relatedTarget && e.clientY <= 0) show(); });
    if ("ontouchstart" in window) setTimeout(show, 20000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
</script>`;
}

export function buildEmbedCode(formId, formData) {
  const s = styles(formData.design || {});
  return ["popup", "bar", "exit_intent"].includes(formData.type) ? widget(formId, formData, s) : classic(formId, formData, s);
}

export const TYPE_LABEL = { classic: "Clásico", popup: "Popup", bar: "Barra inferior", exit_intent: "Exit intent" };
