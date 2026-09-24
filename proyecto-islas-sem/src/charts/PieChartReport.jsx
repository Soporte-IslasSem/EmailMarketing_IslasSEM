import { Pie } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(ArcElement, Tooltip, Legend);

export default function PieChartReport({ data, colors, total }) {
  const chartData = {
    labels: data.map((item) => item.label),
    datasets: [
      {
        data: data.map((item) => item.value),
        backgroundColor: colors,
        borderWidth: 1,
      },
    ],
  };

  const options = {
    plugins: {
      legend: {
        position: "bottom",
        labels: {
          color: "#0F0F0F",
          font: { size: 13 },
        },
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const value = context.raw;
            const percentage = total ? ((value / total) * 100).toFixed(2) : 0;
            return `${context.label}: ${percentage}%`;
          },
        },
      },
    },
  };

  return (
    <div style={{ width: "280px", height: "280px" }}>
      <Pie data={chartData} options={options} />
    </div>
  );
}
