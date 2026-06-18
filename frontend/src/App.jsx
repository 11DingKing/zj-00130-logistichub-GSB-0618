import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import AdminLayout from "./components/AdminLayout";
import MerchantLayout from "./components/MerchantLayout";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminLocations from "./pages/admin/Locations";
import AdminInbound from "./pages/admin/Inbound";
import AdminOutbound from "./pages/admin/Outbound";
import AdminInventory from "./pages/admin/Inventory";
import AdminLeases from "./pages/admin/Leases";
import AdminStats from "./pages/admin/Stats";
import AdminMerchants from "./pages/admin/Merchants";
import AdminTransfers from "./pages/admin/Transfers";
import AdminBills from "./pages/admin/Bills";
import MerchantDashboard from "./pages/merchant/Dashboard";
import MerchantInventory from "./pages/merchant/Inventory";
import MerchantInbound from "./pages/merchant/Inbound";
import MerchantOutbound from "./pages/merchant/Outbound";
import MerchantLeases from "./pages/merchant/Leases";
import MerchantBills from "./pages/merchant/Bills";
import { Spin } from "antd";

const ProtectedRoute = ({ children, role }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (role && user.role !== role) {
    return (
      <Navigate to={user.role === "admin" ? "/admin" : "/merchant"} replace />
    );
  }

  return children;
};

const App = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          user ? (
            <Navigate
              to={user.role === "admin" ? "/admin" : "/merchant"}
              replace
            />
          ) : (
            <Login />
          )
        }
      />

      <Route
        path="/admin/*"
        element={
          <ProtectedRoute role="admin">
            <AdminLayout>
              <Routes>
                <Route index element={<AdminDashboard />} />
                <Route path="locations" element={<AdminLocations />} />
                <Route path="inbound" element={<AdminInbound />} />
                <Route path="outbound" element={<AdminOutbound />} />
                <Route path="inventory" element={<AdminInventory />} />
                <Route path="transfers" element={<AdminTransfers />} />
                <Route path="leases" element={<AdminLeases />} />
                <Route path="bills" element={<AdminBills />} />
                <Route path="stats" element={<AdminStats />} />
                <Route path="merchants" element={<AdminMerchants />} />
              </Routes>
            </AdminLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/merchant/*"
        element={
          <ProtectedRoute role="merchant">
            <MerchantLayout>
              <Routes>
                <Route index element={<MerchantDashboard />} />
                <Route path="inventory" element={<MerchantInventory />} />
                <Route path="inbound" element={<MerchantInbound />} />
                <Route path="outbound" element={<MerchantOutbound />} />
                <Route path="leases" element={<MerchantLeases />} />
                <Route path="bills" element={<MerchantBills />} />
              </Routes>
            </MerchantLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/"
        element={
          <Navigate
            to={
              user ? (user.role === "admin" ? "/admin" : "/merchant") : "/login"
            }
            replace
          />
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
