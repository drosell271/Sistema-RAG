FROM python:3.11-slim

# Configuration
ENV PYTHONDONTWRITEBYTECODE=1 \
	PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
	build-essential \
	curl \
	libpff-dev \
	&& rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip setuptools wheel && \
	pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create cache directory for models and set permissions
RUN mkdir -p /app/cache && chmod -R 777 /app/cache
ENV HF_HOME=/app/cache
ENV FASTEMBED_CACHE_PATH=/app/cache

# Pre-download models to bake them into the image
# This prevents runtime download failures and speeds up startup
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('intfloat/multilingual-e5-large', cache_folder='/app/cache')"
RUN python -c "from fastembed import SparseTextEmbedding; SparseTextEmbedding(model_name='prithivida/Splade_PP_en_v1', cache_dir='/app/cache')"
RUN python -c "from sentence_transformers import CrossEncoder; CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2', cache_dir='/app/cache')"

# Default concurrency
ENV INGESTION_CONCURRENCY=2

# Worker start command - using shell to expand environment variable
CMD ["sh", "-c", "celery -A celery_app worker --loglevel=info --concurrency=${INGESTION_CONCURRENCY:-2}"]
