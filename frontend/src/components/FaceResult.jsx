export const FaceResult = ({ face }) => (
  <li className="face-result">
    <div className="face-result-heading">
      <span className="face-index">{`Face ${face.id}`}</span>
      <span className={`face-state ${face.emotion ? "is-updated" : ""}`}>
        {face.emotion ? "UPDATED" : "ANALYZING"}
      </span>
    </div>
    <div className="emotion-value" aria-live="polite">
      <span className="emotion-dot" aria-hidden="true" />
      {face.emotion || "Detecting..."}
    </div>
    <div className="confidence-row">
      <span>Confidence</span>
      <strong>
        {face.confidence == null ? "--" : `${(face.confidence * 100).toFixed(1)}%`}
      </strong>
    </div>
    {face.confidence != null && (
      <div
        className="confidence-track"
        role="progressbar"
        aria-label={`Face ${face.id} confidence`}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={Math.round(face.confidence * 100)}
      >
        <span style={{ width: `${face.confidence * 100}%` }} />
      </div>
    )}
  </li>
);