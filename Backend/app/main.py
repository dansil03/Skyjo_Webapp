from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .ws import router as ws_router  # Importing WebSocket router

app = FastAPI()  # Creating an instance of the FastAPI application

# Middleware configuration for CORS (Cross-Origin Resource Sharing)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development; tighten later for production
    allow_credentials=True,  # Allow credentials (cookies, authorization headers, etc.)
    allow_methods=["*"],  # Allow all HTTP methods
    allow_headers=["*"],  # Allow all headers
)

app.include_router(ws_router)  # Include the WebSocket router in the application

@app.get("/health")  # Health check endpoint
def health():
    return {"ok": True}  # Returns a simple JSON response indicating the service is running
