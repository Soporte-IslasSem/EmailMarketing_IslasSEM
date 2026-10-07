import { useState } from "react";
import { useParams } from "react-router-dom";
import { collection, doc, getDoc, getDocs, query, updateDoc, where, writeBatch } from "firebase/firestore";
import { auth, db } from "../../../../config/firebaseConfig";
import CrmModal from "../../../crm/components/CrmModal";
import "../../../crm/crm.styles.css";
import "./ListHerramientas.styles.css";

const API_BASE = import.meta.env.VITE_API_BASE || "https://email-marketing.islassem.com/api";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
// Erratas frecuentes: el dominio existe (alguien lo registró) pero casi nunca es el correcto.
const TYPOS = {
  "gmial.com": "gmail.com", "gmai.com": "gmail.com", "gmal.com": "gmail.com", "gamil.com": "gmail.com",
  "gmail.co": "gmail.com", "gmail.con": "gmail.com", "gnail.com": "gmail.com",
  "hotmial.com": "hotmail.com", "hotmal.com": "hotmail.com", "hotmai.com": "hotmail.com", "hotmail.con": "hotmail.com",
  "hormail.com": "hotmail.com", "hotmail.co": "hotmail.com", "outlok.com": "outlook.com", "outlook.con": "outlook.com",
  "yaho.com": "yahoo.com", "yahoo.con": "yahoo.com", "yahooo.com": "yahoo.com",
};
const BLOCKED = ["unsubscribed", "bounced", "invalid"];
const norm = (e) => String(e || "").trim().toLowerCase();
const randomSecret = () => [...crypto.getRandomValues(new Uint8Array(20))].map((b) => b.toString(16).padStart(2, "0")).join("");
const ms = (t) => (t?.toMillis ? t.toMillis() : t?.seconds ? t.seconds * 1000 : 0);

async function loadSubscribers(listId) {
  const snap = await getDocs(
    query(collection(db, "subscribers"), where("listId", "==", listId), where("userId", "==", auth.currentUser.uid))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function commitInBatches(ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db);
    ops.slice(i, i + 400).forEach((op) => op(batch));
    await batch.commit();
  }
}

export default function ListHerramientas() {
  const { id: listId } = useParams();
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState("");
  const [done, setDone] = useState("");

  // ---------- Optimizar: normalizar emails y quitar duplicados ----------
  const analyzeOptimize = async () => {
    setBusy("optimize");
    setDone("");
    try {
      const subs = await loadSubscribers(listId);
      const byEmail = new Map();
      const toFix = [];
      subs.forEach((s) => {
        const e = norm(s.email);
        if (e && e !== s.email) toFix.push(s);
        if (!byEmail.has(e)) byEmail.set(e, []);
        byEmail.get(e).push(s);
      });
      // Se conserva el más antiguo de cada email; si alguna copia estaba de baja/rebotada,
      // el conservado hereda ese estado (no volver a escribir a quien se dio de baja).
      const dupes = [];
      byEmail.forEach((group) => {
        if (group.length < 2) return;
        const sorted = [...group].sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
        const blocked = sorted.find((s) => BLOCKED.includes(s.status));
        dupes.push({ keep: sorted[0], remove: sorted.slice(1), inheritStatus: blocked?.status });
      });
      const removeCount = dupes.reduce((n, d) => n + d.remove.length, 0);
      setModal({
        type: "optimize", toFix, dupes, removeCount, total: subs.length,
        unsubscribed: subs.filter((s) => s.status === "unsubscribed").length,
        bounced: subs.filter((s) => s.status === "bounced").length,
      });
    } catch (e) {
      setDone("No se pudo analizar la lista: " + (e.code || e.message));
    } finally {
      setBusy("");
    }
  };

  const applyOptimize = async () => {
    const { toFix, dupes, removeCount, total } = modal;
    setBusy("apply");
    try {
      const removed = new Set(dupes.flatMap((d) => d.remove.map((s) => s.id)));
      const ops = [];
      toFix
        .filter((s) => !removed.has(s.id))
        .forEach((s) => ops.push((b) => b.update(doc(db, "subscribers", s.id), { email: norm(s.email) })));
      dupes.forEach((d) => {
        if (d.inheritStatus && d.keep.status !== d.inheritStatus) {
          ops.push((b) => b.update(doc(db, "subscribers", d.keep.id), { status: d.inheritStatus }));
        }
        d.remove.forEach((s) => ops.push((b) => b.delete(doc(db, "subscribers", s.id))));
      });
      ops.push((b) => b.update(doc(db, "lists", listId), { subscribersCount: total - removeCount, optimizedAt: new Date() }));
      await commitInBatches(ops);
      setDone(`Lista optimizada: ${removeCount} duplicado(s) eliminado(s) y ${toFix.length} email(s) normalizado(s).`);
      setModal(null);
    } catch (e) {
      setDone("No se pudo optimizar: " + (e.code || e.message));
    } finally {
      setBusy("");
    }
  };

  // ---------- Depurar: formato, erratas y dominios que no aceptan correo ----------
  const analyzeClean = async () => {
    setBusy("clean");
    setDone("");
    try {
      const subs = (await loadSubscribers(listId)).filter((s) => !BLOCKED.includes(s.status));
      const issues = [];
      const domains = new Set();
      const pending = [];
      subs.forEach((s) => {
        const e = norm(s.email);
        if (!EMAIL_RE.test(e)) return issues.push({ sub: s, reason: "Formato no válido" });
        const [local, domain] = e.split("@");
        if (TYPOS[domain]) return issues.push({ sub: s, reason: `Posible errata (¿${local}@${TYPOS[domain]}?)` });
        domains.add(domain);
        pending.push({ sub: s, domain });
      });
      const result = {};
      const list = [...domains];
      if (list.length) {
        const token = await auth.currentUser.getIdToken();
        for (let i = 0; i < list.length; i += 300) {
          const r = await fetch(`${API_BASE}/lists/check-domains`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ domains: list.slice(i, i + 300) }),
          });
          const out = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(out.error || `HTTP ${r.status}`);
          Object.assign(result, out.result || {});
        }
      }
      pending.forEach(({ sub, domain }) => {
        if (result[domain] === false) issues.push({ sub, reason: `El dominio ${domain} no acepta correo` });
      });
      setModal({ type: "clean", issues, total: subs.length, checked: list.length, selected: new Set(issues.map((i) => i.sub.id)) });
    } catch (e) {
      setDone("No se pudo depurar: " + (e.code || e.message));
    } finally {
      setBusy("");
    }
  };

  const applyClean = async () => {
    const ids = [...modal.selected];
    setBusy("apply");
    try {
      // No se borran: se marcan "invalid" y dejan de recibir campañas y automatizaciones.
      await commitInBatches(ids.map((sid) => (b) => b.update(doc(db, "subscribers", sid), { status: "invalid", invalidAt: new Date() })));
      setDone(`${ids.length} email(s) marcado(s) como no válidos: ya no se les enviará nada.`);
      setModal(null);
    } catch (e) {
      setDone("No se pudo aplicar: " + (e.code || e.message));
    } finally {
      setBusy("");
    }
  };

  // ---------- Webhooks ----------
  const openWebhook = async () => {
    setDone("");
    const snap = await getDoc(doc(db, "lists", listId));
    const w = snap.data()?.webhook || {};
    setModal({
      type: "webhook",
      url: w.url || "",
      secret: w.secret || randomSecret(),
      active: !!w.active,
      events: { subscribe: true, unsubscribe: true, bounce: true, ...(w.events || {}) },
      last: w.lastAt ? { at: w.lastAt, status: w.lastStatus, error: w.lastError, event: w.lastEvent } : null,
      testMsg: "",
    });
  };
  const setHook = (patch) => setModal((m) => ({ ...m, ...patch }));
  const saveWebhook = async () => {
    if (modal.active && !/^https:\/\//i.test(modal.url)) return setHook({ testMsg: "La URL debe empezar por https://" });
    setBusy("apply");
    try {
      await updateDoc(doc(db, "lists", listId), {
        "webhook.url": modal.url.trim(), "webhook.secret": modal.secret, "webhook.active": modal.active, "webhook.events": modal.events,
      });
      setDone(modal.active ? "Webhook guardado y activo." : "Webhook guardado (desactivado).");
      setModal(null);
    } catch (e) {
      setHook({ testMsg: "No se pudo guardar: " + (e.code || e.message) });
    } finally {
      setBusy("");
    }
  };
  const testWebhook = async () => {
    setBusy("test");
    setHook({ testMsg: "" });
    try {
      const token = await auth.currentUser.getIdToken();
      const r = await fetch(`${API_BASE}/lists/${listId}/webhook-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url: modal.url.trim(), secret: modal.secret }),
      });
      const out = await r.json().catch(() => ({}));
      setHook({ testMsg: out.ok ? `✅ Recibido correctamente (HTTP ${out.status}).` : `❌ ${out.error || `El servidor respondió HTTP ${out.status}`}` });
    } catch (e) {
      setHook({ testMsg: "❌ " + e.message });
    } finally {
      setBusy("");
    }
  };

  const toggleIssue = (sid) =>
    setModal((m) => {
      const selected = new Set(m.selected);
      if (selected.has(sid)) selected.delete(sid);
      else selected.add(sid);
      return { ...m, selected };
    });

  return (
    <div className="ListHerramientas">
      <h2>Herramientas</h2>
      <p>Mantén la lista limpia para mejorar la entrega de tus campañas.</p>

      <div className="tools-list">
        <div className="tool-item">
          <div>
            <h3>Optimizar lista</h3>
            <span className="tool-status">Normaliza los emails y elimina duplicados</span>
          </div>
          <button className="tool-btn" onClick={analyzeOptimize} disabled={!!busy}>
            {busy === "optimize" ? "Analizando…" : "Optimizar"}
          </button>
        </div>

        <div className="tool-item">
          <div>
            <h3>Depurar emails de la lista</h3>
            <span className="tool-status">Detecta emails mal escritos o de dominios que no existen</span>
          </div>
          <button className="tool-btn" onClick={analyzeClean} disabled={!!busy}>
            {busy === "clean" ? "Comprobando…" : "Depurar"}
          </button>
        </div>

        <div className="tool-item">
          <div>
            <h3>Webhooks</h3>
            <span className="tool-status">Avisa a otro sistema (CRM, Zapier, Make…) de altas, bajas y rebotes</span>
          </div>
          <button className="tool-btn" onClick={openWebhook} disabled={!!busy}>Configurar</button>
        </div>
      </div>

      {done && <p style={{ marginTop: 16, opacity: 1, color: "#136B68", fontWeight: 600 }}>{done}</p>}

      {modal?.type === "webhook" && (
        <CrmModal
          title="Webhook de la lista"
          onClose={() => setModal(null)}
          maxWidth={620}
          footer={
            <>
              <button className="crm-btn ghost" onClick={testWebhook} disabled={busy === "test" || !modal.url.trim()}>
                {busy === "test" ? "Enviando…" : "Enviar prueba"}
              </button>
              <button className="crm-btn" onClick={saveWebhook} disabled={busy === "apply"}>{busy === "apply" ? "Guardando…" : "Guardar"}</button>
            </>
          }
        >
          <div className="crm-field">
            <label>URL que recibirá los avisos (https)</label>
            <input value={modal.url} onChange={(e) => setHook({ url: e.target.value })} placeholder="https://hooks.zapier.com/…" />
          </div>
          <div className="crm-field">
            <label>Enviar aviso cuando…</label>
            {[["subscribe", "alguien se suscribe por un formulario"], ["unsubscribe", "alguien se da de baja"], ["bounce", "un email rebota de forma definitiva"]].map(([k, t]) => (
              <label key={k} style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 400, margin: "4px 0" }}>
                <input type="checkbox" style={{ width: "auto" }} checked={!!modal.events[k]} onChange={(e) => setHook({ events: { ...modal.events, [k]: e.target.checked } })} />
                {t}
              </label>
            ))}
          </div>
          <div className="crm-field">
            <label>Clave secreta para verificar la firma</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={modal.secret} readOnly style={{ fontFamily: "monospace", fontSize: 12.5 }} />
              <button className="crm-btn ghost sm" onClick={() => setHook({ secret: randomSecret() })}>Regenerar</button>
            </div>
            <small style={{ color: "var(--crm-muted)" }}>
              Cada aviso lleva la cabecera <code>X-IslasSEM-Signature: sha256=…</code> (HMAC del cuerpo con esta clave).
            </small>
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "6px 0" }}>
            <input type="checkbox" style={{ width: "auto" }} checked={modal.active} onChange={(e) => setHook({ active: e.target.checked })} />
            <b>Webhook activo</b>
          </label>
          {modal.last && (
            <p style={{ fontSize: 12.5, color: "var(--crm-muted)" }}>
              Último envío: {new Date(modal.last.at).toLocaleString("es-ES")} · {modal.last.event} ·{" "}
              {modal.last.error ? `error: ${modal.last.error}` : `HTTP ${modal.last.status}`}
            </p>
          )}
          {modal.testMsg && <p style={{ fontSize: 13.5, margin: "8px 0 0" }}>{modal.testMsg}</p>}
        </CrmModal>
      )}

      {modal?.type === "optimize" && (
        <CrmModal
          title="Optimizar lista"
          onClose={() => setModal(null)}
          footer={
            <>
              <button className="crm-btn ghost" onClick={() => setModal(null)}>Cancelar</button>
              <button className="crm-btn" onClick={applyOptimize} disabled={busy === "apply" || (!modal.removeCount && !modal.toFix.length)}>
                {busy === "apply" ? "Aplicando…" : "Aplicar"}
              </button>
            </>
          }
        >
          <p style={{ marginTop: 0 }}>Analizados <b>{modal.total}</b> suscriptores:</p>
          <ul>
            <li><b>{modal.removeCount}</b> duplicado(s) a eliminar (se conserva el más antiguo de cada email)</li>
            <li><b>{modal.toFix.length}</b> email(s) con mayúsculas o espacios a normalizar</li>
            <li>{modal.unsubscribed} de baja y {modal.bounced} rebotado(s): <b>se conservan</b> para no volver a escribirles si se reimportan</li>
          </ul>
          {!modal.removeCount && !modal.toFix.length && <p style={{ color: "#136B68" }}>La lista ya está optimizada. ✅</p>}
        </CrmModal>
      )}

      {modal?.type === "clean" && (
        <CrmModal
          title="Depurar emails"
          onClose={() => setModal(null)}
          maxWidth={720}
          footer={
            <>
              <button className="crm-btn ghost" onClick={() => setModal(null)}>Cancelar</button>
              <button className="crm-btn" onClick={applyClean} disabled={busy === "apply" || !modal.selected.size}>
                {busy === "apply" ? "Aplicando…" : `Marcar ${modal.selected.size} como no válidos`}
              </button>
            </>
          }
        >
          <p style={{ marginTop: 0 }}>
            Revisados <b>{modal.total}</b> emails activos ({modal.checked} dominios comprobados).{" "}
            {modal.issues.length ? `Se encontraron ${modal.issues.length} con problemas:` : "No se encontró ningún problema. ✅"}
          </p>
          {modal.issues.length > 0 && (
            <>
              <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid #e3ecec", borderRadius: 8 }}>
                {modal.issues.map(({ sub, reason }) => (
                  <label key={sub.id} style={{ display: "flex", gap: 10, padding: "8px 12px", borderBottom: "1px solid #f0f4f4", cursor: "pointer" }}>
                    <input type="checkbox" checked={modal.selected.has(sub.id)} onChange={() => toggleIssue(sub.id)} />
                    <span style={{ flex: 1 }}>
                      <b>{sub.email}</b>
                      <br />
                      <small style={{ color: "#6b7d7d" }}>{reason}</small>
                    </span>
                  </label>
                ))}
              </div>
              <p style={{ fontSize: 12.5, color: "#6b7d7d" }}>
                No se borran: quedan marcados como "no válidos" y dejan de recibir envíos. Desmarca los que quieras conservar.
              </p>
            </>
          )}
        </CrmModal>
      )}
    </div>
  );
}
