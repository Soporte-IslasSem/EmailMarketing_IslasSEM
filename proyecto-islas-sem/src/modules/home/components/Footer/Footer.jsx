import "./Footer.styles.css";
import { footerMenus } from "../../../../data/footerMenus";
import { socialLinks } from "../../../../data/socialLinks";

export default function Footer() {
  return (
    <footer className="Footer">
      <div className="Footer__container">

        <div className="Footer__top">
          <div className="Footer__brand">
            <h3 className="Footer__logo">ISLAS SEM</h3>
            <p className="Footer__tagline">
              Transformación digital, consultorías y comunicación inteligente.
            </p>
          </div>

          <div className="Footer__menus">
            {Object.entries(footerMenus).map(([section, items]) => (
              <div key={section} className="Footer__menu">
                <h4 className="Footer__menuTitle">
                  {section.charAt(0).toUpperCase() + section.slice(1)}
                </h4>

                <ul className="Footer__menuList">
                  {items.map((item, index) => (
                    <li key={index}>
                      <a href={item.href}>{item.label}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="Footer__bottom">
          <div className="Footer__social">
            {socialLinks.map((s, index) => (
              <a key={index} href={s.href} className="Footer__socialLink">
                <img src={s.icon} alt={s.alt} />
              </a>
            ))}
          </div>

          <p className="Footer__copy">
            © {new Date().getFullYear()} ISLAS SEM — Todos los derechos reservados.
          </p>
        </div>

      </div>
    </footer>
  );
}
