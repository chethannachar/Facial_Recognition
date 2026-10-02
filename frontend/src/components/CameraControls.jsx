export const CameraControls = ({
  cameraActive,
  cameraStarting,
  cameraError,
  onStart,
  onStop,
}) => (
  <div className="camera-controls">
    <p className="camera-hint">
      {cameraActive
        ? "Face crops are sent for emotion analysis."
        : "Your camera stays on this device; only face crops are sent for analysis."}
    </p>
    <div className="button-group">
      <button
        className="button-primary"
        type="button"
        onClick={onStart}
        disabled={cameraActive || cameraStarting}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M7 5.5v9l7-4.5-7-4.5Z" />
        </svg>
        {cameraStarting ? "Starting" : cameraError ? "Try again" : "Start camera"}
      </button>
      <button
        className="button-secondary"
        type="button"
        onClick={onStop}
        disabled={!cameraActive && !cameraStarting}
      >
        Stop camera
      </button>
    </div>
  </div>
);