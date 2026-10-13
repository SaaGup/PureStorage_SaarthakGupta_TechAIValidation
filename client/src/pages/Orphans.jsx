import { Link } from "react-router";
import { useApi } from "../lib/useApi.js";
import { Panel, Loading, ErrorState, Meter, Callout, Kpis } from "../components/ui.jsx";
import { money, moneyCompact, number, percent } from "../lib/format.js";

export function Orphans() {
  const { data, error, loading, reload } = useApi("/orphans");
  if (error) return <div className="panel"><ErrorState error={error} onRetry={reload} /></div>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Unowned reports</h1>
          <p>Periods where a report had no owner (the export showed a blank owner or ORPHANED_REPORT). Nobody is accountable for that spend or for fixing failures in that time.</p>
        </div>
      </div>

      <div className="stack">
        {loading && !data ? <div className="panel"><Loading rows={6} /></div> : (
          <>
            <Kpis items={[
              { label: "Reports affected", value: number(data.reports_affected), hint: "had at least one unowned period" },
              { label: "Unowned periods", value: number(data.orphaned_observations) },
              { label: "Spend with no owner", value: moneyCompact(data.unowned_cost_usd), tone: "warn" },
            ]} />
            <Callout>
              Owners also change constantly: most reports passed through 10 or more people. The suggested owner below is the most recent named owner, so reassignment starts from whoever touched the report last.
            </Callout>
            <Panel title="Ranked by unowned spend" flush>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Report</th><th>Unowned share of periods</th><th className="right">Unowned spend</th><th className="right">Owners over time</th><th>Suggested owner</th></tr></thead>
                  <tbody>
                    {data.items.map((o) => (
                      <tr key={o.report_id}>
                        <td><Link to={`/reports/${o.report_id}`} className="cell-title">{o.report_name}</Link><div className="cell-sub">{o.report_id}</div></td>
                        <td><Meter value={o.orphaned_share} max={0.5} label={percent(o.orphaned_share, 0)} tone={o.orphaned_share >= 0.25 ? "high" : "warning"} /></td>
                        <td className="right"><b>{money(o.unowned_cost_usd)}</b></td>
                        <td className="right">{number(o.distinct_owners)}</td>
                        <td>{o.suggested_owner ?? <span className="tag warn">No named owner</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </>
        )}
      </div>
    </>
  );
}