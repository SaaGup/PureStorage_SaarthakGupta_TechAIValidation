import { Link, useParams } from "react-router";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Dot } from "recharts";
import { useApi } from "../lib/useApi.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { useLatencyTiers, tierOf } from "../realtime/LiveContext.jsx";
import { Kpis, Panel, Loading, ErrorState, ActionTag } from "../components/ui.jsx";
import { Icon } from "../components/Icon.jsx";
import { seconds, percent, money, number, STATUS_LABEL } from "../lib/format.js";

const TIER_FILL = { "": "var(--accent)", warning: "var(--sev-warning)", high: "var(--sev-high)", critical: "var(--sev-critical)" };

function LoadTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="chart-tip">
      <b>Observation {p.n}</b>
      {seconds(p.load)} load<br />Refresh {STATUS_LABEL[p.status].toLowerCase()}<br />Owner {p.owner ?? "none"}
    </div>
  );
}

export function ReportDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const tiers = useLatencyTiers();
  const { data, error, loading, reload } = useApi(`/reports/${encodeURIComponent(id)}`);

  if (error) return <div className="panel"><ErrorState error={error.status === 404 ? { message: "This report doesn't exist or isn't one of yours." } : error} onRetry={reload} /></div>;
  if (loading || !data) return <div className="panel"><Loading rows={6} /></div>;

  const { report: r, observations } = data;
  const series = observations.map((o, i) => ({ n: i + 1, load: o.avg_load_time_sec, status: o.refresh_status, owner: o.owner_email }));

  return (
    <>
      <Link to="/reports" className="btn ghost small" style={{ marginBottom: 12 }}><Icon name="back" />All reports</Link>
      <div className="page-head">
        <div>
          <h1>{r.report_name}</h1>
          <p>{r.report_id}. Latest known owner: <b>{r.latest_known_owner ?? "none"}</b>.
            {" "}Ownership changed hands across {r.distinct_owners} people, with {r.orphaned_observations} of {r.observations} periods unowned.</p>
        </div>
        {can("costs:read") && <ActionTag action={r.recommended_action} />}
      </div>

      <div className="stack">
        <Kpis items={[
          { label: "Average load", value: seconds(r.avg_load_time_sec), tone: tierOf(r.avg_load_time_sec, tiers) ? "warn" : "" },
          { label: "Worst load", value: seconds(r.max_load_time_sec), tone: tierOf(r.max_load_time_sec, tiers) ? "warn" : "" },
          { label: "Refresh failure rate", value: percent(r.refresh_failure_rate), hint: `${r.unknown_status_observations} unknown excluded` },
          { label: "Monthly views (total)", value: number(r.total_views) },
          can("costs:read") && { label: "Total cost", value: money(r.total_cost_usd), hint: `${money(r.cost_per_view_usd)} per view` },
        ]} />

        <Panel title="Load time across observations" description="Oldest on the left. The dashed line is the alert threshold.">
          <div style={{ height: 280 }}>
            <ResponsiveContainer>
              <LineChart data={series} margin={{ top: 10, right: 16, bottom: 0, left: -8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="n" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} unit="s" domain={[0, 60]} ticks={[0, 15, 30, 45, 60]} />
                <Tooltip content={<LoadTip />} cursor={{ stroke: "var(--line-strong)" }} />
                {tiers && <ReferenceLine y={tiers.warning} stroke="var(--sev-warning)" strokeDasharray="5 5" />}
                <Line type="linear" dataKey="load" stroke="var(--accent)" strokeWidth={2} isAnimationActive
                  dot={(p) => <Dot key={p.index} cx={p.cx} cy={p.cy} r={4.5} fill={TIER_FILL[tierOf(p.value, tiers)]} stroke="var(--surface)" strokeWidth={2} />} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Refresh history" description="One square per observation, oldest first.">
          <div className="timeline" role="img" aria-label={`Refresh outcomes: ${observations.map((o) => STATUS_LABEL[o.refresh_status]).join(", ")}`}>
            {observations.map((o) => <span key={o.source_row} className={o.refresh_status} title={`${STATUS_LABEL[o.refresh_status]} (CSV row ${o.source_row})`} />)}
          </div>
          <div className="legend">
            <span><i style={{ background: "var(--accent)", opacity: 0.35 }} />Succeeded</span>
            <span><i style={{ background: "var(--sev-high)" }} />Failed</span>
            <span><i style={{ background: "var(--sev-warning)" }} />Timed out</span>
            <span><i style={{ background: "repeating-linear-gradient(135deg, var(--line-strong) 0 3px, transparent 3px 6px)" }} />Unknown</span>
          </div>
        </Panel>
      </div>
    </>
  );
}