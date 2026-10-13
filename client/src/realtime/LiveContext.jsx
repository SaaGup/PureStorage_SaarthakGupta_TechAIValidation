import { createContext, useContext, useEffect, useReducer, useRef } from "react";
import { liveReducer, initialLiveState, backoffMs } from "../lib/liveReducer.js";
import { SESSION_EXPIRED_EVENT } from "../lib/api.js";

const LiveContext = createContext(initialLiveState);
const WS_PATH = "/ws";

// One WebSocket for the whole app. The browser sends the session cookie with the
// upgrade request automatically, so no token is passed in the URL.
// Reconnects with exponential backoff; code 4001 means the session expired.
export function LiveProvider({ enabled, children }) {
  const [state, dispatch] = useReducer(liveReducer, initialLiveState);
  const listeners = useRef(new Set());

  useEffect(() => {
    if (!enabled) return undefined;
    let socket;
    let attempt = 0;
    let timer;
    let stopped = false;

    const connect = () => {
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      socket = new WebSocket(`${proto}://${window.location.host}${WS_PATH}`);
      dispatch({ type: "connection", status: attempt === 0 ? "connecting" : "reconnecting" });

      socket.onopen = () => { attempt = 0; };
      socket.onmessage = (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }
        dispatch(msg);
        for (const fn of listeners.current) fn(msg);
      };
      socket.onclose = (event) => {
        if (stopped) return;
        if (event.code === 4001) {
          dispatch({ type: "connection", status: "closed" });
          window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
          return;
        }
        dispatch({ type: "connection", status: "reconnecting" });
        timer = setTimeout(connect, backoffMs(attempt++));
      };
    };

    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      socket?.close(1000, "Page closed");
    };
  }, [enabled]);

  const value = { ...state, subscribe: (fn) => { listeners.current.add(fn); return () => listeners.current.delete(fn); } };
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export const useLive = () => useContext(LiveContext);

// Latency tiers come from the server (hello message), so the UI never hard-codes 15/30/50.
export function useLatencyTiers() {
  return useContext(LiveContext).thresholds?.latency ?? null;
}

export function tierOf(seconds, tiers) {
  if (!tiers || seconds === null || seconds === undefined) return "";
  if (seconds >= tiers.critical) return "critical";
  if (seconds >= tiers.high) return "high";
  if (seconds > tiers.warning) return "warning";
  return "";
}