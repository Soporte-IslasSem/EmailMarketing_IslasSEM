import { Outlet } from "react-router-dom";
import "./AuthLayout.styles.css";

export default function AuthLayout() {
  return (
    <div className="AuthLayout">
      <Outlet />
    </div>
  );
}
