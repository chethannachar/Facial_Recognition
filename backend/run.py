import os

import uvicorn


if __name__ == "__main__":
    uvicorn.run(
        "app:app",
        host=os.getenv("HOST") or "0.0.0.0",
        port=int(os.getenv("PORT") or "8000"),
        log_level=(os.getenv("LOG_LEVEL") or "info").lower(),
        workers=1,
    )
