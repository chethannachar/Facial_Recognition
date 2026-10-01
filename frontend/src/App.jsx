
import React, { useRef, useState } from "react";
import Webcam from "react-webcam";
import "./App.css";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

const App = () => {
  const webcamRef = useRef(null);
  const resultRef = useRef(null);

  const [image, setImage] = useState(null);
  const [emotion, setEmotion] = useState(null);
  const [confidence, setConfidence] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const captureImage = () => {
    const screenshot = webcamRef.current?.getScreenshot();

    if (!screenshot) {
      setError("Unable to capture image from webcam.");
      return;
    }

    const base64Data = screenshot.split(",")[1];

    setImage(base64Data);
    setEmotion(null);
    setConfidence(null);
    setError(null);

  };

  const detectEmotion = async () => {
    if (!image) {
      return;
    }

    setLoading(true);
    setEmotion(null);
    setConfidence(null);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/predict`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ image }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data?.error || `Backend returned ${response.status}`);
        return;
      }

      setEmotion(data.emotion);
      setConfidence(data.confidence);

      setTimeout(() => {
        resultRef.current?.scrollIntoView({
          behavior: "smooth",
        });
      }, 100);

    } catch {
      setError("Cannot connect to the backend. Check the API URL and try again.");
    } finally {
      setLoading(false);
    }
  };

  const clearImage = () => {
    setImage(null);
    setEmotion(null);
    setConfidence(null);
    setError(null);
  };

  return (
    <div className="container">

      <h1>Facial Emotion Recognition</h1>

      <div
        className={`visuals ${
          image ? "split" : "center"
        }`}
      >

        <div className="webcam-box">

          <h3>Live Visuals</h3>

          <Webcam
            ref={webcamRef}
            audio={false}
            screenshotFormat="image/jpeg"
            videoConstraints={{
              width: 640,
              height: 480,
              facingMode: "user",
            }}
          />

        </div>

        {image && (
          <div className="captured-box">

            <h3>Captured Image</h3>

            <img
              src={`data:image/jpeg;base64,${image}`}
              alt="Captured"
            />

          </div>
        )}

      </div>

      <div className="button-group">

        {!image && (
          <button onClick={captureImage}>
            📸 Capture Image
          </button>
        )}

        {image && !loading && (
          <button onClick={detectEmotion}>
            🧠 Detect Emotion
          </button>
        )}

        {image && (
          <button onClick={clearImage}>
            🗑️ Clear
          </button>
        )}

      </div>

      <div ref={resultRef}>

        {loading && (
          <div className="result">
            Analyzing emotion...
          </div>
        )}

        {error && (
          <div className="result">
            <h3>Error</h3>
            <p>{error}</p>
          </div>
        )}

        {emotion && !loading && (
          <div className="result">

            <h2>
              Detected Emotion:{" "}
              {emotion.toUpperCase()}
            </h2>

            <p>
              Confidence:{" "}
              {(confidence * 100).toFixed(1)}%
            </p>

          </div>
        )}

      </div>

    </div>
  );
};

export default App;

