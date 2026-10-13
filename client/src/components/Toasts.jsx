// Pops a toast for each new CRITICAL alert pushed over the WebSocket.
import { useEffect, useState } from "react";
import { useLive } from "../realtime/LiveContext.jsx";

const TOAST_MS = 6000;

export function Toasts() {
  const { subscribe } = useLive();
  const [toasts, setToasts] = useState([]);

  useEffect(() => subscribe((msg) => {
    if (msg.type !== "alert" || msg.alert.severity !== "critical") return;
    const t = msg.alert;
    setToasts((list) => [t, ...list].slice(0, 3));
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== t.id)), TOAST_MS);
  }), [subscribe]);

  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div className="toast" key={t.id}>
          <span className="bolt" aria-hidden="true" />
          <div><b>Critical: {t.report_name}</b><p>{t.message}</p></div>
          <button aria-label="Dismiss" onClick={() => setToasts((l) => l.filter((x) => x.id !== t.id))}>×</button>
        </div>
      ))}
    </div>
  );
}