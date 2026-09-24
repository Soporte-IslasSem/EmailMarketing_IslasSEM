import { useEffect, useRef } from "react";
import Chart from "chart.js/auto";
import "./TrendChart.styles.css";

export default function TrendChart({ subscribers }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!subscribers || subscribers.length === 0) return;

    const days = [];
    const altas = [];
    const bajas = [];

    // 🔹 Calcular los últimos 30 días incluyendo HOY
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 29);

    for (let i = 0; i < 30; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      const key = d.toISOString().split("T")[0];
      days.push(key);
      altas.push(0);
      bajas.push(0);
    }

    // 🔹 Contar altas y bajas
    subscribers.forEach((sub) => {
      const created = sub.createdAt?.toDate?.();
      const updated = sub.updatedAt?.toDate?.();

      if (created) {
        const key = created.toISOString().split("T")[0];
        const index = days.indexOf(key);
        if (index !== -1) altas[index]++;
      }

      if (sub.status === "unsubscribed" && updated) {
        const key = updated.toISOString().split("T")[0];
        const index = days.indexOf(key);
        if (index !== -1) bajas[index]++;
      }
    });

    // 🔹 Destruir gráfica previa
    if (chartRef.current) chartRef.current.destroy();

    const ctx = canvasRef.current.getContext("2d");

    chartRef.current = new Chart(ctx, {
      type: "line",
      data: {
        labels: days,
        datasets: [
          {
            label: "Altas",
            data: altas,
            borderColor: "#00bfa6",
            backgroundColor: "rgba(0,191,166,0.2)",
            tension: 0.3,
            borderWidth: 2,
            fill: true,
          },
          {
            label: "Bajas",
            data: bajas,
            borderColor: "#d93636",
            backgroundColor: "rgba(217,54,54,0.2)",
            tension: 0.3,
            borderWidth: 2,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: { right: 40 }, // 🔥 más espacio para mostrar el último punto
        },
        scales: {
          x: {
            ticks: {
              maxRotation: 45,
              minRotation: 45,
              color: "#333",
              font: { size: 11 },
            },
            grid: { display: false },
          },
          y: {
            beginAtZero: true,
            ticks: { stepSize: 1, color: "#333" },
            grid: { color: "rgba(0,0,0,0.05)" },
          },
        },
        plugins: {
          legend: {
            position: "top",
            labels: { boxWidth: 12, color: "#333" },
          },
        },
      },
    });
  }, [subscribers]);

  return (
    <div className="TrendChart">
      <h3>Tendencia de los suscriptores (últimos 30 días)</h3>
      <div className="chart-container">
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: "100%", display: "block" }}
        ></canvas>
      </div>
    </div>
  );
}
