import Header from "../modules/home/components/Header/Header.jsx";
import ResourcesSection from "../modules/home/components/ResourcesSection/ResourcesSection.jsx";
import "./Pages.styles.css";

export default function Blog() {
  return (
    <>
      <Header />
      <div className="PageContainer">
        <ResourcesSection
          category="Blog"
          title="Blog"
          subtitle="Artículos sobre marketing, email, automatización y comunicación digital."
        />
      </div>
    </>
  );
}
