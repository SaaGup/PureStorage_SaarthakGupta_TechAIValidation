import { Link } from "react-router";
import { useApi } from "../lib/useApi.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { useLive, useLatencyTiers } from "../realtime/LiveContext.jsx";
import { LatencyScope } from "../components/LatencyScope.jsx";
import { Kpis, Panel, Loading, ErrorState, Severity, Empty } from "../components/ui.jsx";
import { percent, moneyCompact, money, number, seconds, timeAgo, isFresh, TIER_LABEL, STATUS_LABEL } from "../lib/format.js";

const TIER_FILL = { ok: "var(--tier-ok)", warning: "var(--sev-warning)", high: "var(--sev-high)", critical: "var(--sev-critical)" };
const STATUS_FILL = { SUCCESS: "var(--accent)", FAILED: "var(--sev-high)", TIMED_OUT: "var(--sev-warning)", UNKNOWN: "var(--tier-ok)" };

function Distribution({ rows, total }) {
  return (
    <div className="dist">
      {rows.map((r) => (
        <div className="dist-row" key={r.label}>
          <span>{r.label}</span>
          <div className="track" role="img" aria-label={`${r.label}: ${r.value} of ${total}`}>
            <div className="fill" style={{ width: `${(r.value / total) * 100}%`, background: r.color }} />
          </div>
          <span className="v num">{number(r.value)} <span className="faint">({percent(r.value / total, 0)})</span></span>
        </div>
      ))}
    </div>
  );
}

export function Overview() {
  const { can, user } = useAuth();
  const { alerts } = useLive();
  const { data, error, loading, reload } = useApi("/overview");
  const recent = alerts.slice(0, 6);
  const tiers = useLatencyTiers();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <p>{data?.scope === "own_reports"
            ? `Health of the reports you own, ${user.email}.`
            : "Health of every report on the portal, updated live from the telemetry feed."}</p>
        </div>
      </div>

      <div className="stack">
        <LatencyScope />

        {loading && !data ? <div className="panel"><Loading rows={2} /></div> : error ? <div className="panel"><ErrorState error={error} onRetry={reload} /></div> : (
          <>
            <Kpis items={[
              { label: "Reports monitored", value: number(data.health.reports), hint: `${number(data.health.observations)} observations` },
              { label: "Refresh failure rate", value: percent(data.health.refresh_failure_rate), tone: "warn", hint: `${data.health.unknown_status_observations} unknown excluded` },
              { label: tiers ? `Loads over ${tiers.warning}s` : "Slow loads", value: percent(data.health.latency_breach_rate), tone: "warn", hint: `Average ${seconds(data.health.avg_load_time_sec)}` },
              data.costs && { label: "Platform cost", value: moneyCompact(data.costs.total_cost_usd), hint: `${money(data.costs.platform_cost_per_view_usd)} per view` },
              data.costs && { label: "Spend with no owner", value: percent(data.costs.unowned_cost_share), tone: "warn", hint: moneyCompact(data.costs.unowned_cost_usd) },
              !data.costs && { label: "Unowned observations", value: number(data.health.orphaned_observations), hint: `${data.health.reports_with_orphaned_observations} reports affected` },
            ]} />

            <div className="grid-2">
              <Panel title="How fast reports load" description="Share of observations in each load-time band.">
                <Distribution total={data.health.observations}
                  rows={["ok", "warning", "high", "critical"].map((k) => ({ label: TIER_LABEL[k], value: data.health.latency_tier_breakdown[k], color: TIER_FILL[k] }))} />
              </Panel>
              <Panel title="Data refresh outcomes" description="Unknown results are kept separate rather than counted as failures.">
                <Distribution total={data.health.observations}
                  rows={["SUCCESS", "FAILED", "TIMED_OUT", "UNKNOWN"].map((k) => ({ label: STATUS_LABEL[k], value: data.health.refresh_status_breakdown[k], color: STATUS_FILL[k] }))} />
              </Panel>
            </div>
          </>
        )}

        {can("alerts:read") && (
          <Panel title="Latest alerts" description="Pushed by the server the moment a rule fires."
            actions={<Link to="/alerts" className="btn small">Open alert centre</Link>} flush>
            {recent.length === 0 ? <Empty title="No alerts yet">Alerts appear here as soon as the live feed raises one.</Empty> : (
              <ul className="feed">
                {recent.map((a) => (
                  <li key={a.id} className={a.acknowledged ? "acked" : isFresh(a.created_at) ? "fresh" : ""}>
                    <Severity level={a.severity} />
                    <div><div className="msg">{a.message}</div><div className="meta">{timeAgo(a.created_at)}{a.owner ? `, owner ${a.owner}` : ", no owner"}</div></div>
                    {a.acknowledged ? <span className="tag good">Acknowledged</span> : <span className="tag">Open</span>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}
      </div>
    </>
  );
}