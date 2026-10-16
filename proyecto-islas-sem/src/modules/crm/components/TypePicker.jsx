// Tipos de cliente de un contacto en un solo clic: se abre la lista de tipos y cada uno se
// marca o desmarca al momento (cada tipo es una lista de Email Marketing), sin salir de la
// página. Lo usan la tabla de Contactos y la ficha. Solo los administradores cambian tipos.
import { useEffect, useRef, useState } from "react";
import TypeChip from "./TypeChip";
import { crmUpdate } from "../lib/crm";
import { useClientTypes, typeOf, typesOf, typeFields } from "../lib/clientTypes";

export default function TypePicker({ item, canEdit, onChange }) {
  const { types } = useClientTypes();
  const [open, setOpen] = useState(null); // null o { top, left } (fijo: la tabla recorta lo que sobresale)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const box = useRef(null);
  const cur = typesOf(item);

  useEffect(() => {
    if (!open) return undefined;
    const outside = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(null); };
    const esc = (e) => { if (e.key === "Escape") setOpen(null); };
    const close = (e) => { if (!box.current?.contains(e.target)) setOpen(null); }; // no al desplazar el propio menú
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close);
    };
  }, [open]);

  const toggle = async (id) => {
    const patch = typeFields(cur.includes(id) ? cur.filter((t) => t !== id) : [...cur, id]);
    setBusy(true);
    setError("");
    try {
      await crmUpdate("contacts", item.id, patch);
      onChange?.(patch);
    } catch (e) {
      setError(e.code === "permission-denied" ? "Sin permiso para cambiar el tipo." : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };

  const chips = cur.length
    ? cur.map((id) => <TypeChip key={id} t={typeOf(types, id)} />)
    : <TypeChip t={null} />;
  if (!canEdit) return <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>{chips}</span>;
  // Tipos que ya no existen pero siguen en el contacto: también se pueden quitar.
  const options = [...types, ...cur.filter((id) => !types.some((t) => t.id === id)).map((id) => typeOf(types, id))];

  return (
    <span ref={box} className="crm-typepick">
      <button type="button" className="crm-typepick__btn" onClick={(e) => {
        if (open) return setOpen(null);
        const r = e.currentTarget.getBoundingClientRect();
        // Abajo si cabe; si no, encima del botón.
        const below = window.innerHeight - r.bottom > 300;
        setOpen({ left: Math.min(r.left, window.innerWidth - 250), ...(below ? { top: r.bottom + 4 } : { bottom: window.innerHeight - r.top + 4 }) });
      }} title="Cambiar tipo de cliente">
        {chips}<span className="crm-typepick__edit">✎</span>
      </button>
      {open && (
        <div className="crm-typepick__menu" style={open}>
          <div className="crm-typepick__t">Tipo de cliente {busy && <span>· guardando…</span>}</div>
          {options.map((t) => (
            <label key={t.id}>
              <input type="checkbox" checked={cur.includes(t.id)} disabled={busy} onChange={() => toggle(t.id)} />
              <TypeChip t={t} />
            </label>
          ))}
          {error && <div className="crm-typepick__err">{error}</div>}
          <div className="crm-typepick__hint">Marcar añade el tipo (entra en su lista de Email Marketing); desmarcar lo quita.</div>
          <button type="button" className="crm-btn sm" style={{ width: "100%", marginTop: 8 }} onClick={() => setOpen(null)}>Hecho</button>
        </div>
      )}
    </span>
  );
}
