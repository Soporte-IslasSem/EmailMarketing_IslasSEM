import Header from "../modules/home/components/Header/Header.jsx";
import ResourcesSection from "../modules/home/components/ResourcesSection/ResourcesSection.jsx";
import "./Pages.styles.css";

export default function HerramientasGratuitas() {
  return (
    <>
      <Header />
      <div className="PageContainer">
        <ResourcesSection
          category="Herramientas gratuitas"
          title="Herramientas gratuitas"
          subtitle="Generadores de QR, firmas de email y utilidades para tus campañas."
        />
      </div>
    </>
  );
}
