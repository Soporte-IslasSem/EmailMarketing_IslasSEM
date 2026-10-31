import { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import CrmModal from "../components/CrmModal";
import { useCrmCollection, crmCreate, crmUpdate, crmRemove, money } from "../lib/crm";
import { usePerms } from "../lib/permissions";
import { exportCsv } from "../lib/exportCsv";
import { api, API_BASE } from "../../../shared/api";
import "../crm.styles.css";

// Catálogo de producto: productos con imagen (1080×1080), enlace de pago (Stripe, PayPal…) y
// página pública para compartir por WhatsApp o incrustar con <iframe>; y catálogos (varios
// productos en una sola página, estilo linktree).
const SITE = API_BASE.replace(/\/api\/?$/, "");
const SIZE = 1080;
const empty = { name: "", description: "", sku: "", category: "", price: 0, stock: 0, paymentUrl: "", buyLabel: "", public: true };
const emptyCat = { name: "", description: "", productIds: [], active: true };
const okUrl = (u) => !u || /^https:\/\/\S+$/i.test(u.trim());

// Recorta al centro y deja la imagen en 1080×1080 (JPG), sea cual sea la original.
function toSquare(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const c = document.createElement("canvas");
      c.width = SIZE; c.height = SIZE;
      const g = c.getContext("2d");
      g.fillStyle = "#fff"; g.fillRect(0, 0, SIZE, SIZE);
      g.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
      URL.revokeObjectURL(url);
      const preview = c.toDataURL("image/jpeg", 0.88);
      resolve({ preview, data: preview.split(",")[1], mime: "image/jpeg", small: img.width < SIZE || img.height < SIZE });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("No se pudo leer la imagen")); };
    img.src = url;
  });
}

const Thumb = ({ src, size = 40 }) => src
  ? <img src={src} alt="" style={{ width: size, height: size, borderRadius: 8, objectFit: "cover", border: "1px solid var(--crm-line)", flex: "none" }} />
  : <span style={{ width: size, height: size, borderRadius: 8, background: "#e6f4f1", display: "inline-block", flex: "none" }} />;

export default function Products() {
  const { items: all, loading, orgId } = useCrmCollection("products");
  const { items: catalogs } = useCrmCollection("catalogs");
  const perms = usePerms();
  const items = useMemo(() => perms.visible("products", all), [perms, all]);
  const [tab, setTab] = useState("products");
  const [term, setTerm] = useState("");
  const [edit, setEdit] = useState(null); // { id?, ...campos }
  const [photo, setPhoto] = useState(null); // { preview, data, mime, small } | "remove"
  const [editCat, setEditCat] = useState(null);
  const [share, setShare] = useState(null); // { kind: "p"|"c", id, name }
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef(null);

  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    const rows = [...items].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    if (!t) return rows;
    return rows.filter((p) => [p.name, p.sku, p.category].filter(Boolean).some((v) => String(v).toLowerCase().includes(t)));
  }, [items, term]);
  const byId = useMemo(() => Object.fromEntries(items.map((p) => [p.id, p])), [items]);

  const set = (k) => (e) => setEdit((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const openEdit = (p) => { setErr(""); setPhoto(null); setEdit(p ? { ...empty, ...p } : { ...empty }); };

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try { setPhoto(await toSquare(file)); } catch (x) { setErr(x.message); }
  };

  const save = async () => {
    if (!edit.name.trim()) return setErr("Escribe el nombre del producto.");
    if (!okUrl(edit.paymentUrl)) return setErr("La URL de pago tiene que empezar por https://");
    setSaving(true); setErr("");
    try {
      const data = {
        name: edit.name.trim(), description: String(edit.description || "").slice(0, 1500), sku: edit.sku || "", category: edit.category || "",
        price: Number(edit.price) || 0, stock: Number(edit.stock) || 0, paymentUrl: String(edit.paymentUrl || "").trim(),
        buyLabel: String(edit.buyLabel || "").trim().slice(0, 40), public: edit.public !== false,
      };
      let id = edit.id;
      if (id) await crmUpdate("products", id, data);
      else id = (await crmCreate("products", orgId, data)).id;
      if (photo === "remove") await api("products/image", { productId: id, remove: true });
      else if (photo) await api("products/image", { productId: id, data: photo.data, mime: photo.mime });
      setEdit(null); setPhoto(null);
    } catch (e) {
      setErr("No se pudo guardar: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const saveCat = async () => {
    if (!editCat.name.trim()) return setErr("Escribe el nombre del catálogo.");
    setSaving(true); setErr("");
    try {
      const data = { name: editCat.name.trim(), description: String(editCat.description || "").slice(0, 500), productIds: editCat.productIds.filter((x) => byId[x]), active: editCat.active !== false };
      if (editCat.id) await crmUpdate("catalogs", editCat.id, data);
      else await crmCreate("catalogs", orgId, data);
      setEditCat(null);
    } catch (e) {
      setErr("No se pudo guardar: " + e.message);
    } finally {
      setSaving(false);
    }
  };
  const toggleInCat = (id) => setEditCat((c) => ({ ...c, productIds: c.productIds.includes(id) ? c.productIds.filter((x) => x !== id) : [...c.productIds, id] }));
  const moveInCat = (i, d) => setEditCat((c) => {
    const ids = [...c.productIds]; const j = i + d;
    if (j < 0 || j >= ids.length) return c;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    return { ...c, productIds: ids };
  });

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (res) => {
        setImporting(true);
        let ok = 0;
        for (const row of res.data) {
          const name = row.name || row.Nombre || row.nombre || row.Producto || row.producto;
          if (!name) continue;
          const price = parseFloat(String(row.price || row.Precio || row.precio || "0").replace(",", ".")) || 0;
          const pay = String(row.paymentUrl || row["URL de pago"] || row.url_pago || "").trim();
          try {
            await crmCreate("products", orgId, {
              name: String(name).trim(),
              description: row.description || row.Descripcion || row["Descripción"] || "",
              sku: row.sku || row.SKU || row.Codigo || row.codigo || "",
              category: row.category || row.Categoria || row.categoria || "",
              price,
              stock: parseInt(row.stock || row.Stock || "0") || 0,
              paymentUrl: okUrl(pay) ? pay : "",
              public: true,
            });
            ok++;
          } catch { /* fila no válida: se salta */ }
        }
        setImporting(false);
        alert(`Importados ${ok} productos.`);
        if (fileRef.current) fileRef.current.value = "";
      },
    });
  };

  const canEdit = (p) => perms.can("products", "edit", p);
  const imgOf = (p) => (photo && photo !== "remove" ? photo.preview : p?.imageUrl || "");

  return (
    <div className="crm">
      <div className="crm__top">
        <div>
          <h1>Catálogo de producto</h1>
          <p>Productos y servicios para las negociaciones, con imagen, enlace de pago y página para compartir por WhatsApp.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {tab === "products" && perms.can("products", "export") && (
            <button className="crm-btn ghost" onClick={() => exportCsv("productos", filtered, [
              ["Nombre", (p) => p.name], ["Descripción", (p) => p.description], ["SKU", (p) => p.sku], ["Categoría", (p) => p.category], ["Precio", (p) => p.price], ["Stock", (p) => p.stock],
              ["URL de pago", (p) => p.paymentUrl], ["Página", (p) => `${SITE}/p/${p.id}`],
            ])}>⬇ Exportar</button>
          )}
          {tab === "products" && perms.can("products", "import") && (
            <button className="crm-btn ghost" onClick={() => fileRef.current?.click()} disabled={importing}>
              {importing ? "Importando…" : "⬆ Importar CSV"}
            </button>
          )}
          <input ref={fileRef} type="file" accept=".csv" hidden onChange={onFile} />
          {perms.can("products", "add") && (tab === "products"
            ? <button className="crm-btn" onClick={() => openEdit(null)}>+ Nuevo producto</button>
            : <button className="crm-btn" onClick={() => { setErr(""); setEditCat({ ...emptyCat }); }}>+ Nuevo catálogo</button>)}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, margin: "4px 0 14px" }}>
        <button className={`crm-btn sm ${tab === "products" ? "" : "ghost"}`} onClick={() => setTab("products")}>Productos ({items.length})</button>
        <button className={`crm-btn sm ${tab === "catalogs" ? "" : "ghost"}`} onClick={() => setTab("catalogs")}>Catálogos para compartir ({catalogs.length})</button>
      </div>

      {tab === "products" ? (
        <>
          <input className="crm-search" placeholder="Buscar producto…" value={term} onChange={(e) => setTerm(e.target.value)} />
          {loading ? (
            <div className="crm-loading">Cargando catálogo…</div>
          ) : (
            <table className="crm-table">
              <thead>
                <tr><th>Producto</th><th>SKU</th><th>Categoría</th><th>Precio</th><th>Stock</th><th>Pago</th><th></th></tr>
              </thead>
              <tbody>
                {filtered.length ? (
                  filtered.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <Thumb src={p.imageUrl} />
                          <span className={canEdit(p) ? "crm-link" : ""} onClick={() => canEdit(p) && openEdit(p)}><b>{p.name}</b></span>
                        </div>
                      </td>
                      <td>{p.sku || "—"}</td>
                      <td>{p.category || "—"}</td>
                      <td>{money(p.price)}</td>
                      <td>{p.stock || 0}</td>
                      <td>{p.paymentUrl ? <a href={p.paymentUrl} target="_blank" rel="noreferrer" title={p.paymentUrl}>💳 Sí</a> : "—"}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <button className="crm-btn ghost sm" onClick={() => setShare({ kind: "p", id: p.id, name: p.name })} title="Enlace, WhatsApp e iframe">🔗 Compartir</button>{" "}
                        {canEdit(p) && <button className="crm-btn ghost sm" onClick={() => openEdit(p)}>Editar</button>}{" "}
                        {perms.can("products", "delete", p) && <button className="crm-btn ghost sm" onClick={() => window.confirm(`¿Eliminar "${p.name}"?`) && crmRemove("products", p.id)}>Eliminar</button>}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan="7" className="crm-empty">Aún no hay productos. Añade uno o importa un CSV (columnas: name, price, sku, category, stock, description, paymentUrl).</td></tr>
                )}
              </tbody>
            </table>
          )}
        </>
      ) : (
        <table className="crm-table">
          <thead><tr><th>Catálogo</th><th>Productos</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {catalogs.length ? catalogs.map((c) => (
              <tr key={c.id}>
                <td><b>{c.name}</b>{c.description && <div style={{ fontSize: 12.5, color: "var(--crm-muted)" }}>{c.description}</div>}</td>
                <td>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    {(c.productIds || []).slice(0, 6).map((id) => byId[id] && <Thumb key={id} src={byId[id].imageUrl} size={28} />)}
                    <span style={{ marginLeft: 6 }}>{(c.productIds || []).filter((id) => byId[id]).length}</span>
                  </div>
                </td>
                <td>{c.active === false ? "Desactivado" : "Publicado"}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <button className="crm-btn ghost sm" onClick={() => setShare({ kind: "c", id: c.id, name: c.name })}>🔗 Compartir</button>{" "}
                  {perms.can("products", "edit", c) && <button className="crm-btn ghost sm" onClick={() => { setErr(""); setEditCat({ ...emptyCat, ...c, productIds: c.productIds || [] }); }}>Editar</button>}{" "}
                  {perms.can("products", "delete", c) && <button className="crm-btn ghost sm" onClick={() => window.confirm(`¿Eliminar el catálogo "${c.name}"? Los productos no se borran.`) && crmRemove("catalogs", c.id)}>Eliminar</button>}
                </td>
              </tr>
            )) : (
              <tr><td colSpan="4" className="crm-empty">Crea un catálogo para enviar varios productos en un solo enlace (como un linktree): cada producto con su foto, precio y botón de pago.</td></tr>
            )}
          </tbody>
        </table>
      )}

      {edit && (
        <CrmModal
          title={edit.id ? "Editar producto" : "Nuevo producto"}
          onClose={() => setEdit(null)}
          footer={
            <>
              <button className="crm-btn ghost" onClick={() => setEdit(null)}>Cancelar</button>
              <button className="crm-btn" onClick={save} disabled={saving}>{saving ? "Guardando…" : edit.id ? "Guardar cambios" : "Crear producto"}</button>
            </>
          }
        >
          <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 12 }}>
            {photo === "remove" ? <Thumb size={96} /> : <Thumb src={imgOf(edit)} size={96} />}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label className="crm-btn ghost sm" style={{ cursor: "pointer" }}>
                {imgOf(edit) && photo !== "remove" ? "Cambiar imagen" : "Subir imagen"}
                <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pickPhoto} />
              </label>
              {(edit.imageUrl || photo) && photo !== "remove" && <button className="crm-btn ghost sm" onClick={() => setPhoto(edit.imageUrl ? "remove" : null)}>Quitar imagen</button>}
              <small style={{ color: "var(--crm-muted)" }}>Cuadrada de 1080×1080 px. Si no lo es, se recorta al centro.{photo?.small ? " ⚠️ Es más pequeña: puede verse borrosa." : ""}</small>
            </div>
          </div>
          <div className="crm-field"><label>Nombre</label><input value={edit.name} onChange={set("name")} autoFocus /></div>
          <div className="crm-field"><label>Descripción (sale en la página del producto)</label><textarea rows={3} value={edit.description} onChange={set("description")} maxLength={1500} /></div>
          <div className="crm-two">
            <div className="crm-field"><label>SKU / Código</label><input value={edit.sku} onChange={set("sku")} /></div>
            <div className="crm-field"><label>Categoría</label><input value={edit.category} onChange={set("category")} /></div>
          </div>
          <div className="crm-two">
            <div className="crm-field"><label>Precio (€)</label><input type="number" value={edit.price} onChange={set("price")} /></div>
            <div className="crm-field"><label>Stock</label><input type="number" value={edit.stock} onChange={set("stock")} /></div>
          </div>
          <div className="crm-field">
            <label>URL de pago (Stripe, PayPal, Bizum, TPV…)</label>
            <input value={edit.paymentUrl} onChange={set("paymentUrl")} placeholder="https://buy.stripe.com/… o https://paypal.me/…" />
          </div>
          <div className="crm-two">
            <div className="crm-field"><label>Texto del botón</label><input value={edit.buyLabel} onChange={set("buyLabel")} placeholder="Comprar" maxLength={40} /></div>
            <div className="crm-field" style={{ display: "flex", alignItems: "flex-end" }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 500 }}><input type="checkbox" checked={edit.public !== false} onChange={set("public")} style={{ width: "auto" }} /> Página pública activa</label>
            </div>
          </div>
          {err && <p style={{ color: "#b3261e", margin: "6px 0 0" }}>{err}</p>}
        </CrmModal>
      )}

      {editCat && (
        <CrmModal
          title={editCat.id ? "Editar catálogo" : "Nuevo catálogo"}
          onClose={() => setEditCat(null)}
          footer={
            <>
              <button className="crm-btn ghost" onClick={() => setEditCat(null)}>Cancelar</button>
              <button className="crm-btn" onClick={saveCat} disabled={saving}>{saving ? "Guardando…" : editCat.id ? "Guardar cambios" : "Crear catálogo"}</button>
            </>
          }
        >
          <div className="crm-field"><label>Nombre</label><input value={editCat.name} onChange={(e) => setEditCat((c) => ({ ...c, name: e.target.value }))} autoFocus placeholder="Cursos de otoño" /></div>
          <div className="crm-field"><label>Descripción</label><input value={editCat.description} onChange={(e) => setEditCat((c) => ({ ...c, description: e.target.value }))} maxLength={500} /></div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "4px 0 10px" }}><input type="checkbox" checked={editCat.active !== false} onChange={(e) => setEditCat((c) => ({ ...c, active: e.target.checked }))} style={{ width: "auto" }} /> Publicado</label>
          {editCat.productIds.length > 0 && (
            <div className="crm-field">
              <label>Orden en el catálogo</label>
              {editCat.productIds.map((id, i) => byId[id] && (
                <div key={id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                  <Thumb src={byId[id].imageUrl} size={28} /><span style={{ flex: 1 }}>{byId[id].name}</span>
                  <button className="crm-btn ghost sm" onClick={() => moveInCat(i, -1)} disabled={i === 0}>↑</button>
                  <button className="crm-btn ghost sm" onClick={() => moveInCat(i, 1)} disabled={i === editCat.productIds.length - 1}>↓</button>
                  <button className="crm-btn ghost sm" onClick={() => toggleInCat(id)}>✕</button>
                </div>
              ))}
            </div>
          )}
          <div className="crm-field">
            <label>Añadir productos</label>
            <div style={{ maxHeight: 220, overflow: "auto", border: "1px solid var(--crm-line)", borderRadius: 8, padding: 6 }}>
              {items.filter((p) => !editCat.productIds.includes(p.id)).map((p) => (
                <div key={p.id} onClick={() => toggleInCat(p.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 4px", cursor: "pointer" }}>
                  <Thumb src={p.imageUrl} size={28} /><span style={{ flex: 1 }}>{p.name}</span><small>{money(p.price)}</small><b style={{ color: "var(--crm-teal)" }}>+</b>
                </div>
              ))}
              {!items.length && <small>Primero crea productos.</small>}
            </div>
          </div>
          {err && <p style={{ color: "#b3261e", margin: "6px 0 0" }}>{err}</p>}
        </CrmModal>
      )}

      {share && <ShareModal {...share} onClose={() => setShare(null)} />}
    </div>
  );
}

function ShareModal({ kind, id, name, onClose }) {
  const url = `${SITE}/${kind}/${id}`;
  const iframe = `<iframe src="${url}?embed=1" width="100%" height="${kind === "p" ? 720 : 900}" style="border:0;max-width:480px" loading="lazy" title="${name.replace(/"/g, "&quot;")}"></iframe>`;
  const [copied, setCopied] = useState("");
  const copy = async (k, text) => {
    try { await navigator.clipboard.writeText(text); setCopied(k); setTimeout(() => setCopied(""), 1500); } catch { /* sin portapapeles */ }
  };
  const box = { width: "100%", fontFamily: "monospace", fontSize: 12.5 };
  return (
    <CrmModal title={`Compartir · ${name}`} onClose={onClose} footer={<button className="crm-btn" onClick={onClose}>Cerrar</button>}>
      <div className="crm-field">
        <label>Enlace {kind === "p" ? "del producto" : "del catálogo"} (al pegarlo en WhatsApp sale con foto y precio)</label>
        <div style={{ display: "flex", gap: 6 }}>
          <input readOnly value={url} style={box} onFocus={(e) => e.target.select()} />
          <button className="crm-btn ghost sm" onClick={() => copy("url", url)}>{copied === "url" ? "✓ Copiado" : "Copiar"}</button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "4px 0 14px" }}>
        <a className="crm-btn" href={`https://wa.me/?text=${encodeURIComponent(`${name} ${url}`)}`} target="_blank" rel="noreferrer">Enviar por WhatsApp</a>
        <a className="crm-btn ghost" href={url} target="_blank" rel="noreferrer">Ver página</a>
      </div>
      <div className="crm-field">
        <label>Código para incrustar en una web (&lt;iframe&gt;)</label>
        <textarea readOnly rows={3} value={iframe} style={box} onFocus={(e) => e.target.select()} />
        <button className="crm-btn ghost sm" style={{ marginTop: 6 }} onClick={() => copy("iframe", iframe)}>{copied === "iframe" ? "✓ Copiado" : "Copiar código"}</button>
      </div>
    </CrmModal>
  );
}
