// Inline SVG icons (no icon library needed). 24x24 grid, stroke style.
const PATHS = {
  overview: "M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z",
  reports: "M4 4h16v16H4zM8 9h8M8 13h8M8 17h5",
  costs: "M12 2v20M17 6.5C17 4.6 14.8 3.5 12 3.5S7 4.6 7 6.5 9.2 9.3 12 10s5 1.6 5 3.5-2.2 3-5 3-5-1.1-5-3",
  orphans: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM17 8l5 5M22 8l-5 5",
  alerts: "M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0",
  quality: "M9 12l2 2 4-4M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3Z",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 16v-4M12 8h.01",
  play: "M6 4l14 8-14 8V4Z",
  pause: "M7 4h4v16H7zM13 4h4v16h-4z",
  back: "M15 18l-6-6 6-6",
  check: "M20 6 9 17l-5-5",
  arrowUp: "M12 19V5M5 12l7-7 7 7",
  arrowDown: "M12 5v14M19 12l-7 7-7-7",
};

export function Icon({ name, title, ...rest }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden={title ? undefined : true} role={title ? "img" : undefined} {...rest}>
      {title && <title>{title}</title>}
      <path d={PATHS[name]} />
    </svg>
  );
}

export function BrandMark(props) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" {...props}>
      <rect width="32" height="32" rx="7" fill="var(--accent)" />
      <rect x="6" y="17" width="3" height="9" rx="1.5" fill="var(--accent-ink)" />
      <rect x="11" y="12" width="3" height="14" rx="1.5" fill="var(--accent-ink)" />
      <rect x="16" y="7" width="3" height="19" rx="1.5" fill="#E0884A" />
      <rect x="21" y="14" width="3" height="12" rx="1.5" fill="var(--accent-ink)" />
    </svg>
  );
}