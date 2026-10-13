import { useMemo, useState } from "react";
import { Link } from "react-router";
import { api } from "../lib/api.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { useLive } from "../realtime/LiveContext.jsx";
import { Panel, Severity, Empty, Kpis } from "../components/ui.jsx";
import { Icon } from "../components/Icon.jsx";
import { timeAgo, number, isFresh, ALERT_TYPE_LABEL } from "../lib/format.js";

const PAGE = 25;

export function Alerts() {
  const { can } = useAuth();
  const { alerts, replay, thresholds } = useLive();
  const [status, setStatus] = useState("open");
  const [severity, setSeverity] = useState("");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [shown, setShown] = useState(PAGE);

  const visible = useMemo(() => alerts.filter((a) =>
    (status === "all" || (status === "open" ? !a.acknowledged : a.acknowledged)) &&
    (!severity || a.severity === severity)), [alerts, status, severity]);

  const open = alerts.filter((a) => !a.acknowledged);
  const count = (sev) => open.filter((a) => a.severity === sev).length;

  // The server broadcasts the acknowledgement to every connected dashboard,
  // so the list updates from the WebSocket, not from this response.
  const acknowledge = async (id) => {
    setBusy(id);
    setError(null);
    try { await api(`/alerts/${id}/ack`, { method: "POST" }); }
    catch (e) { setError(e.message); }
    finally { setBusy(null); }
  };

  const toggleReplay = async () => {
    setError(null);
    try { await api(`/replay/${replay?.running ? "stop" : "start"}`, { method: "POST" }); }
    catch (e) { setError(e.message); }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Alerts</h1>
          <p>
            Raised when a report loads slower than {thresholds?.latency?.warning ?? "the target"} seconds or its data refresh fails.
            Repeats for the same report are held back for {thresholds?.cooldown_sec ?? "a short"} seconds unless they get worse.
          </p>
        </div>
        {can("replay:control") && replay && (
          <button className="btn" onClick={toggleReplay}>
            <Icon name={replay.running ? "pause" : "play"} />{replay.running ? "Pause live feed" : "Resume live feed"}
          </button>
        )}
      </div>

      <div className="stack">
        <Kpis items={[
          { label: "Open alerts", value: number(open.length) },
          { label: "Critical", value: number(count("critical")), tone: count("critical") ? "warn" : "" },
          { label: "High", value: number(count("high")) },
          { label: "Warning", value: number(count("warning")) },
          replay && { label: "Feed position", value: `${number(replay.position)}`, hint: `of ${number(replay.total)} observations${replay.running ? "" : ", paused"}` },
        ]} />

        {error && <div className="form-error" role="alert">{error}</div>}

        <Panel flush title="Alert feed" description="Newest first. Updates live."
          actions={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div className="segmented" role="group" aria-label="Status">
                {[["open", "Open"], ["acknowledged", "Acknowledged"], ["all", "All"]].map(([v, l]) => (
                  <button key={v} aria-pressed={status === v} onClick={() => { setStatus(v); setShown(PAGE); }}>{l}</button>
                ))}
              </div>
              <select className="select" aria-label="Severity" value={severity} onChange={(e) => { setSeverity(e.target.value); setShown(PAGE); }}>
                <option value="">All severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="warning">Warning</option>
              </select>
            </div>
          }>
          {visible.length === 0 ? (
            <Empty title={status === "open" ? "No open alerts" : "Nothing here"}>
              {status === "open" ? "Everything raised so far has been acknowledged." : "Change the filters to see more."}
            </Empty>
          ) : (
            <ul className="feed">
              {visible.slice(0, shown).map((a) => (
                <li key={a.id} className={a.acknowledged ? "acked" : isFresh(a.created_at) ? "fresh" : ""}>
                  <Severity level={a.severity} />
                  <div>
                    <div className="msg">{a.message}</div>
                    <div className="meta">
                      {ALERT_TYPE_LABEL[a.type]}, {timeAgo(a.created_at)}, <Link to={`/reports/${a.report_id}`}>{a.report_id}</Link>
                      {a.owner ? `, owner ${a.owner}` : ", no owner"}
                      {a.suppressed_since_last > 0 && `, ${a.suppressed_since_last} repeats held back`}
                      {a.acknowledged && `, acknowledged by ${a.acknowledged_by}`}
                    </div>
                  </div>
                  {a.acknowledged ? <span className="tag good"><Icon name="check" width={13} height={13} />Done</span>
                    : can("alerts:ack") ? (
                      <button className="btn small" disabled={busy === a.id} onClick={() => acknowledge(a.id)}>Acknowledge</button>
                    ) : <span className="tag">Open</span>}
                </li>
              ))}
            </ul>
          )}
          {visible.length > shown && (
            <div className="feed-more">
              <button className="btn" onClick={() => setShown((n) => n + PAGE)}>
                Show {Math.min(PAGE, visible.length - shown)} more of {number(visible.length - shown)}
              </button>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}