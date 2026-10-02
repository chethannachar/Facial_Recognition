import { StatusPill } from "./StatusPill.jsx";

export const AppHeader = ({ status, statusTone }) => (
  <header className="app-header">
    <div className="brand-lockup">
      <svg className="brand-mark" viewBox="0 0 40 40" aria-hidden="true">
        <rect x="1" y="1" width="38" height="38" rx="11" fill="#a8d2b6" />
        <path d="M10 16.5c1.4-1.8 3.8-1.8 5.2 0m9.6 0c1.4-1.8 3.8-1.8 5.2 0" fill="none" stroke="#132219" strokeLinecap="round" strokeWidth="1.8" />
        <path d="M13 23.5c2 3.1 4.3 4.6 7 4.6s5-1.5 7-4.6" fill="none" stroke="#132219" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
      <div className="brand-copy">
        <p className="eyebrow">REAL-TIME EXPRESSION</p>
        <h1>Emotional Sense</h1>
      </div>
    </div>
    <div className="header-state" role="status" aria-live="polite">
      <StatusPill tone={statusTone}>{status}</StatusPill>
    </div>
  </header>
);