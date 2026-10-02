import { useCallback, useEffect, useRef, useState } from "react";
import { cropFace } from "../utils/faces.js";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, "");
if (!API_BASE_URL) {
  throw new Error("VITE_API_BASE_URL is required and must point to the backend API.");
}

const DETECTION_INTERVAL_MS = 250;
const MAX_FACES_PER_BATCH = 4;

export const useEmotionPrediction = ({ sessionRef, cameraSessionId, onPredictions }) => {
  const requestInFlightRef = useRef(false);
  const lastRequestAtRef = useRef(-DETECTION_INTERVAL_MS);
  const retryAfterRef = useRef(0);
  const retryDelayRef = useRef(1000);
  const nextBatchStartRef = useRef(0);
  const predictionAbortRef = useRef(null);
  const requestVersionRef = useRef(0);
  const onPredictionsRef = useRef(onPredictions);

  const [processing, setProcessing] = useState(false);
  const [predictionError, setPredictionError] = useState(null);

  onPredictionsRef.current = onPredictions;

  const cancelPrediction = useCallback(() => {
    requestVersionRef.current += 1;
    predictionAbortRef.current?.abort();
    predictionAbortRef.current = null;
    requestInFlightRef.current = false;
    lastRequestAtRef.current = -DETECTION_INTERVAL_MS;
    retryAfterRef.current = 0;
    retryDelayRef.current = 1000;
    nextBatchStartRef.current = 0;
    setProcessing(false);
    setPredictionError(null);
  }, []);

  const predictFaces = useCallback((currentFaces, video, sessionId, force = false) => {
    const now = performance.now();
    if (
      !currentFaces.length ||
      !video?.videoWidth ||
      sessionId !== sessionRef.current ||
      requestInFlightRef.current ||
      now < retryAfterRef.current ||
      (!force && now - lastRequestAtRef.current < DETECTION_INTERVAL_MS)
    ) {
      return;
    }

    const batchStart = nextBatchStartRef.current % currentFaces.length;
    const selectedFaces = Array.from(
      { length: Math.min(MAX_FACES_PER_BATCH, currentFaces.length) },
      (_, index) => currentFaces[(batchStart + index) % currentFaces.length]
    );
    nextBatchStartRef.current = (batchStart + selectedFaces.length) % currentFaces.length;

    let images;
    try {
      images = selectedFaces.map((face) => cropFace(video, face.box));
    } catch (error) {
      setPredictionError(error.message || "Unable to prepare a face image.");
      return;
    }

    const faceIds = selectedFaces.map((face) => face.id);
    const requestVersion = requestVersionRef.current;
    const controller = new AbortController();
    predictionAbortRef.current = controller;
    requestInFlightRef.current = true;
    lastRequestAtRef.current = now;
    setProcessing(true);

    fetch(`${API_BASE_URL}/predict/faces`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || `Backend returned ${response.status}`);
        }
        if (!Array.isArray(data.predictions) || data.predictions.length !== faceIds.length) {
          throw new Error("The backend returned an invalid prediction response.");
        }
        if (
          requestVersion !== requestVersionRef.current ||
          sessionId !== sessionRef.current
        ) {
          return;
        }

        const updates = new Map(
          faceIds.map((id, index) => [id, data.predictions[index]])
        );
        onPredictionsRef.current?.(updates);
        setPredictionError(null);
        retryAfterRef.current = 0;
        retryDelayRef.current = 1000;
      })
      .catch((error) => {
        if (
          requestVersion === requestVersionRef.current &&
          sessionId === sessionRef.current &&
          error.name !== "AbortError"
        ) {
          setPredictionError(error.message || "Emotion prediction failed.");
          retryAfterRef.current = performance.now() + retryDelayRef.current;
          retryDelayRef.current = Math.min(retryDelayRef.current * 2, 10000);
        }
      })
      .finally(() => {
        if (requestVersion === requestVersionRef.current) {
          requestInFlightRef.current = false;
          predictionAbortRef.current = null;
          setProcessing(false);
        }
      });
  }, [sessionRef]);

  const retryPrediction = useCallback((faces, video) => {
    retryAfterRef.current = 0;
    lastRequestAtRef.current = -DETECTION_INTERVAL_MS;
    predictFaces(faces, video, sessionRef.current, true);
  }, [predictFaces, sessionRef]);

  useEffect(() => {
    cancelPrediction();
  }, [cameraSessionId, cancelPrediction]);

  useEffect(() => () => {
    predictionAbortRef.current?.abort();
  }, []);

  return {
    processing,
    predictionError,
    predictFaces,
    retryPrediction,
    cancelPrediction,
  };
};