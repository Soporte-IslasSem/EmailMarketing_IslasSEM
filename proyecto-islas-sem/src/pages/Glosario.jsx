import Header from "../modules/home/components/Header/Header.jsx";
import ResourcesSection from "../modules/home/components/ResourcesSection/ResourcesSection.jsx";
import "./Pages.styles.css";

export default function Glosario() {
  return (
    <>
      <Header />
      <div className="PageContainer">
        <ResourcesSection
          category="Glosario"
          title="Glosario"
          subtitle="Conceptos clave del marketing digital explicados de forma sencilla."
        />
      </div>
    </>
  );
}
