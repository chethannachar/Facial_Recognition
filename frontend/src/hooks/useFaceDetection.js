import { useCallback, useEffect, useRef, useState } from "react";
import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";
import { clearFaceOverlay, drawFaceBoxes, trackDetections } from "../utils/faces.js";

const DETECTION_INTERVAL_MS = 250;
const FACE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";
const VISION_WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";

export const useFaceDetection = ({
  videoRef,
  overlayRef,
  cameraActive,
  cameraSessionId,
  sessionRef,
  isMirrored,
  onFrame,
}) => {
  const detectorRef = useRef(null);
  const detectorPromiseRef = useRef(null);
  const loopRef = useRef(null);
  const detectionBusyRef = useRef(false);
  const nextFaceIdRef = useRef(1);
  const trackedFacesRef = useRef([]);
  const onFrameRef = useRef(onFrame);

  const [faces, setFaces] = useState([]);
  const [detectorReady, setDetectorReady] = useState(false);
  const [detectionError, setDetectionError] = useState(null);

  onFrameRef.current = onFrame;

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

  const resetFaces = useCallback(() => {
    trackedFacesRef.current = [];
    nextFaceIdRef.current = 1;
    detectionBusyRef.current = false;
    setFaces([]);
    setDetectorReady(false);
    setDetectionError(null);
    clearFaceOverlay(overlayRef.current);
  }, [overlayRef]);

  const applyPredictions = useCallback((updates) => {
    const updatedFaces = trackedFacesRef.current.map((face) => {
      const prediction = updates.get(face.id);
      return prediction ? { ...face, ...prediction } : face;
    });
    trackedFacesRef.current = updatedFaces;
    setFaces(updatedFaces);
  }, []);

  useEffect(() => {
    if (!cameraActive) {
      resetFaces();
      return undefined;
    }

    const sessionId = cameraSessionId;
    const overlay = overlayRef.current;
    let cancelled = false;

    const detectFrame = () => {
      const video = videoRef.current;
      const detector = detectorRef.current;
      if (
        cancelled ||
        sessionId !== sessionRef.current ||
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
        const tracked = trackDetections(
          boxes,
          trackedFacesRef.current,
          nextFaceIdRef.current,
          video.videoWidth,
          video.videoHeight
        );

        trackedFacesRef.current = tracked.faces;
        nextFaceIdRef.current = tracked.nextFaceId;
        setFaces(tracked.faces);
        drawFaceBoxes(overlay, video, tracked.faces, isMirrored);
        onFrameRef.current?.(tracked.faces, video, sessionId);
      } catch (error) {
        setDetectionError(error.message || "Face detection could not continue.");
      } finally {
        detectionBusyRef.current = false;
      }
    };

    const startLoop = async () => {
      try {
        await getFaceDetector();
        if (cancelled || sessionId !== sessionRef.current) {
          return;
        }
        setDetectorReady(true);
        detectFrame();
        loopRef.current = window.setInterval(detectFrame, DETECTION_INTERVAL_MS);
      } catch (error) {
        if (!cancelled && sessionId === sessionRef.current) {
          setDetectionError(error.message || "Face detection is unavailable.");
        }
      }
    };

    void startLoop();

    return () => {
      cancelled = true;
      if (loopRef.current) {
        window.clearInterval(loopRef.current);
        loopRef.current = null;
      }
      detectionBusyRef.current = false;
      clearFaceOverlay(overlay);
    };
  }, [
    cameraActive,
    cameraSessionId,
    getFaceDetector,
    isMirrored,
    overlayRef,
    resetFaces,
    sessionRef,
    videoRef,
  ]);

  return {
    faces,
    detectorReady,
    detectionError,
    resetFaces,
    applyPredictions,
  };
};