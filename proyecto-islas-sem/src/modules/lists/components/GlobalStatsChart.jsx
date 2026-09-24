import { useEffect, useRef } from "react";
import Chart from "chart.js/auto";

export default function GlobalStatsChart({ subscribers }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!subscribers) return;

    const altasGlobales = subscribers.filter(
      (s) => s.createdAt?.toDate
    ).length;

    const bajasGlobales = subscribers.filter(
      (s) => s.status === "unsubscribed"
    ).length;

    if (chartRef.current) chartRef.current.destroy();

    const ctx = canvasRef.current.getContext("2d");

    chartRef.current = new Chart(ctx, {
      type: "bar",
      data: {
        labels: ["Altas globales", "Bajas globales"],
        datasets: [
          {
            label: "Cantidad",
            data: [altasGlobales, bajasGlobales],
            backgroundColor: ["#00bfa6", "#d93636"],
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1, color: "#333" } },
          x: { ticks: { color: "#333" } },
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
    <div style={{ marginTop: "40px" }}>
      <h3>Altas y bajas globales</h3>
      <div style={{ height: "300px", overflow: "hidden" }}>
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: "100%", display: "block" }}
        ></canvas>
      </div>
    </div>
  );
}
