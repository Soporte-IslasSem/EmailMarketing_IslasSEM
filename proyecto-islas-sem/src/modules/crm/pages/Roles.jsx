import "../crm.styles.css";

const ROLES = ["Full access", "Administrador", "Manager", "COLABORADORES", "PROVEEDORES", "ALUMNO/AS EN PRÁCTICAS", "Whatsapp & Tareas", "RL"];
const ENTITIES = ["Prospectos", "Negociaciones", "Contactos", "Compañías", "Productos", "Cotizaciones", "Facturas", "Campañas"];
const PERMS = ["Leer", "Agregar", "Editar", "Eliminar", "Exportar", "Importar"];

// Nivel de acceso por rol (0 = denegar, 1 = propios, 2 = todo). Replica del prototipo.
const LEVELS = {
  "Full access": 2, "Administrador": 2, "Manager": 2, "COLABORADORES": 1,
  "PROVEEDORES": 1, "ALUMNO/AS EN PRÁCTICAS": 1, "Whatsapp & Tareas": 1, "RL": 0,
};
const cell = (lvl) => (lvl === 2 ? { t: "Todo", c: "ok" } : lvl === 1 ? { t: "Propios", c: "info" } : { t: "Denegar", c: "bad" });

export default function Roles() {
  return (
    <div className="crm">
      <div className="crm__top">
        <div><h1>Roles y permisos</h1><p>Matriz de acceso por rol y entidad del CRM (Leer/Agregar/Editar/Eliminar/Exportar/Importar).</p></div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="crm-table" style={{ minWidth: 720 }}>
          <thead>
            <tr>
              <th>Rol</th>
              {PERMS.map((p) => <th key={p}>{p}</th>)}
            </tr>
          </thead>
          <tbody>
            {ROLES.map((r) => {
              const lvl = LEVELS[r];
              const c = cell(lvl);
              return (
                <tr key={r}>
                  <td><b>{r}</b></td>
                  {PERMS.map((p) => (
                    <td key={p}>
                      <span className={`crm-chip ${p === "Eliminar" && lvl < 2 ? "bad" : c.c}`}>
                        {p === "Eliminar" && lvl < 2 ? "Denegar" : c.t}
                      </span>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="crm-panel" style={{ marginTop: 16 }}>
        <h4 style={{ marginTop: 0 }}>Entidades cubiertas</h4>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {ENTITIES.map((e) => <span key={e} className="crm-chip">{e}</span>)}
        </div>
        <p style={{ color: "var(--crm-muted)", fontSize: 13, marginBottom: 0 }}>
          Los roles y su nivel de acceso se replican del CRM real (Bitrix). La edición fina por entidad se conectará a la organización en la siguiente fase.
        </p>
      </div>
    </div>
  );
}
