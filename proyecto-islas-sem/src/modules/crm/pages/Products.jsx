import { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import CrmModal from "../components/CrmModal";
import { useCrmCollection, crmCreate, crmRemove, money } from "../lib/crm";
import "../crm.styles.css";

const empty = { name: "", sku: "", category: "", price: 0, stock: 0 };

export default function Products() {
  const { items, loading, orgId } = useCrmCollection("products");
  const [term, setTerm] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef(null);

  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    const rows = [...items].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    if (!t) return rows;
    return rows.filter((p) => [p.name, p.sku, p.category].filter(Boolean).some((v) => String(v).toLowerCase().includes(t)));
  }, [items, term]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await crmCreate("products", orgId, { ...form, price: Number(form.price) || 0, stock: Number(form.stock) || 0 });
      setForm(empty);
      setShowNew(false);
    } catch (e) {
      alert("No se pudo guardar: " + e.message);
    } finally {
      setSaving(false);
    }
  };

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
          try {
            await crmCreate("products", orgId, {
              name: String(name).trim(),
              sku: row.sku || row.SKU || row.Codigo || row.codigo || "",
              category: row.category || row.Categoria || row.categoria || "",
              price,
              stock: parseInt(row.stock || row.Stock || "0") || 0,
            });
            ok++;
          } catch (_) {}
        }
        setImporting(false);
        alert(`Importados ${ok} productos.`);
        if (fileRef.current) fileRef.current.value = "";
      },
    });
  };

  return (
    <div className="crm">
      <div className="crm__top">
        <div>
          <h1>Catálogo de producto</h1>
          <p>Productos y servicios que se pueden añadir a las negociaciones.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="crm-btn ghost" onClick={() => fileRef.current?.click()} disabled={importing}>
            {importing ? "Importando…" : "⬆ Importar CSV"}
          </button>
          <input ref={fileRef} type="file" accept=".csv" hidden onChange={onFile} />
          <button className="crm-btn" onClick={() => setShowNew(true)}>+ Nuevo producto</button>
        </div>
      </div>

      <input className="crm-search" placeholder="Buscar producto…" value={term} onChange={(e) => setTerm(e.target.value)} />

      {loading ? (
        <div className="crm-loading">Cargando catálogo…</div>
      ) : (
        <table className="crm-table">
          <thead>
            <tr><th>Producto</th><th>SKU</th><th>Categoría</th><th>Precio</th><th>Stock</th><th></th></tr>
          </thead>
          <tbody>
            {filtered.length ? (
              filtered.map((p) => (
                <tr key={p.id}>
                  <td><b>{p.name}</b></td>
                  <td>{p.sku || "—"}</td>
                  <td>{p.category || "—"}</td>
                  <td>{money(p.price)}</td>
                  <td>{p.stock || 0}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="crm-btn ghost sm" onClick={() => window.confirm(`¿Eliminar "${p.name}"?`) && crmRemove("products", p.id)}>Eliminar</button>
                  </td>
                </tr>
              ))
            ) : (
              <tr><td colSpan="6" className="crm-empty">Aún no hay productos. Añade uno o importa un CSV (columnas: name, price, sku, category, stock).</td></tr>
            )}
          </tbody>
        </table>
      )}

      {showNew && (
        <CrmModal
          title="Nuevo producto"
          onClose={() => setShowNew(false)}
          footer={
            <>
              <button className="crm-btn ghost" onClick={() => setShowNew(false)}>Cancelar</button>
              <button className="crm-btn" onClick={save} disabled={saving}>{saving ? "Guardando…" : "Crear producto"}</button>
            </>
          }
        >
          <div className="crm-field"><label>Nombre</label><input value={form.name} onChange={set("name")} autoFocus /></div>
          <div className="crm-two">
            <div className="crm-field"><label>SKU / Código</label><input value={form.sku} onChange={set("sku")} /></div>
            <div className="crm-field"><label>Categoría</label><input value={form.category} onChange={set("category")} /></div>
          </div>
          <div className="crm-two">
            <div className="crm-field"><label>Precio (€)</label><input type="number" value={form.price} onChange={set("price")} /></div>
            <div className="crm-field"><label>Stock</label><input type="number" value={form.stock} onChange={set("stock")} /></div>
          </div>
        </CrmModal>
      )}
    </div>
  );
}
