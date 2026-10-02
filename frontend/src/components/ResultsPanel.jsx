import { FaceResult } from "./FaceResult.jsx";

export const ResultsPanel = ({
  faces,
  cameraActive,
  detectorReady,
  processing,
  predictionError,
  onRetry,
}) => (
  <aside className="results-panel" aria-labelledby="results-title">
    <div className="results-heading">
      <div>
        <p className="eyebrow">LIVE READOUT</p>
        <h2 id="results-title">Emotion results</h2>
      </div>
      <div className="face-count" aria-label={`${faces.length} faces detected`}>
        <strong>{faces.length}</strong>
        <span>{faces.length === 1 ? "FACE" : "FACES"}</span>
      </div>
    </div>

    {predictionError && (
      <div className="inline-error" role="alert">
        <p>{predictionError}</p>
        <button type="button" onClick={onRetry} disabled={processing || faces.length === 0}>
          Retry
        </button>
      </div>
    )}

    {faces.length > 0 ? (
      <ol className="face-results" aria-label="Per-face emotion results">
        {faces.map((face) => <FaceResult key={face.id} face={face} />)}
      </ol>
    ) : (
      <div className="empty-state" aria-live="polite">
        <strong>
          {cameraActive && detectorReady
            ? "No face detected"
            : cameraActive
              ? "Preparing detector"
              : "Waiting for camera"}
        </strong>
        <span>
          {cameraActive && detectorReady
            ? "Move into view to see a live emotion result."
            : "Live results will appear here."}
        </span>
      </div>
    )}

    <div className="results-footer" role="status" aria-live="polite">
      <span className={`status-indicator ${processing ? "is-processing" : cameraActive ? "is-live" : ""}`} />
      <span>{processing ? "Analyzing current frame" : "Latest frame"}</span>
    </div>
  </aside>
);