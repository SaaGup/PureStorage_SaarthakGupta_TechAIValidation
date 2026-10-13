// The live "scope": every observation streamed over the WebSocket becomes a bar.
// Height = load time, colour = severity tier, dashed line = the 15s alert threshold.
// Hand-built SVG (no chart library) so new bars can animate in as they arrive.
import { useMemo, useRef, useState } from "react";
import { useLive } from "../realtime/LiveContext.jsx";
import { telemetryStats, MAX_TELEMETRY } from "../lib/liveReducer.js";
import { seconds, TIER_LABEL, STATUS_LABEL } from "../lib/format.js";

const W = 900;
const H = 230;
const PAD = { top: 10, right: 8, bottom: 22, left: 34 };
const Y_MAX = 60;
const TIER_COLOR = {
  ok: "var(--scope-ok)",
  warning: "var(--scope-warning)",
  high: "var(--scope-high)",
  critical: "var(--scope-critical)",
};

export function LatencyScope() {
  const { telemetry, thresholds, connection, received } = useLive();
  const [hover, setHover] = useState(null);
  const wrapRef = useRef(null);
  const warning = thresholds?.latency?.warning ?? 15;
  const stats = useMemo(() => telemetryStats(telemetry, warning), [telemetry, warning]);

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / MAX_TELEMETRY;
  const barW = Math.max(2, slot - 3);
  const y = (s) => PAD.top + plotH - (Math.min(s, Y_MAX) / Y_MAX) * plotH;
  const offset = MAX_TELEMETRY - telemetry.length; // new bars enter on the right

  const onMove = (e, t, i) => {
    const box = wrapRef.current.getBoundingClientRect();
    setHover({ t, i, x: e.clientX - box.left, y: e.clientY - box.top });
  };

  return (
    <section className="scope" ref={wrapRef} aria-labelledby="scope-title">
      <div className="scope-head">
        <div>
          <h2 className="scope-title" id="scope-title">Live dashboard load times</h2>
          <p className="scope-sub">
            Each bar is one report load, streamed as it happens. Anything above the dashed line breaches the {warning}s target and raises an alert.
          </p>
        </div>
        <div className="scope-stats" aria-live="polite">
          <div className="scope-stat"><div className="v">{seconds(stats.p50)}</div><div className="l">Median load</div></div>
          <div className="scope-stat"><div className={`v ${stats.p95 > warning ? "hot" : ""}`}>{seconds(stats.p95)}</div><div className="l">95th percentile</div></div>
          <div className="scope-stat"><div className="v">{stats.breaches}<span style={{ fontSize: 15, opacity: 0.6 }}>/{stats.count}</span></div><div className="l">Over {warning}s</div></div>
          <div className="scope-stat"><div className="v">{stats.failures}</div><div className="l">Failed refreshes</div></div>
        </div>
      </div>

      {telemetry.length === 0 ? (
        <div className="scope-empty">{connection === "open" ? "Waiting for the first readings…" : "Connecting to the live feed…"}</div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
          aria-label={`Bar chart of the last ${telemetry.length} load times. ${stats.breaches} exceeded ${warning} seconds.`}
          onMouseLeave={() => setHover(null)}>
          {[0, 15, 30, 45, 60].map((v) => (
            <g key={v}>
              <line className="grid" x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} />
              <text className="axis" x={PAD.left - 8} y={y(v) + 4} textAnchor="end">{v}s</text>
            </g>
          ))}
          {telemetry.map((t, i) => {
            const x = PAD.left + (offset + i) * slot + (slot - barW) / 2;
            const top = y(t.avg_load_time_sec);
            const isNew = i === telemetry.length - 1;
            return (
              <g key={`${received - telemetry.length + i}`}>
                <rect
                  className={`bar ${t.latency_tier} ${isNew ? "bar-new" : ""}`}
                  x={x} y={top} width={barW} height={PAD.top + plotH - top} rx={1.5}
                  fill={TIER_COLOR[t.latency_tier] ?? TIER_COLOR.ok}
                  opacity={hover && hover.i !== i ? 0.45 : 1}
                />
                {(t.refresh_status === "FAILED" || t.refresh_status === "TIMED_OUT") && (
                  <rect x={x + barW / 2 - 2.5} y={PAD.top + plotH + 6} width={5} height={5} fill="var(--scope-critical)" transform={`rotate(45 ${x + barW / 2} ${PAD.top + plotH + 8.5})`} />
                )}
                {/* wide invisible hit target, easier to hover than a thin bar */}
                <rect x={PAD.left + (offset + i) * slot} y={PAD.top} width={slot} height={plotH + 18} fill="transparent"
                  onMouseMove={(e) => onMove(e, t, i)} />
              </g>
            );
          })}
          <line className="threshold" x1={PAD.left} x2={W - PAD.right} y1={y(warning)} y2={y(warning)} />
        </svg>
      )}

      <div className="scope-legend">
        {["ok", "warning", "high", "critical"].map((k) => (
          <span key={k}><i style={{ background: TIER_COLOR[k] }} />{TIER_LABEL[k]}</span>
        ))}
        <span><i style={{ background: "var(--scope-critical)", transform: "rotate(45deg) scale(.7)" }} />Refresh failed or timed out</span>
      </div>

      {hover && (
        <div className="scope-tip" style={{ left: Math.min(hover.x + 14, (wrapRef.current?.clientWidth ?? 600) - 220), top: hover.y - 64 }}>
          <b>{hover.t.report_name}</b>
          {seconds(hover.t.avg_load_time_sec)} load ({TIER_LABEL[hover.t.latency_tier].toLowerCase()})<br />
          Refresh {STATUS_LABEL[hover.t.refresh_status]?.toLowerCase()}
        </div>
      )}
    </section>
  );
}