import { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar/Sidebar.jsx";
import Header from "../components/Header/Header.jsx";
import ProUpgradeModal from "../../lists/components/ListDetail/modals/ProUpgradeModal";
import "./DashboardLayout.styles.css";

export default function DashboardLayout() {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  useEffect(() => {
    window.openProUpgradeModal = () => setShowUpgradeModal(true);
  }, []);

  return (
    <>
      <div className="DashboardLayout">
        <Sidebar />

        <div className="DashboardLayout__content">
          <Header />

          <main className="DashboardLayout__main">
            <Outlet />
          </main>
        </div>
      </div>

      {showUpgradeModal && (
        <ProUpgradeModal onClose={() => setShowUpgradeModal(false)} />
      )}
    </>
  );
}
