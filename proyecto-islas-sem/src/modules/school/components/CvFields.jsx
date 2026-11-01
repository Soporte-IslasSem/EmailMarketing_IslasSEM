// Campos del currículum (los mismos en el formulario público de alta y en la ficha del alumno).
// value: { firstName, lastName, email, phone, city, hasCar, headline, specialties[], profile,
//          experience[], education[], skills[], competencies[], languages[] }
import { LANG_LEVELS } from "../lib/school";
import "../school.css";

const EXP = { title: "", company: "", from: "", to: "", description: "", bullets: [] };
const EDU = { title: "", center: "", from: "", to: "" };

// Lista separada por comas ⇄ array
const csv = (a) => (a || []).join(", ");
const fromCsv = (t) => String(t || "").split(",").map((x) => x.trim()).filter(Boolean);

function Rows({ title, hint, items, empty, onChange, render, addLabel, max = 8 }) {
  const set = (i, patch) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <fieldset className="sc-fs">
      <legend>{title}</legend>
      {hint && <p className="sc-hint">{hint}</p>}
      {items.map((it, i) => (
        <div key={i} className="sc-row">
          <div className="sc-row__body">{render(it, (patch) => set(i, patch))}</div>
          <button type="button" className="sc-x" title="Quitar" onClick={() => onChange(items.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      {items.length < max && <button type="button" className="sc-add" onClick={() => onChange([...items, { ...empty }])}>+ {addLabel}</button>}
    </fieldset>
  );
}

export default function CvFields({ value, onChange, showContact = true }) {
  const v = value;
  const set = (k) => (e) => onChange({ ...v, [k]: e?.target ? (e.target.type === "checkbox" ? e.target.checked : e.target.value) : e });
  return (
    <div className="sc-cv">
      {showContact && (
        <fieldset className="sc-fs">
          <legend>Tus datos</legend>
          <div className="sc-two">
            <label>Nombre *<input value={v.firstName} onChange={set("firstName")} required maxLength={80} /></label>
            <label>Apellidos *<input value={v.lastName} onChange={set("lastName")} required maxLength={120} /></label>
          </div>
          <div className="sc-two">
            <label>Email *<input type="email" value={v.email} onChange={set("email")} required maxLength={160} /></label>
            <label>Teléfono<input value={v.phone} onChange={set("phone")} maxLength={40} /></label>
          </div>
          <div className="sc-two">
            <label>Ciudad / ubicación<input value={v.city} onChange={set("city")} maxLength={80} placeholder="Ej. Las Palmas de Gran Canaria" /></label>
            <label className="sc-check"><input type="checkbox" checked={!!v.hasCar} onChange={set("hasCar")} /> Dispongo de coche</label>
          </div>
        </fieldset>
      )}
      <fieldset className="sc-fs">
        <legend>Tu perfil</legend>
        <label>Puesto que buscas<input value={v.headline} onChange={set("headline")} maxLength={100} placeholder="Ej. Community Manager junior" /></label>
        <label>Especialidades <small>(separadas por comas)</small>
          <input value={csv(v.specialties)} onChange={(e) => onChange({ ...v, specialties: fromCsv(e.target.value) })} placeholder="Ej. Diseño gráfico, Vídeo, Redes sociales" />
        </label>
        <label>Sobre ti <small>(perfil profesional, 3-5 líneas)</small>
          <textarea rows={4} value={v.profile} onChange={set("profile")} maxLength={1500} placeholder="Qué sabes hacer, qué te gusta y qué buscas en las prácticas." />
        </label>
      </fieldset>

      <Rows title="Experiencia laboral" hint="Trabajos o prácticas (si no tienes, déjalo vacío)." items={v.experience} empty={EXP} addLabel="Añadir experiencia"
        onChange={(experience) => onChange({ ...v, experience })}
        render={(it, set1) => (
          <>
            <div className="sc-two">
              <label>Puesto<input value={it.title} onChange={(e) => set1({ title: e.target.value })} maxLength={120} /></label>
              <label>Empresa<input value={it.company} onChange={(e) => set1({ company: e.target.value })} maxLength={120} /></label>
            </div>
            <div className="sc-two">
              <label>Desde<input value={it.from} onChange={(e) => set1({ from: e.target.value })} placeholder="Ej. Febrero 2025" maxLength={40} /></label>
              <label>Hasta<input value={it.to} onChange={(e) => set1({ to: e.target.value })} placeholder="Ej. Actualidad" maxLength={40} /></label>
            </div>
            <label>Qué hacías<textarea rows={2} value={it.description} onChange={(e) => set1({ description: e.target.value })} maxLength={600} /></label>
            <label>Logros o tareas <small>(una por línea)</small>
              <textarea rows={2} value={(it.bullets || []).join("\n")} onChange={(e) => set1({ bullets: e.target.value.split("\n").map((x) => x.trimStart()).slice(0, 8) })} />
            </label>
          </>
        )} />

      <Rows title="Formación académica" items={v.education} empty={EDU} addLabel="Añadir estudios"
        onChange={(education) => onChange({ ...v, education })}
        render={(it, set1) => (
          <>
            <div className="sc-two">
              <label>Título<input value={it.title} onChange={(e) => set1({ title: e.target.value })} maxLength={160} placeholder="Ej. Grado Superior en Marketing" /></label>
              <label>Centro<input value={it.center} onChange={(e) => set1({ center: e.target.value })} maxLength={120} /></label>
            </div>
            <div className="sc-two">
              <label>Desde<input value={it.from} onChange={(e) => set1({ from: e.target.value })} maxLength={40} /></label>
              <label>Hasta<input value={it.to} onChange={(e) => set1({ to: e.target.value })} maxLength={40} /></label>
            </div>
          </>
        )} />

      <Rows title="Tecnologías y herramientas" hint="Programas que manejas y tu nivel (0-100 %)." items={v.skills} empty={{ name: "", level: 70 }} addLabel="Añadir herramienta" max={12}
        onChange={(skills) => onChange({ ...v, skills })}
        render={(it, set1) => (
          <div className="sc-two">
            <label>Herramienta<input value={it.name} onChange={(e) => set1({ name: e.target.value })} maxLength={50} placeholder="Ej. Canva" /></label>
            <label>Nivel: {it.level}%<input type="range" min="0" max="100" step="5" value={it.level} onChange={(e) => set1({ level: Number(e.target.value) })} /></label>
          </div>
        )} />

      <fieldset className="sc-fs">
        <legend>Competencias</legend>
        <label><small>Separadas por comas</small>
          <input value={csv(v.competencies)} onChange={(e) => onChange({ ...v, competencies: fromCsv(e.target.value) })} placeholder="Ej. Trabajo en equipo, Creatividad, Organización" />
        </label>
      </fieldset>

      <Rows title="Idiomas" items={v.languages} empty={{ name: "", level: "B1" }} addLabel="Añadir idioma" max={6}
        onChange={(languages) => onChange({ ...v, languages })}
        render={(it, set1) => (
          <div className="sc-two">
            <label>Idioma<input value={it.name} onChange={(e) => set1({ name: e.target.value })} maxLength={40} /></label>
            <label>Nivel<select value={it.level} onChange={(e) => set1({ level: e.target.value })}>{LANG_LEVELS.map((l) => <option key={l}>{l}</option>)}</select></label>
          </div>
        )} />
    </div>
  );
}
