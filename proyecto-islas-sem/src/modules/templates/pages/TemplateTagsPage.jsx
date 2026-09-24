import TemplateTagsList from "../components/Templates/TemplateTagsList";
import "./TemplateTagsPage.styles.css";

export default function TemplateTagsPage() {
  return (
    <div className="TemplateTagsPage">
      <h1>Etiquetas</h1>
      <p className="TemplateTagsPage__subtitle">
        Desde aquí podrás crear, editar, duplicar o eliminar tus etiquetas.
      </p>

      <TemplateTagsList />
    </div>
  );
}
