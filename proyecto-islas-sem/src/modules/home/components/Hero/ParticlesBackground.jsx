import "./ParticlesBackground.css";

const BUBBLES_COUNT = 90;

export default function ParticlesBackground() {
  const bubbles = Array.from({ length: BUBBLES_COUNT });

  return (
    <div className="particles-container">
      {bubbles.map((_, i) => {
        const style = {
          left: `${Math.random() * 100}%`,
          top: `${80 + Math.random() * 40}vh`, // empiezan por debajo
          animationDelay: `${-Math.random() * 18}s`,
          animationDuration: `${14 + Math.random() * 10}s`,
          transform: `scale(${0.5 + Math.random() * 1.4})`,
        };

        return <span key={i} className="bubble" style={style} />;
      })}
    </div>
  );
}
