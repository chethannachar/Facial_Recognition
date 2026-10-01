
import base64
import io
import logging
import os
import threading
from contextlib import asynccontextmanager
from pathlib import Path

import torch
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image
from pydantic import BaseModel, Field
from transformers import AutoImageProcessor, AutoModelForImageClassification

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

logger = logging.getLogger("emotion_api")
MODEL_ID = os.getenv("MODEL_ID") or "dima806/facial_emotions_image_detection"
inference_lock = threading.Lock()
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "").split(",")
    if origin.strip()
]


class FaceBatch(BaseModel):
    images: list[str] = Field(min_length=1, max_length=4)


def classify_image(encoded_image, processor, model):
    image_data = base64.b64decode(encoded_image, validate=True)
    image = Image.open(io.BytesIO(image_data)).convert("RGB")
    image = image.resize((224, 224))
    inputs = processor(images=image, return_tensors="pt")

    with torch.no_grad():
        logits = model(**inputs).logits

    predicted_class_idx = logits.argmax(-1).item()
    probabilities = torch.nn.functional.softmax(logits, dim=1)

    return {
        "emotion": model.config.id2label[predicted_class_idx],
        "confidence": round(probabilities[0, predicted_class_idx].item(), 3),
    }


@asynccontextmanager
async def lifespan(application: FastAPI):
    torch.set_num_threads(1)
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
        processor = request.app.state.processor
        model = request.app.state.model
        with inference_lock:
            return classify_image(data["image"], processor, model)
    except Exception as error:
        logger.exception("Prediction failed")
        return JSONResponse(
            status_code=500,
            content={"error": str(error)},
        )


@app.post("/predict/faces")
def predict_faces(payload: FaceBatch, request: Request):
    processor = request.app.state.processor
    model = request.app.state.model

    try:
        with inference_lock:
            predictions = [
                classify_image(encoded_image, processor, model)
                for encoded_image in payload.images
            ]
        return {"predictions": predictions}
    except Exception as error:
        logger.exception("Face batch prediction failed")
        return JSONResponse(
            status_code=400,
            content={"error": str(error)},
        )