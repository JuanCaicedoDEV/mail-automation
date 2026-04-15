FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip install --no-cache-dir \
    fastapi \
    uvicorn[standard] \
    httpx \
    python-multipart \
    asyncpg \
    pydantic-settings \
    sqlalchemy \
    google-genai \
    supabase \
    python-magic \
    Pillow \
    google-auth-oauthlib \
    google-auth-httplib2 \
    google-api-python-client

# Copy application code
COPY . /app

# Expose port
EXPOSE 8000

# Create a non-root user with an explicit UID and adds permission to access the /app folder
RUN adduser -u 5678 --disabled-password --gecos "" appuser && chown -R appuser /app
USER appuser

# Command to run the application
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
