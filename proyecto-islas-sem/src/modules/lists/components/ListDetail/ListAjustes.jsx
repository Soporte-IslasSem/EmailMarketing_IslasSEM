import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { useList } from "../../hooks/useList";
import "./ListAjustes.styles.css";

export default function ListAjustes() {
  const { id } = useParams();
  const { list, loadingList, updateList, saving, error } = useList(id);

  const [form, setForm] = useState({
    name: "",
    publicName: "",
    defaultSender: "",
    company: "",
    address: "",
    phone: "",
    language: "es",
  });

  useEffect(() => {
    if (list) {
      setForm({
        name: list.name || "",
        publicName: list.publicName || "",
        defaultSender: list.defaultSender || "",
        company: list.company || "",
        address: list.address || "",
        phone: list.phone || "",
        language: list.language || "es",
      });
    }
  }, [list]);

  if (loadingList) return <p>Cargando ajustes...</p>;

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await updateList(form);
  };

  return (
    <div className="ListAjustes">
      {/* HEADER SUPERIOR */}
      <div className="ajustes-header">
        <div>
          <h2 className="ajustes-title">Ajustes de la lista</h2>
          <p className="ajustes-subtitle">
            Aquí podrás configurar opciones generales de la lista.
          </p>
        </div>

        <button
          className="save-btn header-btn"
          onClick={handleSubmit}
          disabled={saving}
        >
          {saving ? "Guardando..." : "Actualizar"}
        </button>
      </div>

      {/* FORMULARIO */}
      <form className="settings-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Nombre de la lista *</label>
          <input
            type="text"
            name="name"
            value={form.name}
            onChange={handleChange}
            required
          />
        </div>

        <div className="form-group">
          <label>Nombre público de la lista</label>
          <input
            type="text"
            name="publicName"
            value={form.publicName}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label>Remitente por defecto *</label>
          <input
            type="email"
            name="defaultSender"
            value={form.defaultSender}
            onChange={handleChange}
            required
          />
        </div>

        <div className="form-group">
          <label>Empresa (opcional)</label>
          <input
            type="text"
            name="company"
            value={form.company}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label>Dirección (opcional)</label>
          <input
            type="text"
            name="address"
            value={form.address}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label>Teléfono (opcional)</label>
          <input
            type="text"
            name="phone"
            value={form.phone}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label>Idioma de la lista *</label>
          <select
            name="language"
            value={form.language}
            onChange={handleChange}
          >
            <option value="es">Español</option>
            <option value="en">Inglés</option>
          </select>
        </div>

        {error && <p className="error-text">{error}</p>}
      </form>
    </div>
  );
}
