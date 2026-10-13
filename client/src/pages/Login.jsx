import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext.jsx";
import { api } from "../lib/api.js";
import { BrandMark } from "../components/Icon.jsx";

// Demo identities from server/config/users.json. Passwords are never shown here:
// the reviewer types the DEMO_PASSWORD they set in server/.env.
const DEMO = [
  { email: "admin@pureinsights.local", role: "admin", note: "Everything, plus replay control" },
  { email: "analyst@pureinsights.local", role: "analyst", note: "All reports and costs" },
  { email: "user_3@company.com", role: "owner", note: "Only their 11 reports" },
  { email: "viewer@pureinsights.local", role: "viewer", note: "Health only, no money" },
];

// Decorative skyline of load times for the left panel (static, not data).
const SKYLINE = [22, 35, 18, 52, 30, 41, 26, 60, 33, 45, 20, 38, 55, 28, 47, 24, 36, 58, 31, 42, 19, 50, 29, 44];

export function Login() {
  const { login, notice } = useAuth();
  const [email, setEmail] = useState(DEMO[0].email);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(false);

  // In demo mode the server shares its public demo password so reviewers can sign in in one click.
  useEffect(() => {
    api("/health").then((h) => {
      if (h?.demo?.password) {
        setPassword(h.demo.password);
        setDemo(true);
      }
    }).catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.status === 429 ? err.message : err.status === 401 ? "That email and password don't match." : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <section className="login-art" aria-hidden="true">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <BrandMark width={34} height={34} />
          <b style={{ fontSize: 17 }}>Pure Insights</b>
        </div>
        <div>
          <h1>See every report, every refresh, every credit.</h1>
          <p>The admin console for the analytics portal: live load times, failed refreshes, reports nobody owns, and what each one costs in Snowflake and AWS.</p>
        </div>
        <div className="bars">
          {SKYLINE.map((h, i) => (
            <span key={i} style={{
              height: `${(h / 60) * 100}%`,
              animationDelay: `${i * 35}ms`,
              background: h > 50 ? "var(--scope-critical)" : h > 30 ? "var(--scope-high)" : h > 15 ? "var(--scope-warning)" : "var(--scope-ok)",
            }} />
          ))}
        </div>
      </section>

      <section className="login-form-wrap">
        <form className="login-form" onSubmit={submit}>
          <div>
            <h2 style={{ fontSize: 24 }}>Sign in</h2>
              <p className="muted" style={{ marginTop: 6 }}>
              {demo ? "Demo mode: the password is filled in. Pick a role below and sign in." : "Use one of the demo accounts below."}
            </p>
          </div>
          {notice && <div className="callout">{notice}</div>}
          <label>Email
            <input className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>Password
            <input className="input" type="password" autoComplete="current-password" required value={password}
              onChange={(e) => setPassword(e.target.value)} placeholder="DEMO_PASSWORD from server/.env" />
          </label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="btn primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>

          <div className="demo-accounts">
            <p>Each role sees a different slice of the same data:</p>
            <div className="demo-list">
              {DEMO.map((d) => (
                <button type="button" key={d.email} aria-pressed={email === d.email} onClick={() => setEmail(d.email)}>
                  <b>{d.role}</b><span>{d.note}</span>
                </button>
              ))}
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}