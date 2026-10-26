// Imagen de la empresa del usuario (Mi empresa): nombre, razón social, colores, logo y web, para
// los correos y PDF que se preparan en el navegador. Igual que el servidor (lib/tenant.js brandOf).
// DashboardLayout la deja puesta (setBrand) en cuanto carga la empresa.
import { useMemo } from "react";
import { usePerms } from "../modules/crm/lib/permissions";

export const ISLAS_BRAND = {
  name: "ISLAS SEM", legalName: "ISLAS SEM SLU", website: "www.islassem.com", place: "Canarias",
  color: "#136B68", accent: "#E2B83C", logoUrl: "", domain: "islassem.com",
};
const HEX = /^#[0-9a-f]{6}$/i;

export function brandOf(orgId, org) {
  const b = org?.brand || {};
  const base = orgId === "islas-sem" || !orgId ? ISLAS_BRAND : {};
  const name = b.name || org?.name || base.name || "";
  return {
    name, legalName: b.legalName || base.legalName || name, website: b.website || base.website || "", place: b.place || base.place || "",
    color: HEX.test(b.color || "") ? b.color : base.color || "#136B68", accent: HEX.test(b.accent || "") ? b.accent : base.accent || "#E2B83C",
    logoUrl: b.logoUrl || base.logoUrl || "", domain: b.domain || base.domain || "",
  };
}

let current = ISLAS_BRAND;
export const setBrand = (b) => { current = b || ISLAS_BRAND; };
export const getBrand = () => current;
export const footerText = (b = current) => [b.legalName || b.name, b.place, b.website].filter(Boolean).join(" · ");

export function useBrand() {
  const { orgId, org } = usePerms();
  return useMemo(() => brandOf(orgId, org), [orgId, org]);
}
