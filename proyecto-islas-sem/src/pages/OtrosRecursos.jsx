import Header from "../modules/home/components/Header/Header.jsx";
import ResourcesSection from "../modules/home/components/ResourcesSection/ResourcesSection.jsx";
import "./Pages.styles.css";

export default function OtrosRecursos() {
  return (
    <>
      <Header />
      <div className="PageContainer">
        <ResourcesSection
          category="Otros recursos"
          title="Otros recursos"
          subtitle="Guías, ebooks, plantillas y material descargable."
        />
      </div>
    </>
  );
}
