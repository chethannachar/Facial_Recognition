import React, { useRef, useState } from 'react';
import Webcam from 'react-webcam';
import axios from 'axios';
import './App.css';

const App = () => {
  const webcamRef = useRef(null);
  const resultRef = useRef(null);
  const [image, setImage] = useState(null);
  const [emotion, setEmotion] = useState(null);
  const [confidence, setConfidence] = useState(null);
  const [loading, setLoading] = useState(false);

  const captureImage = () => {
    const screenshot = webcamRef.current.getScreenshot();
    const base64Data = screenshot.split(',')[1];
    setImage(base64Data);
    setEmotion(null);
    setConfidence(null);
  };

  const detectEmotion = async () => {
    if (!image) return;
    setLoading(true);
    try {
      const response = await axios.post('http://localhost:5000/predict', {
        image: image,
      });
      setEmotion(response.data.emotion);
      setConfidence(response.data.confidence);
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (error) {
      console.error('Error:', error.response?.data || error.message);
    } finally {
      setLoading(false);
    }
  };

  const clearImage = () => {
    setImage(null);
    setEmotion(null);
    setConfidence(null);
  };

  return (
    <div className="container">
      <h1>Facial Emotion Recognition</h1>

      <div className={`visuals ${image ? 'split' : 'center'}`}>
        <div className="webcam-box">
          <h3>Live Visuals</h3>
          <Webcam
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            videoConstraints={{ width: 640, height: 480, facingMode: 'user' }}
          />
        </div>

        {image && (
          <div className="captured-box">
            <h3>Captured Image</h3>
            <img src={`data:image/jpeg;base64,${image}`} alt="Captured" />
          </div>
        )}
      </div>

      <div className="button-group">
        {!image && <button onClick={captureImage}>📸 Capture Image</button>}
        {image && <button onClick={detectEmotion}>🧠 Detect Emotion</button>}
        {image && <button onClick={clearImage}>🗑️ Clear</button>}
      </div>

      <div ref={resultRef}>
        {loading && <div className="result">Analyzing emotion...</div>}
        {emotion && (
          <div className="result">
            <h2>Detected Emotion: {emotion.toUpperCase()}</h2>

            
          </div>
        )}
      </div>

      
    </div>
  );
};

export default App;
