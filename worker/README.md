# AI Worker (Python)

The heavy-lifting service responsible for document processing and vectorization.

## 🛠 Tech Stack

- **Runtime**: Python 3.11
- **Queue**: Celery (Redis Broker)
- **ML**: SentenceTransformers (Local Embeddings), Torch.
- **DB**: Motor (Async MongoDB), Qdrant Client.

## 🧠 Core Logic (`worker/core`)

The `core` directory contains shared business logic:

- `ingestion/`: PDF/PST Parsers, Chunking, Embedding generation.
- `services/`: Email notifications.

## ⚙️ Concurrency

Controlled via `docker-compose.yml` command:
`--concurrency=X` (Default: 2). Increase this based on available RAM to handle more simultaneous uploads/searches.
