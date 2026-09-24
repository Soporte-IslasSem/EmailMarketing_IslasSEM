import Header from "../components/Header/Header.jsx";
import Hero from "../components/Hero/Hero.jsx";

// Secciones nuevas
import LogosSection from "../components/LogosSection/LogosSection.jsx";
import ServicesSection from "../components/ServicesSection/ServicesSection.jsx";
import StartHereSection from "../components/StartHereSection/StartHereSection.jsx";
import SegmentsSection from "../components/SegmentsSection/SegmentsSection.jsx";
import PlatformSection from "../components/PlatformSection/PlatformSection.jsx";
import ProductivitySection from "../components/ProductivitySection/ProductivitySection.jsx";
import TestimonialsSection from "../components/TestimonialsSection/TestimonialsSection.jsx";
import ClientsSection from "../components/ClientsSection/ClientsSection.jsx";
import ResourcesSection from "../components/ResourcesSection/ResourcesSection.jsx";
import Footer from "../components/Footer/Footer.jsx";

import "./Home.styles.css";

export default function Home() {
  return (
    <>
      <Header />

      <div className="Home">
        <Hero />

        {/* Nueva estructura premium */}
        <LogosSection />
        <ServicesSection />
        <StartHereSection />
        <SegmentsSection />
        <PlatformSection />
        <ProductivitySection />
        <TestimonialsSection />
        <ClientsSection />
        <ResourcesSection />

        <Footer />
      </div>
    </>
  );
}
