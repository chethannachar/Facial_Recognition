
import React, { useCallback, useEffect, useRef, useState } from "react";
import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";
import "./App.css";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
const DETECTION_INTERVAL_MS = 250;
const MAX_FACES_PER_BATCH = 4;
const FACE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";
const VISION_WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";

const cropFace = (video, box) => {
  const size = Math.min(
    Math.max(box.width, box.height) * 1.25,
    video.videoWidth,
    video.videoHeight
  );
  const centerX = box.originX + box.width / 2;
  const centerY = box.originY + box.height / 2;
  const sourceX = Math.max(0, Math.min(video.videoWidth - size, centerX - size / 2));
  const sourceY = Math.max(0, Math.min(video.videoHeight - size, centerY - size / 2));
  const canvas = document.createElement("canvas");
  canvas.width = 224;
  canvas.height = 224;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Unable to prepare a face image.");
  }

  context.drawImage(video, sourceX, sourceY, size, size, 0, 0, 224, 224);
  return canvas.toDataURL("image/jpeg", 0.76).split(",")[1];
};

const trackDetections = (boxes, previousFaces, nextFaceId, width, height) => {
  const matchedIds = new Set();

  return boxes.map((box) => {
    const centerX = (box.originX + box.width / 2) / width;
    const centerY = (box.originY + box.height / 2) / height;
    let match = null;
    let closestDistance = 0.16;

    for (const previous of previousFaces) {
      if (matchedIds.has(previous.id)) {
        continue;
      }

      const distance = Math.hypot(
        centerX - previous.centerX,
        centerY - previous.centerY
      );
      if (distance < closestDistance) {
        match = previous;
        closestDistance = distance;
      }
    }

    if (match) {
      matchedIds.add(match.id);
    }

    return {
      id: match?.id ?? nextFaceId.current++,
      box,
      centerX,
      centerY,
      emotion: match?.emotion ?? null,
      confidence: match?.confidence ?? null,
    };
  });
};

const drawFaceBoxes = (canvas, video, faces) => {
  if (!canvas || !video.videoWidth || !video.videoHeight) {
    return;
  }

  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }

  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.lineWidth = Math.max(2, canvas.width / 320);
  context.font = `600 ${Math.max(15, canvas.width / 38)}px sans-serif`;
  context.textBaseline = "middle";

  faces.forEach((face, index) => {
    const { originX, originY, width, height } = face.box;
    const displayX = canvas.width - originX - width;
    const label = face.emotion
      ? `${face.emotion}  ${Math.round(face.confidence * 100)}%`
      : `Face ${index + 1}`;
    const labelWidth = context.measureText(label).width + 20;
    const labelX = Math.max(0, Math.min(canvas.width - labelWidth, displayX));
    const labelY = Math.max(0, originY - 36);

    context.strokeStyle = "#9fe870";
    context.strokeRect(displayX, originY, width, height);
    context.fillStyle = "#9fe870";
    context.fillRect(labelX, labelY, labelWidth, 30);
    context.fillStyle = "#13251d";
    context.fillText(label, labelX + 10, labelY + 15);
  });
};

const clearFaceOverlay = (canvas) => {
  if (!canvas) {
    return;
  }

  canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
};

const App = () => {
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const streamRef = useRef(null);
  const cameraFacingModeRef = useRef("user");
  const detectorRef = useRef(null);
  const detectorPromiseRef = useRef(null);
  const predictionAbortRef = useRef(null);
  const loopRef = useRef(null);
  const cameraRequestRef = useRef(0);
  const cameraStartingRef = useRef(false);
  const detectionBusyRef = useRef(false);
  const requestInFlightRef = useRef(false);
  const lastRequestAtRef = useRef(0);
  const retryAfterRef = useRef(0);
  const retryDelayRef = useRef(1000);
  const nextBatchStartRef = useRef(0);
  const nextFaceIdRef = useRef(1);
  const trackedFacesRef = useRef([]);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState("user");
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraStatus, setCameraStatus] = useState("Starting camera");
  const [cameraError, setCameraError] = useState(null);
  const [predictionError, setPredictionError] = useState(null);
  const [detectorReady, setDetectorReady] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [faces, setFaces] = useState([]);
  const [videoAspectRatio, setVideoAspectRatio] = useState("4 / 3");

  const getFaceDetector = useCallback(async () => {
    if (detectorRef.current) {
      return detectorRef.current;
    }

    if (!detectorPromiseRef.current) {
      detectorPromiseRef.current = (async () => {
        const vision = await FilesetResolver.forVisionTasks(VISION_WASM_URL);
        return FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: FACE_MODEL_URL,
            delegate: "CPU",
          },
          runningMode: "VIDEO",
          minDetectionConfidence: 0.55,
          minSuppressionThreshold: 0.3,
        });
      })();
    }

    try {
      detectorRef.current = await detectorPromiseRef.current;
      return detectorRef.current;
    } catch (error) {
      detectorPromiseRef.current = null;
      throw error;
    }
  }, []);

  const startDetectionLoop = useCallback((sessionId) => {
    if (loopRef.current) {
      window.clearInterval(loopRef.current);
    }
    lastRequestAtRef.current = -DETECTION_INTERVAL_MS;

    const detectFrame = () => {
      const video = videoRef.current;
      const detector = detectorRef.current;
      if (
        sessionId !== cameraRequestRef.current ||
        detectionBusyRef.current ||
        !video ||
        !detector ||
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        return;
      }

      detectionBusyRef.current = true;
      try {
        const result = detector.detectForVideo(video, performance.now());
        const boxes = result.detections
          .map((detection) => detection.boundingBox)
          .filter(Boolean);
        const currentFaces = trackDetections(
          boxes,
          trackedFacesRef.current,
          nextFaceIdRef,
          video.videoWidth,
          video.videoHeight
        );

        trackedFacesRef.current = currentFaces;
        setFaces(currentFaces);
        drawFaceBoxes(overlayRef.current, video, currentFaces);

        const now = performance.now();
        if (
          currentFaces.length === 0 ||
          requestInFlightRef.current ||
          now < retryAfterRef.current ||
          now - lastRequestAtRef.current < DETECTION_INTERVAL_MS
        ) {
          return;
        }

        const batchStart = nextBatchStartRef.current % currentFaces.length;
        const selectedFaces = Array.from(
          { length: Math.min(MAX_FACES_PER_BATCH, currentFaces.length) },
          (_, index) => currentFaces[(batchStart + index) % currentFaces.length]
        );
        nextBatchStartRef.current =
          (batchStart + selectedFaces.length) % currentFaces.length;

        const faceIds = selectedFaces.map((face) => face.id);
        const images = selectedFaces.map((face) => cropFace(video, face.box));
        requestInFlightRef.current = true;
        lastRequestAtRef.current = now;
        setProcessing(true);
        const predictionController = new AbortController();
        predictionAbortRef.current = predictionController;

        fetch(`${API_BASE_URL}/predict/faces`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ images }),
          signal: predictionController.signal,
        })
          .then(async (response) => {
            const data = await response.json();
            if (!response.ok) {
              throw new Error(data?.error || `Backend returned ${response.status}`);
            }
            if (
              !Array.isArray(data.predictions) ||
              data.predictions.length !== faceIds.length
            ) {
              throw new Error("The backend returned an invalid prediction response.");
            }
            if (sessionId !== cameraRequestRef.current) {
              return;
            }

            const updates = new Map(
              faceIds.map((id, index) => [id, data.predictions[index]])
            );
            const updatedFaces = trackedFacesRef.current.map((face) => {
              const prediction = updates.get(face.id);
              return prediction
                ? { ...face, ...prediction }
                : face;
            });
            trackedFacesRef.current = updatedFaces;
            setFaces(updatedFaces);
            setPredictionError(null);
            retryAfterRef.current = 0;
            retryDelayRef.current = 1000;
          })
          .catch((error) => {
            if (sessionId === cameraRequestRef.current) {
              setPredictionError(error.message || "Emotion prediction failed.");
              retryAfterRef.current = performance.now() + retryDelayRef.current;
              retryDelayRef.current = Math.min(retryDelayRef.current * 2, 10000);
            }
          })
          .finally(() => {
            if (sessionId === cameraRequestRef.current) {
              requestInFlightRef.current = false;
              predictionAbortRef.current = null;
              setProcessing(false);
            }
          });
      } catch (error) {
        setCameraError(error.message || "Face detection could not continue.");
        setCameraStatus("Face detection unavailable");
      } finally {
        detectionBusyRef.current = false;
      }
    };

    detectFrame();
    loopRef.current = window.setInterval(detectFrame, DETECTION_INTERVAL_MS);
  }, []);

  const stopCamera = useCallback(() => {
    cameraRequestRef.current += 1;
    cameraStartingRef.current = false;
    predictionAbortRef.current?.abort();
    predictionAbortRef.current = null;
    if (loopRef.current) {
      window.clearInterval(loopRef.current);
      loopRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    clearFaceOverlay(overlayRef.current);
    trackedFacesRef.current = [];
    nextFaceIdRef.current = 1;
    nextBatchStartRef.current = 0;
    detectionBusyRef.current = false;
    requestInFlightRef.current = false;
    lastRequestAtRef.current = 0;
    retryAfterRef.current = 0;
    retryDelayRef.current = 1000;
    setFaces([]);
    setCameraActive(false);
    setCameraStarting(false);
    setDetectorReady(false);
    setProcessing(false);
    setCameraError(null);
    setPredictionError(null);
    setCameraStatus("Camera stopped");
  }, []);

  const startCamera = useCallback(async () => {
    if (cameraStartingRef.current || streamRef.current) {
      return;
    }

    cameraStartingRef.current = true;
    const sessionId = cameraRequestRef.current + 1;
    cameraRequestRef.current = sessionId;
    clearFaceOverlay(overlayRef.current);
    trackedFacesRef.current = [];
    nextFaceIdRef.current = 1;
    nextBatchStartRef.current = 0;
    detectionBusyRef.current = false;
    requestInFlightRef.current = false;
    lastRequestAtRef.current = 0;
    retryAfterRef.current = 0;
    retryDelayRef.current = 1000;
    setFaces([]);
    setProcessing(false);
    setCameraStarting(true);
    setCameraError(null);
    setPredictionError(null);
    setCameraStatus("Requesting camera access");

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera access requires a secure HTTPS connection.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: cameraFacingModeRef.current },
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30, max: 30 },
        },
      });

      if (sessionId !== cameraRequestRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        throw new Error("The camera preview is unavailable.");
      }
      video.srcObject = stream;
      await video.play();
      setCameraActive(true);
      setCameraStatus("Loading face detector");

      const detector = await getFaceDetector();
      if (sessionId !== cameraRequestRef.current) {
        return;
      }

      setDetectorReady(true);
      setCameraStatus("Live detection");
      setVideoAspectRatio(`${video.videoWidth} / ${video.videoHeight}`);
      startDetectionLoop(sessionId);
      void detector;
    } catch (error) {
      if (sessionId === cameraRequestRef.current) {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setCameraActive(false);
        setDetectorReady(false);
        setCameraStatus("Camera unavailable");

        if (error.name === "NotAllowedError" || error.name === "SecurityError") {
          setCameraError("Camera permission was denied. Allow camera access in your browser settings and try again.");
        } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
          setCameraError("No camera was found on this device.");
        } else if (error.name === "NotReadableError") {
          setCameraError("The camera is already in use or could not be started.");
        } else {
          setCameraError(error.message || "Unable to start the camera.");
        }
      }
    } finally {
      if (sessionId === cameraRequestRef.current) {
        cameraStartingRef.current = false;
        setCameraStarting(false);
      }
    }
  }, [getFaceDetector, startDetectionLoop]);

  const switchCamera = useCallback(() => {
    const nextFacingMode = cameraFacingModeRef.current === "user"
      ? "environment"
      : "user";
    const shouldRestart = Boolean(streamRef.current || cameraStartingRef.current);

    cameraFacingModeRef.current = nextFacingMode;
    setCameraFacingMode(nextFacingMode);

    if (shouldRestart) {
      stopCamera();
      void startCamera();
    }
  }, [startCamera, stopCamera]);

  useEffect(() => {
    void startCamera();
    return stopCamera;
  }, [startCamera, stopCamera]);

  const stageAspectRatio = videoAspectRatio;

  return (
    <main className="container">
      <header className="page-header">
        <div className="brand-lockup">
          <svg className="brand-mark" viewBox="0 0 40 40" aria-hidden="true">
            <rect x="1" y="1" width="38" height="38" rx="11" fill="#245b43" />
            <path d="M10 16.5c1.4-1.8 3.8-1.8 5.2 0m9.6 0c1.4-1.8 3.8-1.8 5.2 0" fill="none" stroke="#f3f5ef" strokeLinecap="round" strokeWidth="1.8" />
            <path d="M13 23.5c2 3.1 4.3 4.6 7 4.6s5-1.5 7-4.6" fill="none" stroke="#c7dfa9" strokeLinecap="round" strokeWidth="1.8" />
            <circle cx="30.5" cy="9.5" r="2.2" fill="#d7a786" />
          </svg>
          <div className="product-lockup">
            <p className="eyebrow">REAL-TIME EXPRESSION</p>
            <h1>Emotional Sense</h1>
            <p className="product-subtitle">Expression insights, live</p>
          </div>
        </div>
        <div
          className={`system-status ${cameraActive ? "is-live" : ""}`}
          aria-label={cameraActive ? "Camera live" : "Camera off"}
        >
          <span className="status-indicator" />
          <span>{cameraActive ? cameraStatus : cameraStatus}</span>
        </div>
      </header>

      <div className="workspace">
        <section className="panel camera-panel" aria-labelledby="camera-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">CAMERA FEED</p>
              <h2 id="camera-title">Camera</h2>
            </div>
            <span className={`live-badge ${cameraActive ? "is-live" : ""}`}>
              <span className="status-indicator" />
              {cameraActive ? "LIVE" : "OFFLINE"}
            </span>
          </div>

          <div className="camera-stage" style={{ aspectRatio: stageAspectRatio }}>
            <video
              ref={videoRef}
              className={`camera-video ${cameraActive ? "is-visible" : ""}`}
              autoPlay
              muted
              playsInline
              onLoadedMetadata={(event) => {
                const { videoWidth, videoHeight } = event.currentTarget;
                if (videoWidth && videoHeight) {
                  setVideoAspectRatio(`${videoWidth} / ${videoHeight}`);
                }
              }}
            />
            <canvas ref={overlayRef} className="face-overlay" aria-hidden="true" />
            {!cameraActive && (
              <div className="camera-placeholder">
                <span className="camera-glyph" aria-hidden="true">CAM</span>
                <strong>{cameraStarting ? "Connecting to camera" : "Camera off"}</strong>
                <span>Allow camera access to begin live detection.</span>
              </div>
            )}
          </div>

          <div className="camera-controls">
            <p className="camera-hint">
              {cameraActive
                ? processing
                  ? "Updating emotion results"
                  : detectorReady
                    ? "Face detection is running"
                    : "Preparing face detection"
                : "Your camera stays on this device; face crops are sent for emotion analysis."}
            </p>
            <div className="button-group">
              <button
                className="button-primary"
                type="button"
                onClick={startCamera}
                disabled={cameraActive || cameraStarting}
              >
                {cameraStarting ? "Starting..." : "Start camera"}
              </button>
              <button
                className="button-secondary"
                type="button"
                onClick={stopCamera}
                disabled={!cameraActive && !cameraStarting}
              >
                Stop camera
              </button>
              <button
                className="button-switch"
                type="button"
                onClick={switchCamera}
                disabled={cameraStarting}
                aria-label={`Switch to ${cameraFacingMode === "user" ? "rear" : "front"} camera`}
                title={`Switch to ${cameraFacingMode === "user" ? "rear" : "front"} camera`}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7 7h12l-2.5-2.5M17 17H5l2.5 2.5" />
                  <path d="M19 7v4m-14 6v-4" />
                </svg>
              </button>
            </div>
          </div>

          {cameraError && <p className="inline-error" role="alert">{cameraError}</p>}
        </section>

        <aside className="panel results-panel" aria-labelledby="results-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">LIVE READOUT</p>
              <h2 id="results-title">Live emotion</h2>
            </div>
            <div className="face-count" aria-label={`${faces.length} faces detected`}>
              <strong>{faces.length}</strong>
              <span>{faces.length === 1 ? "FACE" : "FACES"}</span>
            </div>
          </div>

          {predictionError && (
            <p className="inline-error" role="status">
              {predictionError} The camera will keep running and retry with a newer frame.
            </p>
          )}

          {faces.length > 0 ? (
            <div
              className={`face-results ${faces.length === 1 ? "has-single-face" : "has-multiple-faces"}`}
              aria-live="polite"
            >
              {faces.map((face, index) => (
                <article className="face-result" key={face.id}>
                  <div className="face-result-heading">
                    <span className="face-index">{String(index + 1).padStart(2, "0")}</span>
                    <span>Face {index + 1}</span>
                    <span className="face-state">
                      {face.emotion ? "UPDATED" : "ANALYZING"}
                    </span>
                  </div>
                  <div className="emotion-value">
                    {face.emotion || "Detecting..."}
                  </div>
                  <div className="confidence-row">
                    <span>Confidence</span>
                    <strong>
                      {face.confidence == null
                        ? "--"
                        : `${(face.confidence * 100).toFixed(1)}%`}
                    </strong>
                  </div>
                  {face.confidence != null && (
                    <div className="confidence-track" aria-hidden="true">
                      <span style={{ width: `${face.confidence * 100}%` }} />
                    </div>
                  )}
                </article>
              ))}
            </div>
          ) : cameraActive && detectorReady ? (
            <div className="empty-state">
              <strong>No face detected</strong>
              <span>Move into view to see a live emotion result.</span>
            </div>
          ) : (
            <div className="empty-state">
              <strong>{cameraActive ? "Preparing detector" : "Waiting for camera"}</strong>
              <span>Live results will appear here.</span>
            </div>
          )}

          <div className="results-footer">
            <span className={`status-indicator ${cameraActive ? "is-live" : ""}`} />
            <span>{processing ? "Classifying current frame" : "Newest frame only"}</span>
          </div>
        </aside>
      </div>
    </main>
  );
};

export default App;

