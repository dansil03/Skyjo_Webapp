FROM python:3.11-slim

WORKDIR /app

# (optioneel) sneller/cleaner python runtime
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# deps
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# app code
COPY backend /app/backend

EXPOSE 8001

# Pas module:app aan naar jouw entrypoint
# Bijvoorbeeld: backend/main.py heeft app = FastAPI()
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8001"]
