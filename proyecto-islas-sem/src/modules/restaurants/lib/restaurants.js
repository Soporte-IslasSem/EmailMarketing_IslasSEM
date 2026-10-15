// Restaurantes: ficha de cliente para restaurantes (colección "restaurants", por orgId).
// De momento todos los datos se meten a mano; más adelante se podrán traer de la web
// del restaurante. Separado del CRM a propósito.

export const COLLECTION = "restaurants";

// Valores de partida de una ficha nueva.
export const EMPTY = {
  name: "", city: "", cuisine: "", website: "", logo: "",
  maps: "", tour360: "", instagram: "", facebook: "", tiktok: "", tripadvisor: "", otherSocial: "", freeToilets: "",
  menuText: "", menuLink: "", qr: "", phoneLandline: "", phoneMobile: "", whatsapp: "", bookingCalendar: "",
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
