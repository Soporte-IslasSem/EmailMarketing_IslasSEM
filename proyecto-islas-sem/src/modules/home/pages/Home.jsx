import Header from "../components/Header/Header.jsx";
import Hero from "../components/Hero/Hero.jsx";
import Footer from "../components/Footer/Footer.jsx";

import "./Home.styles.css";

// Portada: solo barra de navegación, hero y footer (las demás secciones se retiraron a
// petición de ISLAS SEM; sus componentes siguen en ../components por si se recuperan).
export default function Home() {
  return (
    <>
      <Header />

      <div className="Home">
        <Hero />
        <Footer />
      </div>
    </>
  );
}
