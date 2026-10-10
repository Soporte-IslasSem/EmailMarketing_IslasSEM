// Responsable de un cliente (contacto o empresa): un trabajador o un equipo de ventas.
// Se guarda como ownerType/ownerId/ownerName/ownerEmail y, por compatibilidad con listas
// e importaciones, también en el texto `responsable`.
export const ownerKey = (x) => (x?.ownerType && x?.ownerId ? `${x.ownerType}:${x.ownerId}` : "");
export const ownerLabel = (x) => (x?.ownerType ? `${x.ownerType === "team" ? "👥 " : ""}${x.ownerName || "—"}` : x?.responsable || "—");

export function ownerFields(opt) {
  return opt
    ? { ownerType: opt.type, ownerId: opt.id, ownerName: opt.name, ownerEmail: opt.email || "", responsable: opt.name }
    : { ownerType: "", ownerId: "", ownerName: "", ownerEmail: "", responsable: "" };
}
