import { BrowserRouter, Routes, Route } from "react-router";
import { AuthProvider, useAuth } from "./auth/AuthContext.jsx";
import { LiveProvider } from "./realtime/LiveContext.jsx";
import { Shell } from "./components/Shell.jsx";
import { ErrorState } from "./components/ui.jsx";
import { Login } from "./pages/Login.jsx";
import { Overview } from "./pages/Overview.jsx";
import { Reports } from "./pages/Reports.jsx";
import { ReportDetail } from "./pages/ReportDetail.jsx";
import { Costs } from "./pages/Costs.jsx";
import { Orphans } from "./pages/Orphans.jsx";
import { Alerts } from "./pages/Alerts.jsx";
import { Quality } from "./pages/Quality.jsx";
import { NotFound } from "./pages/NotFound.jsx";

// Hides a page the role can't use. The server enforces the same rule; this
// only avoids showing a screen that would fail with 403.
function Requires({ any, children }) {
  const { can } = useAuth();
  return any.some(can) ? children : <div className="panel"><ErrorState error={{ status: 403 }} /></div>;
}

function Routed() {
  const { user, checking } = useAuth();
  if (checking) return null;
  if (!user) return <Login />;
  return (
    <LiveProvider enabled>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Overview />} />
          <Route path="reports" element={<Requires any={["reports:read:all", "reports:read:own"]}><Reports /></Requires>} />
          <Route path="reports/:id" element={<Requires any={["reports:read:all", "reports:read:own"]}><ReportDetail /></Requires>} />
          <Route path="alerts" element={<Requires any={["alerts:read"]}><Alerts /></Requires>} />
          <Route path="costs" element={<Requires any={["costs:read"]}><Costs /></Requires>} />
          <Route path="orphans" element={<Requires any={["orphans:read"]}><Orphans /></Requires>} />
          <Route path="quality" element={<Requires any={["quality:read"]}><Quality /></Requires>} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </LiveProvider>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routed />
      </AuthProvider>
    </BrowserRouter>
  );
}