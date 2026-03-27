# Quick Start Local

Guía corta para ejecutar el proyecto en una sola máquina con Docker Compose, sin Swarm.

## Requisitos

- Docker Engine
- Docker Compose v2
- Al menos 8 GB de RAM si vas a cargar modelos y documentos reales

## Paso 1. Crear configuración

```bash
cp .env.example .env
```

Valores que conviene revisar en local:

- `SECRET_KEY`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `LOCAL_UPLOADS_PATH`
- `INGESTION_CONCURRENCY`

Por defecto, las uploads locales se guardan en:

```dotenv
LOCAL_UPLOADS_PATH=./secure/uploads
DOCS_DIR=/app/uploads
```

## Paso 2. Levantar servicios

```bash
docker compose -f docker-compose.yml.local up --build -d
```

## Paso 3. Ver logs

```bash
docker compose -f docker-compose.yml.local logs -f
```

## Servicios expuestos

- Frontend: `http://localhost`
- API: `http://localhost:8000`
- API health: `http://localhost:8000/api/v1/health`
- Qdrant dashboard: `http://localhost:6333/dashboard`
- MongoDB: `localhost:27017`
- Redis: `localhost:6379`

## Parar y limpiar

Parada normal:

```bash
docker compose -f docker-compose.yml.local down
```

Parada y borrado de volúmenes:

```bash
docker compose -f docker-compose.yml.local down -v
```

## Notas

- `worker-ingestion` ejecuta Celery Beat, así que en local no hace falta un scheduler separado.
- El primer build del worker puede tardar bastante por instalación y descarga de modelos.
- Si cambias variables sensibles o reseteas credenciales de servicios, lo más limpio suele ser bajar el stack y recrear volúmenes.
