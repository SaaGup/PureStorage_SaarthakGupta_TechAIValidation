import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";

// Loads one endpoint and tracks loading / error / data. Re-fetches when `path` changes
// and cancels the old request, so fast filter changes never show stale results.
export function useApi(path) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!path) return undefined;
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    api(path, { signal: controller.signal })
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error) => {
        if (error.name !== "AbortError") setState({ data: null, error, loading: false });
      });
    return () => controller.abort();
  }, [path, tick]);

  return { ...state, reload };
}