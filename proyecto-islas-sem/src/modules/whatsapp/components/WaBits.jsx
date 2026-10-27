// Iconos pequeños de WhatsApp: el del canal y la bandera del país del número.
import { countryOf } from "../lib/api";

export const WaIcon = ({ size = 14 }) => (
  <svg className="wa-chan" width={size} height={size} viewBox="0 0 24 24" aria-label="WhatsApp"><path fill="#25D366" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Z" /><path fill="#fff" d="M8.6 7.5c.2-.4.4-.4.7-.4h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2.1.4 0 .6l-.4.6-.4.4c-.1.2-.2.3 0 .6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.8-1c.2-.3.4-.2.6-.1l1.8.9c.3.1.5.2.5.3.1.2.1.8-.2 1.5-.3.7-1.4 1.3-1.9 1.3-.5.1-1.1.1-1.8-.1-.4-.1-1-.3-1.7-.6-3-1.3-5-4.3-5.1-4.5-.2-.2-1.2-1.6-1.2-3s.8-2.2 1-2.5Z" /></svg>
);

// Bandera del país del número (imagen: Windows no pinta las banderas emoji).
export function Flag({ phone }) {
  const cc = countryOf(phone);
  return cc ? <img className="wa-flag" src={`https://flagcdn.com/20x15/${cc}.png`} width="20" height="15" alt={cc.toUpperCase()} title={cc.toUpperCase()} loading="lazy" /> : null;
}
