// Comprobaciones de los datos de contrato del formulario público (las mismas que hace el
// servidor en backend/lib/forms.js): DNI/NIE/CIF con su letra o dígito de control, web y teléfono.
export function documentoValido(valor) {
  const v = String(valor || "").toUpperCase().replace(/[\s.-]/g, "");
  const LETRAS = "TRWAGMYFPDXBNJZSQVHLCKE";
  if (/^\d{8}[A-Z]$/.test(v)) return LETRAS[Number(v.slice(0, 8)) % 23] === v[8];
  if (/^[XYZ]\d{7}[A-Z]$/.test(v)) return LETRAS[Number("XYZ".indexOf(v[0]) + v.slice(1, 8)) % 23] === v[8];
  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(v)) {
    let suma = 0;
    for (let i = 0; i < 7; i++) {
      const n = Number(v[i + 1]);
      if (i % 2 === 0) { const d = n * 2; suma += Math.floor(d / 10) + (d % 10); } else suma += n;
    }
    const control = (10 - (suma % 10)) % 10;
    return v[8] === String(control) || v[8] === "JABCDEFGHI"[control];
  }
  return false;
}
export const webValida = (v) => /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(String(v).trim());
export const telefonoValido = (v) => String(v).replace(/\D/g, "").length >= 9;
// Solo campos de texto: un desplegable o una casilla tipo "¿Tienes DNI?" no es el número.
export const esCampoDocumento = (f) => f.maps === "dni" || (f.type === "text" && /\b(dni|nif|nie|cif)\b/i.test(f.k));
