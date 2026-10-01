# Facial Emotion Recognition

React/Vite frontend and FastAPI backend for webcam-based facial emotion recognition. The backend loads the existing Hugging Face model once during application startup and uses the server user's local Hugging Face cache.

## Repository layout

- `frontend/` contains the Vite app and Vercel build.
- `backend/` contains the FastAPI service and EC2 startup configuration.
- Model weights are downloaded from Hugging Face at first startup and are not stored in this repository.

## Frontend on Vercel

Create a Vercel project for this repository and set its **Root Directory** to `frontend`. Use `npm run build` as the build command and `dist` as the output directory. Set this project environment variable before deploying:

- `VITE_API_BASE_URL`: the public HTTPS origin of the backend, without a trailing slash.

The ignored repository-root `.env` is used for local development by both the frontend and backend. Copy the committed `.env.example` to `.env` and replace the example origins. Set `VITE_API_BASE_URL` there; the backend CORS configuration must include the deployed Vercel origin. Vercel deployments should set `VITE_API_BASE_URL` in the Vercel project settings because `.env` is intentionally not committed.

## Backend on AWS EC2

Use an EC2 instance with Python 3.11 or 3.12 and enough memory for the Transformers model. Clone the repository into `~/facial-recognition`, then install the backend in an isolated environment:

```bash
cd ~/facial-recognition/backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
touch ../.env
chmod 600 ../.env
```

Set these values in the repository-root `.env`:

```dotenv
MODEL_ID=dima806/facial_emotions_image_detection
CORS_ORIGINS=https://your-vercel-domain.example
HOST=0.0.0.0
PORT=8000
LOG_LEVEL=info
```

`CORS_ORIGINS` accepts comma-separated frontend origins. The service uses Hugging Face's standard cache under the service user's home directory by default; set `HF_HOME` only if a different writable cache location is needed. The first startup downloads the model; later starts reuse that cache.

For persistent startup with systemd, install `backend/facial-emotion-api@.service.example` as `/etc/systemd/system/facial-emotion-api@.service`, then enable it for the EC2 account (for example, `sudo systemctl enable --now facial-emotion-api@ec2-user`). The template assumes the clone path above; change its repository folder if yours differs. Restrict `.env` permissions to the service account. Configure TLS at a reverse proxy and allow inbound API traffic only as required by your deployment.

The service starts as a single Uvicorn process so the model is loaded once per instance. It exposes `GET /api/health` for health checks and preserves `POST /predict` for emotion predictions.

To run it manually from `backend/`:

```bash
.venv/bin/python run.py
```

## Local frontend checks

```bash
cd frontend
npm ci
npm run build
```
