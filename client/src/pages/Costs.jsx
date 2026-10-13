import { useState } from "react";
import { Link } from "react-router";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from "recharts";
import { useApi } from "../lib/useApi.js";
import { query } from "../lib/api.js";
import { Kpis, Panel, Loading, ErrorState, Empty, Pager, ActionTag, Callout } from "../components/ui.jsx";
import { money, moneyCompact, percent, number, ACTION_LABEL } from "../lib/format.js";

function ParetoTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return <div className="chart-tip"><b>Top {p.rank} reports</b>{percent(p.share)} of total spend</div>;
}

export function Costs() {
  const summary = useApi("/costs/summary");
  const all = useApi("/costs/reports?pageSize=100&sort=cost_rank&order=asc");
  const [action, setAction] = useState("REVIEW_HOSTING");
  const [page, setPage] = useState(1);
  const flagged = useApi(`/costs/reports${query({ action, page, pageSize: 10, sort: "cost_per_view_usd", order: "desc" })}`);

  if (summary.error) return <div className="panel"><ErrorState error={summary.error} onRetry={summary.reload} /></div>;
  const s = summary.data;
  const pareto = all.data?.items.map((c) => ({ rank: c.cost_rank, share: c.cumulative_cost_share })) ?? [];
  const toEighty = pareto.find((p) => p.share >= 0.8)?.rank;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Cloud costs</h1>
          <p>Snowflake credits are attributed to each report through its query tag, then converted at the assumed contract rate and combined with AWS hosting cost.</p>
        </div>
      </div>

      <div className="stack">
        {!s ? <div className="panel"><Loading rows={2} /></div> : (
          <Kpis items={[
            { label: "Total cost", value: moneyCompact(s.total_cost_usd), hint: `${number(s.reports)} reports` },
            { label: "Snowflake", value: moneyCompact(s.snowflake_cost_usd), hint: `${number(Math.round(s.total_credits))} credits at ${money(s.usd_per_credit_assumption)}` },
            { label: "AWS hosting", value: moneyCompact(s.aws_cost_usd) },
            { label: "Cost per view", value: money(s.platform_cost_per_view_usd), hint: `${number(s.total_views)} views` },
            { label: "Spend with no owner", value: moneyCompact(s.unowned_cost_usd), tone: "warn", hint: `${percent(s.unowned_cost_share)} of total` },
          ]} />
        )}

        <div className="grid-3-2">
          <Panel title="How concentrated is spend?" description="Cumulative share of cost, most expensive report first.">
            {all.loading && !all.data ? <Loading rows={4} /> : (
              <>
                <div style={{ height: 260 }}>
                  <ResponsiveContainer>
                    <AreaChart data={pareto} margin={{ top: 10, right: 16, bottom: 0, left: -10 }}>
                      <defs>
                        <linearGradient id="paretoFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.28} />
                          <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="rank" tickLine={false} axisLine={false} ticks={[1, 20, 40, 60, 80, 100]} />
                      <YAxis tickLine={false} axisLine={false} domain={[0, 1]} tickFormatter={(v) => `${v * 100}%`} />
                      <Tooltip content={<ParetoTip />} cursor={{ stroke: "var(--line-strong)" }} />
                      <ReferenceLine y={0.8} stroke="var(--ink-3)" strokeDasharray="4 4" />
                      {toEighty && <ReferenceLine x={toEighty} stroke="var(--ink-3)" strokeDasharray="4 4" />}
                      <Area type="monotone" dataKey="share" stroke="var(--accent)" strokeWidth={2} fill="url(#paretoFill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </Panel>
          <div className="stack">
            <Callout>
              {toEighty
                ? <>It takes <b>{toEighty} of {pareto.length} reports</b> to reach 80% of spend. Cost is spread evenly, so savings will come from platform-wide fixes rather than a few expensive dashboards.</>
                : "Calculating how spend is distributed…"}
            </Callout>
            <Panel title="Where the rules point">
              <p className="muted" style={{ fontSize: 14 }}>
                <b>Review hosting</b> flags reports whose AWS cost is in the top quarter while their views are in the bottom quarter.
                <br /><b>Optimise queries</b> flags reports whose cost per view is a statistical outlier (more than 1.5 times the interquartile range above the 75th percentile).
              </p>
            </Panel>
          </div>
        </div>

        <Panel title="Reports flagged for action" flush
          actions={
            <div className="segmented" role="group" aria-label="Recommendation filter">
              {["REVIEW_HOSTING", "OPTIMISE_QUERIES"].map((a) => (
                <button key={a} aria-pressed={action === a} onClick={() => { setAction(a); setPage(1); }}>{ACTION_LABEL[a]}</button>
              ))}
            </div>
          }>
          {flagged.error ? <ErrorState error={flagged.error} onRetry={flagged.reload} /> : !flagged.data ? <Loading rows={5} /> : flagged.data.items.length === 0 ? (
            <Empty title="Nothing flagged">No report meets this rule right now.</Empty>
          ) : (
            <>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Report</th><th className="right">Views</th><th className="right">Snowflake</th><th className="right">AWS</th><th className="right">Cost per view</th><th className="right">Rank</th><th>Recommended</th></tr></thead>
                  <tbody>
                    {flagged.data.items.map((c) => (
                      <tr key={c.report_id}>
                        <td><Link to={`/reports/${c.report_id}`} className="cell-title">{c.report_name}</Link><div className="cell-sub">{c.report_id}</div></td>
                        <td className="right">{number(c.total_views)}</td>
                        <td className="right">{money(c.snowflake_cost_usd)}</td>
                        <td className="right">{money(c.aws_cost_usd)}</td>
                        <td className="right"><b>{money(c.cost_per_view_usd)}</b></td>
                        <td className="right">#{c.cost_rank}</td>
                        <td><ActionTag action={c.recommended_action} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager page={flagged.data.page} totalPages={flagged.data.totalPages} total={flagged.data.total} onPage={setPage} />
            </>
          )}
        </Panel>
      </div>
    </>
  );
}