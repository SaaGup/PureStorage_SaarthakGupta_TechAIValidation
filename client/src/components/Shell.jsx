// App frame: navigation rail (filtered by permission), top bar with live
// connection state, theme switch and the signed-in user.
import { NavLink, Outlet, useLocation } from "react-router";
import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext.jsx";
import { useLive } from "../realtime/LiveContext.jsx";
import { Icon, BrandMark } from "./Icon.jsx";
import { Toasts } from "./Toasts.jsx";

export const NAV = [
  { to: "/", label: "Overview", icon: "overview", end: true },
  { to: "/reports", label: "Reports", icon: "reports", needs: ["reports:read:all", "reports:read:own"] },
  { to: "/alerts", label: "Alerts", icon: "alerts", needs: ["alerts:read"] },
  { to: "/costs", label: "Cloud costs", icon: "costs", needs: ["costs:read"] },
  { to: "/orphans", label: "Unowned reports", icon: "orphans", needs: ["orphans:read"] },
  { to: "/quality", label: "Data quality", icon: "quality", needs: ["quality:read"] },
];

const CONN_LABEL = { open: "Live", connecting: "Connecting", reconnecting: "Reconnecting", closed: "Offline" };

function useTheme() {
  const initial = () => {
    try {
      const saved = localStorage.getItem("pi-theme");
      if (saved) return saved;
    } catch { /* storage blocked: fall back to OS setting */ }
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  };
  const [theme, setTheme] = useState(initial);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("pi-theme", theme); } catch { /* ignore */ }
  }, [theme]);
  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))];
}

export function Shell() {
  const { user, can, logout } = useAuth();
  const { connection, alerts } = useLive();
  const [theme, toggleTheme] = useTheme();
  const location = useLocation();
  const openAlerts = alerts.filter((a) => !a.acknowledged).length;
  const current = NAV.find((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)));
  const initials = user.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  useEffect(() => {
    document.title = `${current?.label ?? "Report"} · Pure Insights`;
  }, [current]);

  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand">
          <BrandMark className="brand-mark" />
          <div><div className="brand-name">Pure Insights</div><div className="brand-sub">Command Centre</div></div>
        </div>
        <nav className="nav" aria-label="Main">
          {NAV.filter((n) => !n.needs || n.needs.some(can)).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>
              <Icon name={n.icon} />
              <span className="label">{n.label}</span>
              {n.to === "/alerts" && openAlerts > 0 && <span className="count" aria-label={`${openAlerts} open alerts`}>{openAlerts > 99 ? "99+" : openAlerts}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="rail-foot">Signed in as {user.role}. Menu shows what your role can open.</div>
      </aside>

      <div className="main">
        <header className="topbar">
          <span className={`conn ${connection}`} title="Real-time connection to the server">
            <span className="dot" aria-hidden="true" />{CONN_LABEL[connection]}
          </span>
          <span className="spacer" />
          <button className="btn ghost icon-btn" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
            <Icon name={theme === "dark" ? "sun" : "moon"} />
          </button>
          <div className="user-chip">
            <span className="avatar" aria-hidden="true">{initials}</span>
            <span className="who"><b>{user.name}</b><span className="role">{user.role}</span></span>
            <button className="btn ghost icon-btn" onClick={logout} aria-label="Sign out" title="Sign out"><Icon name="logout" /></button>
          </div>
        </header>
        <main className="page" id="main"><Outlet /></main>
      </div>
      <Toasts />
    </div>
  );
}