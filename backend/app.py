
import base64
import io
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

import torch
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image
from transformers import AutoImageProcessor, AutoModelForImageClassification

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

logger = logging.getLogger("emotion_api")
MODEL_ID = os.getenv("MODEL_ID") or "dima806/facial_emotions_image_detection"
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "").split(",")
    if origin.strip()
]


@asynccontextmanager
async def lifespan(application: FastAPI):
    logger.info("Loading emotion model %s", MODEL_ID)
    application.state.processor = AutoImageProcessor.from_pretrained(MODEL_ID)
    application.state.model = AutoModelForImageClassification.from_pretrained(MODEL_ID)
    application.state.model.eval()
    logger.info("Emotion model loaded")
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/")
def home():
    return {"message": "Facial Emotion Recognition API is running"}


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/predict")
def predict(data: dict, request: Request):
    if not data:
        return JSONResponse(
            status_code=400,
            content={"error": "No JSON data provided"},
        )

    if "image" not in data:
        return JSONResponse(
            status_code=400,
            content={"error": "No image provided"},
        )

    try:
        image_data = base64.b64decode(data["image"])
        image = Image.open(io.BytesIO(image_data)).convert("RGB")
        image = image.resize((224, 224))

        processor = request.app.state.processor
        model = request.app.state.model
        inputs = processor(images=image, return_tensors="pt")

        with torch.no_grad():
            outputs = model(**inputs)

        logits = outputs.logits
        predicted_class_idx = logits.argmax(-1).item()
        predicted_class = model.config.id2label[predicted_class_idx]
        probabilities = torch.nn.functional.softmax(logits, dim=1)
        confidence = probabilities[0, predicted_class_idx].item()

        return {
            "emotion": predicted_class,
            "confidence": round(confidence, 3),
        }
    except Exception as error:
        logger.exception("Prediction failed")
        return JSONResponse(
            status_code=500,
            content={"error": str(error)},
        )