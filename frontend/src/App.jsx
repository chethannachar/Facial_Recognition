import { useRef, useState } from "react";
import { AppHeader } from "./components/AppHeader.jsx";
import { CameraControls } from "./components/CameraControls.jsx";
import { CameraStage } from "./components/CameraStage.jsx";
import { ResultsPanel } from "./components/ResultsPanel.jsx";
import { useCamera } from "./hooks/useCamera.js";
import { useEmotionPrediction } from "./hooks/useEmotionPrediction.js";
import { useFaceDetection } from "./hooks/useFaceDetection.js";
import "./styles/tokens.css";
import "./App.css";

const App = () => {
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const predictionFrameRef = useRef(() => {});
  const [videoAspectRatio, setVideoAspectRatio] = useState("4 / 3");

  const camera = useCamera(videoRef);
  const handleDetectionFrame = (faces, video, sessionId) => {
    predictionFrameRef.current(faces, video, sessionId);
  };
  const detection = useFaceDetection({
    videoRef,
    overlayRef,
    cameraActive: camera.cameraActive,
    cameraSessionId: camera.cameraSessionId,
    sessionRef: camera.sessionRef,
    isMirrored: camera.isMirrored,
    onFrame: handleDetectionFrame,
  });
  const prediction = useEmotionPrediction({
    sessionRef: camera.sessionRef,
    cameraSessionId: camera.cameraSessionId,
    onPredictions: detection.applyPredictions,
  });

  predictionFrameRef.current = prediction.predictFaces;

  const handleStart = () => {
    void camera.startCamera();
  };

  const handleStop = () => {
    prediction.cancelPrediction();
    detection.resetFaces();
    camera.stopCamera();
  };

  const handleSwitch = () => {
    prediction.cancelPrediction();
    detection.resetFaces();
    camera.switchCamera();
  };

  const handleRetryPrediction = () => {
    prediction.retryPrediction(detection.faces, videoRef.current);
  };

  const handleLoadedMetadata = (event) => {
    const { videoWidth, videoHeight } = event.currentTarget;
    if (videoWidth && videoHeight) {
      setVideoAspectRatio(`${videoWidth} / ${videoHeight}`);
    }
  };

  const status = camera.cameraSwitching
    ? "Switching camera"
    : camera.cameraStarting
      ? "Starting camera"
      : camera.cameraActive
        ? prediction.processing
          ? "Analyzing"
          : detection.detectorReady
            ? detection.faces.length > 0
              ? "Live"
              : "Ready"
            : "Loading detector"
        : camera.cameraError
          ? "Camera unavailable"
          : "Idle";
  const statusTone = camera.cameraError
    ? "error"
    : camera.cameraActive
      ? "live"
      : "idle";

  return (
    <div className="app-shell">
      <AppHeader status={status} statusTone={statusTone} />
      <main className="workspace">
        <section className="camera-panel" aria-labelledby="camera-title">
          <CameraStage
            videoRef={videoRef}
            overlayRef={overlayRef}
            aspectRatio={videoAspectRatio}
            cameraActive={camera.cameraActive}
            cameraStarting={camera.cameraStarting}
            cameraSwitching={camera.cameraSwitching}
            facingMode={camera.facingMode}
            isMirrored={camera.isMirrored}
            cameraError={camera.cameraError}
            cameraNotice={camera.cameraNotice}
            detectionError={detection.detectionError}
            detectorReady={detection.detectorReady}
            hasFaces={detection.faces.length > 0}
            faces={detection.faces}
            canSwitchCamera={camera.canSwitchCamera}
            onSwitchCamera={handleSwitch}
            onLoadedMetadata={handleLoadedMetadata}
          />
          <CameraControls
            cameraActive={camera.cameraActive}
            cameraStarting={camera.cameraStarting}
            cameraError={camera.cameraError}
            onStart={handleStart}
            onStop={handleStop}
          />
        </section>
        <ResultsPanel
          faces={detection.faces}
          cameraActive={camera.cameraActive}
          detectorReady={detection.detectorReady}
          processing={prediction.processing}
          predictionError={prediction.predictionError}
          onRetry={handleRetryPrediction}
        />
      </main>
    </div>
  );
};

export default App;