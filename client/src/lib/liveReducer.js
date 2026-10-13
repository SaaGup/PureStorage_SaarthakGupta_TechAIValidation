// State for the live WebSocket feed. A pure reducer (no React, no network),
// so it can be unit-tested and reasoned about on its own.

export const MAX_TELEMETRY = 90;   // bars in the live strip
export const MAX_ALERTS = 200;     // alerts kept in the browser

export const initialLiveState = {
  connection: "connecting", // connecting | open | reconnecting | closed
  alerts: [],               // newest first
  telemetry: [],            // oldest first, last MAX_TELEMETRY observations
  replay: null,
  thresholds: null,
  received: 0,              // telemetry messages since page load
};

function upsertAlert(list, alert) {
  const i = list.findIndex((a) => a.id === alert.id);
  if (i === -1) return [alert, ...list].slice(0, MAX_ALERTS);
  const copy = list.slice();
  copy[i] = { ...copy[i], ...alert };
  return copy;
}

export function liveReducer(state, action) {
  switch (action.type) {
    case "connection":
      return { ...state, connection: action.status };

    case "hello": {
      // Server sends recent alerts on (re)connect: merge, never duplicate.
      let alerts = state.alerts;
      for (const a of [...action.alerts].reverse()) alerts = upsertAlert(alerts, a);
      alerts = [...alerts].sort((x, y) => y.created_at.localeCompare(x.created_at));
      // The server also sends its recent readings, so the live chart starts full.
      const telemetry = action.telemetry ? action.telemetry.slice(-MAX_TELEMETRY) : state.telemetry;
      return { ...state, connection: "open", alerts, telemetry, replay: action.replay, thresholds: action.thresholds };
    }

    case "alert":
    case "alert_ack":
      return { ...state, alerts: upsertAlert(state.alerts, action.alert) };

    case "telemetry":
      return {
        ...state,
        telemetry: [...state.telemetry, action.data].slice(-MAX_TELEMETRY),
        received: state.received + 1,
      };

    case "replay_status":
      return { ...state, replay: action.status };

    default:
      return state;
  }
}

// Rolling numbers for the live panel, from the telemetry currently on screen.
export function telemetryStats(telemetry, warningSec = 15) {
  if (!telemetry.length) return { count: 0, breaches: 0, failures: 0, p50: null, p95: null };
  const sorted = telemetry.map((t) => t.avg_load_time_sec).sort((a, b) => a - b);
  const pick = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return {
    count: telemetry.length,
    breaches: telemetry.filter((t) => t.avg_load_time_sec > warningSec).length,
    failures: telemetry.filter((t) => t.refresh_status === "FAILED" || t.refresh_status === "TIMED_OUT").length,
    p50: pick(0.5),
    p95: pick(0.95),
  };
}

// Reconnect delay: 1s, 2s, 4s ... capped at 30s, with jitter so many tabs don't reconnect at once.
export function backoffMs(attempt, random = Math.random) {
  const base = Math.min(30000, 1000 * 2 ** attempt);
  return Math.round(base * (0.75 + random() * 0.5));
}