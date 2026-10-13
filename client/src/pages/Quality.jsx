import { useApi } from "../lib/useApi.js";
import { Panel, Loading, ErrorState, Kpis, Callout } from "../components/ui.jsx";
import { number } from "../lib/format.js";

const FLAG_RULES = new Set(["R2", "R6", "R7", "R9"]);

export function Quality() {
  const { data, error, loading, reload } = useApi("/quality");
  if (error) return <div className="panel"><ErrorState error={error} onRetry={reload} /></div>;
  if (loading || !data) return <div className="panel"><Loading rows={6} /></div>;

  const fired = data.rules.filter((r) => r.detected_in_raw > 0);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Data quality</h1>
          <p>Every cleaning rule applied to the raw export, how many rows it touched and why. Nothing is deleted silently: bad rows are quarantined with a reason, and suspicious ones stay in with a flag.</p>
        </div>
      </div>
      <div className="stack">
        <Kpis items={[
          { label: "Rows in the export", value: number(data.totals.input) },
          { label: "Rows used", value: number(data.totals.clean) },
          { label: "Rows quarantined", value: number(data.totals.quarantined), tone: data.totals.quarantined ? "warn" : "" },
          { label: "Rules that found issues", value: `${fired.length} of ${data.rules.length}` },
        ]} />
        <Callout>Latency spikes are kept on purpose. They are the events the alerting exists to catch, so removing them would hide the problem.</Callout>
        <Panel title="Rules" flush>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Rule</th><th>What it checks</th><th className="right">Found</th><th className="right">Acted on</th><th>What happens</th></tr></thead>
              <tbody>
                {data.rules.map((r) => (
                  <tr key={r.id} style={r.detected_in_raw === 0 ? { color: "var(--ink-3)" } : undefined}>
                    <td><b>{r.id}</b></td>
                    <td><div className="cell-title" style={{ fontWeight: r.detected_in_raw ? 600 : 500 }}>{r.title}</div><div className="cell-sub">{r.why}</div></td>
                    <td className="right">{number(r.detected_in_raw)}</td>
                    <td className="right">{number(r.rows_affected)}</td>
                    <td><span className={`tag ${r.detected_in_raw === 0 ? "" : FLAG_RULES.has(r.id) ? "accent" : "warn"}`}>{FLAG_RULES.has(r.id) ? "Kept, flagged" : "Quarantined"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  );
}