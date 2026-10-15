// Restaurantes: ficha de cliente para restaurantes (colección "restaurants", por orgId).
// De momento todos los datos se meten a mano; más adelante se podrán traer de la web
// del restaurante. Separado del CRM a propósito.

export const COLLECTION = "restaurants";

// Valores de partida de una ficha nueva.
export const EMPTY = {
  name: "", city: "", cuisine: "", website: "", logo: "",
  maps: "", tour360: "", instagram: "", facebook: "", tiktok: "", tripadvisor: "", otherSocial: "", freeToilets: "",
  menuText: "", menuLink: "", qr: "", phoneLandline: "", phoneMobile: "", whatsapp: "", email: "", bookingCalendar: "",
  customerCount: "", birthdayAutomation: false,
  dataSources: [
    { from: "Código QR cautivo", to: "Data del móvil" },
    { from: "Código QR lectura de la carta", to: "Pedidos online" },
    { from: "Citas especiales", to: "Citas favoritas" },
  ],
  nfcUnits: "", reviewsGoogle: "", reviewsTripadvisor: "",
  timeTracking: "Fichaje activo", rgpdLink: "", tpvStatus: "En proceso",
};

export const TIME_TRACKING = ["Fichaje activo", "Sin fichaje"];
export const TPV_STATUS = ["En proceso", "Integrado", "Sin integración"];

// Convierte lo que escriba el usuario en un enlace que se pueda abrir.
export function toUrl(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  if (/^(https?:|mailto:|tel:)/i.test(s)) return s;
  return "https://" + s.replace(/^\/+/, "");
}

export const waUrl = (v) => {
  const d = String(v || "").replace(/\D/g, "");
  return d ? `https://wa.me/${d}` : "";
};

// Imagen → data URL reducida (logo / QR subido), para guardarla en la propia ficha.
export function imageToDataUrl(file, max = 320) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error("El archivo no es una imagen."));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("No se pudo abrir la imagen."));
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/png"));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Campos que cuentan para "ficha completa" (los del diseño, sin contar La data ni los estados).
export const FIELDS = [
  ["website", "Quién soy"], ["maps", "Ubicación"], ["tour360", "Visita 360º"], ["cuisine", "Propuesta gastronómica"],
  ["instagram", "Instagram"], ["facebook", "Facebook"], ["tiktok", "TikTok"], ["tripadvisor", "TripAdvisor"], ["otherSocial", "Otras redes"],
  ["freeToilets", "Baños gratis"], ["menuText", "Carta y precios"], ["menuLink", "Enlace del menú"], ["qr", "Código QR"],
  ["phoneLandline", "Teléfono fijo"], ["phoneMobile", "Teléfono móvil"], ["whatsapp", "WhatsApp"], ["email", "Email de contacto"], ["bookingCalendar", "Calendario de reservas"],
  ["customerCount", "Base de datos de clientela"], ["nfcUnits", "NFC en mesa"], ["reviewsGoogle", "Reseñas Google"],
  ["reviewsTripadvisor", "Reseñas TripAdvisor"], ["rgpdLink", "RGPD"], ["city", "Ciudad"], ["logo", "Logo"],
];
const filled = (v) => v !== undefined && v !== null && String(v).trim() !== "";
export const missingFields = (r) => FIELDS.filter(([k]) => !filled(r[k]));
export const completion = (r) => Math.round(((FIELDS.length - missingFields(r).length) / FIELDS.length) * 100);
export const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Texto en el que busca el buscador superior (nombre, ciudad, cocina, enlaces y teléfonos).
const SEARCH_KEYS = ["name", "city", "cuisine", "website", "maps", "tour360", "instagram", "facebook", "tiktok", "tripadvisor", "otherSocial",
  "menuText", "menuLink", "phoneLandline", "phoneMobile", "whatsapp", "email", "bookingCalendar", "reviewsGoogle", "reviewsTripadvisor", "rgpdLink"];
export function searchRestaurants(items, term) {
  const t = String(term || "").trim().toLowerCase();
  if (!t) return [];
  const out = [];
  for (const r of items) {
    const hit = SEARCH_KEYS.find((k) => String(r[k] || "").toLowerCase().includes(t));
    if (hit) out.push({ r, field: hit });
  }
  return out.slice(0, 12);
}

// Ajustes de la sección (nombre de la marca), un documento por organización.
export const SETTINGS_COLLECTION = "restaurantSettings";
export const DEFAULT_BRAND = "ISLAS SEM CRM";
