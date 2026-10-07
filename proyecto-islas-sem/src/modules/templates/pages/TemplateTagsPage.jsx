import TemplateTagsList from "../components/Templates/TemplateTagsList";
import TemplatesTabs from "../components/Templates/TemplatesTabs";
import useTemplates from "../hooks/useTemplates";
import "./TemplateTagsPage.styles.css";

export default function TemplateTagsPage() {
  const { templates } = useTemplates();
  return (
    <div className="TemplateTagsPage">
      <TemplatesTabs active="etiquetas" mineCount={templates.length} />
      <TemplateTagsList />
    </div>
  );
}
