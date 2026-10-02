import { useEffect, useRef } from "react";
import { getCameraSwitchPosition } from "../utils/faces.js";
import { StatusPill } from "./StatusPill.jsx";

const CameraIcon = () => (
  <svg className="stage-camera-icon" viewBox="0 0 48 40" aria-hidden="true">
    <path d="M5 11.5h8l3-4h13l3 4h3.5A4.5 4.5 0 0 1 40 16v15a4.5 4.5 0 0 1-4.5 4.5h-27A4.5 4.5 0 0 1 4 31V16a4.5 4.5 0 0 1 1-4.5Z" />
    <circle cx="23" cy="23" r="7" />
  </svg>
);

export const CameraStage = ({
  videoRef,
  overlayRef,
  aspectRatio,
  cameraActive,
  cameraStarting,
  cameraSwitching,
  facingMode,
  isMirrored,
  cameraError,
  cameraNotice,
  detectionError,
  detectorReady,
  hasFaces,
  faces = [],
  canSwitchCamera,
  onSwitchCamera,
  onLoadedMetadata,
}) => {
  const stageRef = useRef(null);
  const video = videoRef.current;
  const stage = stageRef.current;
  const switchPosition = getCameraSwitchPosition(
    faces,
    { width: video?.videoWidth || 0, height: video?.videoHeight || 0 },
    { width: stage?.clientWidth || 0, height: stage?.clientHeight || 0 },
    isMirrored
  );

  useEffect(() => {
    const stage = stageRef.current;
    const overlay = overlayRef.current;
    if (!stage || !overlay || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver(([entry]) => {
      const pixelRatio = window.devicePixelRatio || 1;
      const width = Math.round(entry.contentRect.width * pixelRatio);
      const height = Math.round(entry.contentRect.height * pixelRatio);
      if (width > 0 && height > 0 && (overlay.width !== width || overlay.height !== height)) {
        overlay.width = width;
        overlay.height = height;
      }
    });
    observer.observe(stage);

    return () => observer.disconnect();
  }, [overlayRef]);

  const status = cameraSwitching
    ? "Switching camera"
    : cameraStarting
      ? "Starting"
      : cameraActive
        ? detectorReady
          ? "Detecting"
          : "Loading detector"
        : "Camera idle";
  const statusTone = cameraActive ? "live" : cameraError ? "error" : "idle";

  return (
    <>
      <div className="stage-heading">
        <div>
          <p className="eyebrow">CAMERA FEED</p>
          <h2 id="camera-title">Live camera</h2>
        </div>
        <span className="camera-mode-label">
          {cameraActive ? `${facingMode === "user" ? "FRONT" : "REAR"} CAMERA` : "PREVIEW"}
        </span>
      </div>

      <div
        ref={stageRef}
        className={`camera-stage ${cameraSwitching ? "is-switching" : ""}`}
        style={{ aspectRatio }}
        data-mirrored={isMirrored}
      >
        <video
          ref={videoRef}
          className={`camera-video ${cameraActive ? "is-visible" : ""} ${isMirrored ? "is-mirrored" : ""}`}
          autoPlay
          muted
          playsInline
          aria-label={`${facingMode === "user" ? "Front" : "Rear"} camera preview`}
          onLoadedMetadata={onLoadedMetadata}
        />
        <canvas ref={overlayRef} className="detection-overlay" aria-hidden="true" />

        {canSwitchCamera && (
          <button
            className="stage-switch-button"
            data-position={switchPosition}
            type="button"
            onClick={onSwitchCamera}
            disabled={cameraStarting || cameraSwitching}
            aria-label="Switch camera"
            title="Switch camera"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 7h12l-2.5-2.5M17 17H5l2.5 2.5" />
              <path d="M19 7v4m-14 6v-4" />
            </svg>
          </button>
        )}

        <div className="stage-topline">
          <StatusPill tone={statusTone}>{status}</StatusPill>
          {cameraActive && (
            <span className="stage-camera-mode">
              {facingMode === "user" ? "SELFIE" : "WORLD"}
            </span>
          )}
        </div>

        {!cameraActive && !cameraSwitching && (
          <div className="stage-state" role={cameraError ? "alert" : "status"} aria-live="polite">
            <CameraIcon />
            <strong>
              {cameraError
                ? "Camera unavailable"
                : cameraStarting
                  ? "Starting camera"
                  : "Camera is off"}
            </strong>
            <span>
              {cameraError || "Start the camera to see real-time expression insights."}
            </span>
          </div>
        )}

        {cameraActive && detectorReady && !hasFaces && (
          <div className="stage-hint" aria-live="polite">
            No face detected. Move closer or improve the lighting.
          </div>
        )}

        {cameraActive && (cameraNotice || detectionError) && (
          <div className="stage-notice" role="status" aria-live="polite">
            {cameraNotice || detectionError}
          </div>
        )}
      </div>
    </>
  );
};