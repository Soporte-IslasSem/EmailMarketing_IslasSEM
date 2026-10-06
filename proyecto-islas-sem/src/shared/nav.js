// Navegación estilo prototipo: áreas en el lateral + barra superior de pestañas
// por área (algunas con desplegable). Portado del prototipo islas-sem-demo.

export const AREAS = [
  { id: "inicio", label: "Inicio", icon: "home", tabs: [["/dashboard", "Inicio"]] },
  {
    id: "marketing",
    label: "Email Marketing",
    icon: "plane",
    tabs: [
      ["/dashboard/campaigns", "Campañas"],
      ["/dashboard/automations", "Automatizaciones"],
      ["/dashboard/lists", "Listas"],
      ["/dashboard/templates", "Plantillas"],
      ["/dashboard/reports", "Informes"],
      ["/dashboard/forms", "Formularios"],
    ],
  },
  {
    id: "crm",
    label: "CRM",
    icon: "crm",
    tabs: [
      ["/dashboard/crm/leads", "Prospectos"],
      ["/dashboard/crm/pipeline", "Negociaciones"],
      { label: "Clientes", menu: [["/dashboard/crm/contacts", "Contactos"], ["/dashboard/crm/companies", "Compañías"]] },
      { label: "Ventas", menu: [["/dashboard/crm/quotes", "Cotizaciones"], ["/dashboard/crm/invoices", "Facturas"], ["/dashboard/crm/products", "Catálogo de producto"], ["/dashboard/crm/outbox", "Bandeja de salida"]] },
      ["/dashboard/crm/analytics", "Analítica"],
      { label: "Más", menu: [["/dashboard/crm/activities", "Mis actividades"], ["/dashboard/crm/forms", "Formularios"], ["/dashboard/crm/history", "Historial"], ["/dashboard/crm/recyclebin", "Papelera de reciclaje"], ["/dashboard/crm/settings", "Ajustes de CRM"]] },
    ],
  },
  {
    id: "tasks",
    label: "Tareas",
    icon: "task",
    tabs: [["/dashboard/tasks", "Lista"], ["/dashboard/tasks/calendar", "Calendario"]],
  },
  {
    id: "admin",
    label: "Administración",
    icon: "shield",
    tabs: [
      ["/dashboard/admin/team", "Empleados"],
      ["/dashboard/admin/departments", "Departamentos"],
      { label: "Equipos y roles", menu: [["/dashboard/admin/salesteams", "Equipos comerciales"], ["/dashboard/admin/roles", "Roles y permisos"]] },
      { label: "Sistema", menu: [["/dashboard/admin/integraciones", "Integraciones / API"], ["/dashboard/admin/audit", "Registro"]] },
    ],
  },
];

export const tabMenu = (t) => (Array.isArray(t) ? [t] : t.menu);
export const tabRoutes = (t) => (Array.isArray(t) ? [t[0]] : t.menu.map((m) => m[0]));

// Prefijo de sección → área (para rutas de detalle no listadas como pestaña)
const SECTION = [
  ["/dashboard/crm", "crm"],
  ["/dashboard/admin", "admin"],
  ["/dashboard/tasks", "tasks"],
  ["/dashboard/campaigns", "marketing"],
  ["/dashboard/lists", "marketing"],
  ["/dashboard/templates", "marketing"],
  ["/dashboard/reports", "marketing"],
  ["/dashboard/automations", "marketing"],
  ["/dashboard/forms", "marketing"],
];

export function areaOf(pathname) {
  // 1) coincidencia por ruta exacta de pestaña (la más específica gana)
  let best = null;
  let bestLen = -1;
  for (const a of AREAS) {
    for (const t of a.tabs) {
      for (const route of tabRoutes(t)) {
        // la ruta "/dashboard" (Inicio) solo coincide exacta; el resto por prefijo
        const match = pathname === route || (route !== "/dashboard" && pathname.startsWith(route + "/"));
        if (match && route.length > bestLen) {
          best = a;
          bestLen = route.length;
        }
      }
    }
  }
  if (best) return best;
  // 2) por prefijo de sección (rutas de detalle, p. ej. /dashboard/crm/deals/:id)
  const sec = SECTION.find(([p]) => pathname.startsWith(p));
  if (sec) return AREAS.find((a) => a.id === sec[1]) || AREAS[0];
  return AREAS[0];
}

export function firstRoute(area) {
  const t = area.tabs[0];
  return Array.isArray(t) ? t[0] : t.menu[0][0];
}

// Breadcrumb / título de página para el Header (como el prototipo)
const CRUMB = {
  "/dashboard": "Inicio",
  "/dashboard/campaigns": "Campañas",
  "/dashboard/automations": "Automatizaciones",
  "/dashboard/lists": "Listas",
  "/dashboard/templates": "Plantillas",
  "/dashboard/reports": "Informes",
  "/dashboard/forms": "Formularios",
  "/dashboard/crm/leads": "Prospectos",
  "/dashboard/crm/pipeline": "Negociaciones",
  "/dashboard/crm/newdeal": "Nueva negociación",
  "/dashboard/crm/contacts": "Contactos · Base de datos",
  "/dashboard/crm/companies": "Compañías · Empresas",
  "/dashboard/crm/analytics": "Analítica de ventas",
  "/dashboard/crm/quotes": "Cotizaciones",
  "/dashboard/crm/invoices": "Facturas",
  "/dashboard/crm/outbox": "Bandeja de salida",
  "/dashboard/crm/forms": "Formularios",
  "/dashboard/crm/products": "Productos · Catálogo",
  "/dashboard/crm/activities": "Mis actividades",
  "/dashboard/crm/automation": "Automatización de ventas",
  "/dashboard/crm/history": "Historial de CRM",
  "/dashboard/crm/recyclebin": "Papelera de reciclaje",
  "/dashboard/crm/settings": "Ajustes de CRM",
  "/dashboard/tasks": "Tareas · Mis tareas",
  "/dashboard/tasks/calendar": "Tareas · Calendario",
  "/dashboard/admin/team": "Empleados · Estructura de empresa",
  "/dashboard/admin/departments": "Departamentos",
  "/dashboard/admin/salesteams": "Equipos comerciales",
  "/dashboard/admin/roles": "Roles y permisos",
  "/dashboard/admin/integraciones": "Integraciones / API",
  "/dashboard/admin/audit": "Registro / Auditoría",
};
export function crumbOf(pathname) {
  if (CRUMB[pathname]) return CRUMB[pathname];
  if (/^\/dashboard\/crm\/deals\//.test(pathname)) return "Negociación";
  if (/^\/dashboard\/crm\/contacts\//.test(pathname)) return "Contacto";
  // prefijo más largo
  let best = "";
  for (const p of Object.keys(CRUMB)) if (pathname.startsWith(p) && p.length > best.length) best = p;
  return best ? CRUMB[best] : "";
}
