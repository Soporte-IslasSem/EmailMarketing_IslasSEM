import "./ResourcesSection.styles.css";
import { posts } from "../../../../data/posts";

// ICONOS DE CATEGORÍAS (desde src/)
import blogIcon from "../../../../assets/icons/fake-blog.svg";
import glossaryIcon from "../../../../assets/icons/fake-glossary.svg";
import resourcesIcon from "../../../../assets/icons/fake-resources.svg";
import toolsIcon from "../../../../assets/icons/fake-tools.svg";

export default function ResourcesSection({ category, title, subtitle }) {
  const filteredPosts = category
    ? posts.filter((post) => post.category === category)
    : posts;

  const icons = {
    Blog: blogIcon,
    Glosario: glossaryIcon,
    "Otros recursos": resourcesIcon,
    "Herramientas gratuitas": toolsIcon
  };

  return (
    <section className="ResourcesSection">
      <div className="ResourcesSection__container">
        <h2 className="ResourcesSection__title">
          {title || "Recursos para ayudarte a crecer"}
        </h2>

        {subtitle && (
          <p className="ResourcesSection__subtitle">{subtitle}</p>
        )}

        <div className="ResourcesSection__grid">
          {filteredPosts.map((post, index) => (
            <a key={index} href={post.link} className="ResourcesSection__card">

              <div className="ResourcesSection__content">

                <div className="ResourcesSection__categoryRow">
                  <span className="ResourcesSection__category">
                    {post.category}
                  </span>
                </div>

                <h3 className="ResourcesSection__cardTitle">{post.title}</h3>

                <div className="ResourcesSection__author">
                  <img
                    src="/favicon.png"
                    alt={post.author.name}
                    className="ResourcesSection__avatar"
                    loading="lazy"
                  />
                  <span>{post.author.name}</span>
                </div>

              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
