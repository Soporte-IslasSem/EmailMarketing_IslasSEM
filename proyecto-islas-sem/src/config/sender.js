// Cuenta desde la que el servidor envía TODOS los correos (SMTP_USER del backend en Plesk).
// La dirección no se puede cambiar por campaña; el nombre visible sí.
export const SENDER_EMAIL = import.meta.env.VITE_SENDER_EMAIL || "grupo@islassem.com";
