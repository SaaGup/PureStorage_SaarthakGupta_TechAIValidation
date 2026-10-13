import { useState } from "react";
import { useNavigate } from "react-router";
import { useApi } from "../lib/useApi.js";
import { query } from "../lib/api.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { Panel, Loading, ErrorState, Empty, SortHeader, Pager, Meter, ActionTag } from "../components/ui.jsx";
import { Icon } from "../components/Icon.jsx";
import { useLatencyTiers, tierOf } from "../realtime/LiveContext.jsx";
import { percent, seconds, number, money } from "../lib/format.js";

export function Reports() {
  const { can } = useAuth();
  const showCost = can("costs:read");
  const navigate = useNavigate();
  const tiers = useLatencyTiers();
  const latencyTone = (v) => tierOf(v, tiers);
  const meterMax = tiers ? tiers.critical * 1.1 : 60;
  const [search, setSearch] = useState("");
  const [ownership, setOwnership] = useState("");
  const [sort, setSort] = useState("max_load_time_sec");
  const [order, setOrder] = useState("desc");
  const [page, setPage] = useState(1);

  const { data, error, loading, reload } = useApi(`/reports${query({ search, ownership, sort, order, page, pageSize: 15 })}`);

  const onSort = (field) => {
    if (field === sort) setOrder(order === "asc" ? "desc" : "asc");
    else { setSort(field); setOrder("desc"); }
    setPage(1);
  };
  const headerProps = { sort, order, onSort };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Reports</h1>
          <p>Every dashboard on the portal with its load time, refresh reliability and ownership. Select a report to see its history.</p>
        </div>
      </div>

      <div className="toolbar">
        <div className="search">
          <Icon name="search" />
          <input className="input" type="search" placeholder="Search by name, ID or owner" aria-label="Search reports"
            value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="segmented" role="group" aria-label="Ownership filter">
          {[["", "All"], ["orphaned", "Has unowned periods"], ["owned", "Always owned"]].map(([v, l]) => (
            <button key={v} aria-pressed={ownership === v} onClick={() => { setOwnership(v); setPage(1); }}>{l}</button>
          ))}
        </div>
      </div>

      <Panel flush>
        {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <Loading rows={8} /> : data.items.length === 0 ? (
          <Empty title="No reports match">Try a different search or clear the filter.</Empty>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <SortHeader field="report_name" label="Report" {...headerProps} />
                    <th>Latest owner</th>
                    <SortHeader field="avg_load_time_sec" label="Avg load" {...headerProps} />
                    <SortHeader field="max_load_time_sec" label="Worst load" {...headerProps} />
                    <SortHeader field="refresh_failure_rate" label="Refresh failures" {...headerProps} align="right" />
                    <SortHeader field="distinct_owners" label="Owners" {...headerProps} align="right hide-md" />
                    {showCost && <SortHeader field="total_cost_usd" label="Cost" {...headerProps} align="right" />}
                    {showCost && <th>Recommended</th>}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((r) => (
                    <tr key={r.report_id} className="clickable" tabIndex={0}
                      onClick={() => navigate(`/reports/${r.report_id}`)}
                      onKeyDown={(e) => e.key === "Enter" && navigate(`/reports/${r.report_id}`)}>
                      <td><div className="cell-title">{r.report_name}</div><div className="cell-sub">{r.report_id}</div></td>
                      <td>{r.latest_known_owner ?? <span className="tag warn">No owner</span>}
                        {r.orphaned_observations > 0 && <div className="cell-sub">{r.orphaned_observations} unowned periods</div>}</td>
                      <td><Meter value={r.avg_load_time_sec} max={meterMax} label={seconds(r.avg_load_time_sec)} tone={latencyTone(r.avg_load_time_sec)} /></td>
                      <td><Meter value={r.max_load_time_sec} max={meterMax} label={seconds(r.max_load_time_sec)} tone={latencyTone(r.max_load_time_sec)} /></td>
                      <td className="right num">{percent(r.refresh_failure_rate)}</td>
                      <td className="right num hide-md">{number(r.distinct_owners)}</td>
                      {showCost && <td className="right num">{money(r.total_cost_usd)}</td>}
                      {showCost && <td><ActionTag action={r.recommended_action} /></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />
          </>
        )}
      </Panel>
    </>
  );
}