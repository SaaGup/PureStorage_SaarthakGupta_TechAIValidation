// Small presentational building blocks shared by every page.
import { Icon } from "./Icon.jsx";
import { SEVERITY_LABEL, ACTION_LABEL } from "../lib/format.js";

// Severity never relies on colour alone: shape + text label.
export function Severity({ level }) {
  return <span className={`sev ${level}`}><i aria-hidden="true" />{SEVERITY_LABEL[level] ?? level}</span>;
}

export function ActionTag({ action }) {
  const tone = action === "OK" ? "" : action === "NO_VIEWS" ? "" : "warn";
  return <span className={`tag ${tone}`}>{ACTION_LABEL[action] ?? action}</span>;
}

export function Kpis({ items }) {
  return (
    <section className="kpis" aria-label="Key figures">
      {items.filter(Boolean).map((k) => (
        <div className="kpi" key={k.label}>
          <div className="label">{k.label}</div>
          <div className={`value ${k.tone ?? ""}`}>{k.value}</div>
          {k.hint && <div className="hint">{k.hint}</div>}
        </div>
      ))}
    </section>
  );
}

export function Panel({ title, description, actions, children, flush = false }) {
  return (
    <section className="panel">
      {(title || actions) && (
        <div className="panel-head">
          <div>
            {title && <h2>{title}</h2>}
            {description && <p>{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className={flush ? "" : "panel-body"} style={flush ? { marginTop: 14 } : undefined}>{children}</div>
    </section>
  );
}

export function Meter({ value, max, label, tone = "" }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="meter">
      <div className="track"><div className={`fill ${tone}`} style={{ width: `${pct}%` }} /></div>
      <span className="v">{label}</span>
    </div>
  );
}

export function Loading({ rows = 4 }) {
  return (
    <div className="panel-body" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: 18, margin: "12px 0", width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  const forbidden = error?.status === 403;
  return (
    <div className="state" role="alert">
      <h3>{forbidden ? "You don't have access to this" : "This data didn't load"}</h3>
      <p>{forbidden ? "Your role can't view this information. Ask an admin if you need it." : error?.message}</p>
      {!forbidden && onRetry && <button className="btn" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function Empty({ title, children }) {
  return (
    <div className="state">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}

export function SortHeader({ field, label, sort, order, onSort, align }) {
  const active = sort === field;
  return (
    <th className={align} aria-sort={active ? (order === "asc" ? "ascending" : "descending") : undefined}>
      <button onClick={() => onSort(field)}>
        {label}
        {active && <Icon name={order === "asc" ? "arrowUp" : "arrowDown"} width={13} height={13} />}
      </button>
    </th>
  );
}

export function Pager({ page, totalPages, total, onPage }) {
  return (
    <div className="pager">
      <span>{total} result{total === 1 ? "" : "s"}</span>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button className="btn small" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <span>Page {page} of {totalPages}</span>
        <button className="btn small" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}

export function Callout({ children }) {
  return <div className="callout"><Icon name="info" /><div>{children}</div></div>;
}