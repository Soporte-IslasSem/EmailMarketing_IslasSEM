// Tipo de cliente y responsable (trabajador o equipo) de un contacto o una empresa.
// Filas para la <dl> de la ficha; solo los administradores pueden cambiarlos.
import TypeChip from "./TypeChip";
import { crmUpdate } from "../lib/crm";
import { useClientTypes, typeOf } from "../lib/clientTypes";
import { useTaskScope } from "../lib/tasks";
import { ownerKey, ownerLabel, ownerFields } from "../lib/owners";

const SEL = { fontSize: 12.5, padding: "3px 6px", border: "1px solid #dfe7e7", borderRadius: 6 };

export default function ClientAssignRows({ collection, item, onChange }) {
  const { types } = useClientTypes();
  const scope = useTaskScope();
  const save = async (patch) => {
    await crmUpdate(collection, item.id, patch);
    onChange?.(patch);
  };
  const key = ownerKey(item);
  return (
    <>
      <div className="row"><dt>Tipo de cliente</dt><dd style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <TypeChip t={typeOf(types, item.clientType)} />
        {scope.isAdmin && (
          <select value={item.clientType || ""} onChange={(e) => save({ clientType: e.target.value })} style={SEL} title="Cambiar tipo (solo administradores)">
            <option value="">— Sin tipo —</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
            {item.clientType && !types.some((t) => t.id === item.clientType) && <option value={item.clientType}>{item.clientType}</option>}
          </select>
        )}
      </dd></div>
      <div className="row"><dt>Responsable</dt><dd style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
        {scope.isAdmin ? (
          <select value={key} onChange={(e) => save(ownerFields(scope.options.find((o) => o.key === e.target.value) || null))} style={SEL} title="Trabajador o equipo que lleva este cliente">
            <option value="">{item.responsable && !key ? `${item.responsable} (texto)` : "— Sin responsable —"}</option>
            {scope.options.filter((o) => o.type === "person").length > 0 && (
              <optgroup label="Personas">{scope.options.filter((o) => o.type === "person").map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}</optgroup>
            )}
            {scope.options.filter((o) => o.type === "team").length > 0 && (
              <optgroup label="Equipos">{scope.options.filter((o) => o.type === "team").map((o) => <option key={o.key} value={o.key}>👥 {o.name}</option>)}</optgroup>
            )}
          </select>
        ) : (
          <b>{ownerLabel(item)}</b>
        )}
      </dd></div>
    </>
  );
}
