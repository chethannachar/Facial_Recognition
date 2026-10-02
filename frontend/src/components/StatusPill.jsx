export const StatusPill = ({ children, tone = "idle", className = "" }) => (
  <span className={`status-pill status-pill-${tone} ${className}`.trim()}>
    <span className="status-dot" aria-hidden="true" />
    <span>{children}</span>
  </span>
);