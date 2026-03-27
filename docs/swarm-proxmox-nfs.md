# Despliegue en Proxmox + Docker Swarm + NFS

Esta guía está orientada al estado actual del repositorio: un archivo Compose para Swarm, workers fijados a nodos concretos mediante variables de entorno y una carpeta compartida de uploads que debe ser visible desde backend y workers.

## Objetivo

Desplegar el stack en tres VMs de Proxmox:

- `swarm-manager`: nodo manager e infraestructura
- `swarm-worker-ingestion`: nodo para `worker-ingestion`
- `swarm-worker-search`: nodo para `worker-search`

Y usar una exportación NFS compartida para las uploads:

- misma exportación NFS visible en los tres nodos
- mismo punto de montaje en host en los tres nodos
- mismo path dentro de los contenedores: `/app/uploads`

## Por qué el NFS es obligatorio aquí

El flujo real del código es este:

1. El backend recibe el fichero.
2. Lo guarda en `DOCS_DIR`, que por defecto dentro del contenedor es `/app/uploads`.
3. El backend envía al worker una tarea Celery con la ruta absoluta del fichero.
4. El worker intenta abrir ese fichero usando esa misma ruta dentro de su contenedor.

Si backend y worker están en nodos distintos y no comparten almacenamiento, la tarea fallará porque el fichero no existirá en el nodo del worker.

## Requisitos previos

- Docker Engine 24+ en las tres VMs.
- Swarm inicializado.
- Conectividad entre nodos para red overlay.
- Conectividad desde los tres nodos hacia el servidor NFS.
- El repositorio clonado en los nodos donde vayan a construirse imágenes.
- SSH desde el manager a los workers si vas a usar [`deploy.sh`](../deploy.sh).
- Permisos de escritura correctos sobre la exportación NFS.
  Si la exportación aplica `root_squash`, las uploads pueden fallar porque los contenedores escriben como root en el estado actual.

## Paso 1. Montar el NFS en los tres nodos

Ejemplo para Debian/Ubuntu. Ajusta IP/exportación a tu entorno:

```bash
sudo apt-get update
sudo apt-get install -y nfs-common
sudo mkdir -p /srv/rag/uploads
echo '<NFS_SERVER_IP>:/exports/rag-uploads /srv/rag/uploads nfs4 rw,hard,noatime,_netdev 0 0' | sudo tee -a /etc/fstab
sudo mount -a
sudo touch /srv/rag/uploads/.nfs-test
ls -la /srv/rag/uploads
```

Hazlo en `swarm-manager`, `swarm-worker-ingestion` y `swarm-worker-search`, siempre con el mismo punto de montaje:

- recomendado: `/srv/rag/uploads`

Comprueba que un fichero creado desde un nodo aparece en los demás.

## Paso 2. Inicializar Swarm y etiquetar nodos

En el manager:

```bash
docker swarm init --advertise-addr <IP_MANAGER>
docker swarm join-token worker
```

Une los dos workers con el comando que te devuelva `docker swarm join-token worker`.

Después, etiqueta el nodo de infraestructura:

```bash
docker node update --label-add role=infra <SWARM_MANAGER_NODE>
docker node ls
```

Importante:

- `worker-ingestion` usa `INGESTION_NODE_HOSTNAME`
- `worker-search` usa `SEARCH_NODE_HOSTNAME`

Si tus hostnames reales son distintos, cambia esas variables en `.env` antes de desplegar.

## Paso 3. Preparar `.env`

Copia la plantilla y ajusta credenciales:

```bash
cp .env.example .env
```

Valores mínimos que conviene revisar para este escenario:

```dotenv
NODE_ENV=production
PORT=8000
SECRET_KEY=cambia-esto
ALLOWED_ORIGINS=https://rag.example.com
FRONTEND_URL=https://rag.example.com

MONGO_INITDB_ROOT_USERNAME=root
MONGO_INITDB_ROOT_PASSWORD=cambia-esto
MONGO_DB_NAME=rag_db

REDIS_PASSWORD=cambia-esto

QDRANT_API_KEY=cambia-esto
QDRANT_COLLECTION=documents

UPLOADS_HOST_PATH=/srv/rag/uploads
DOCS_DIR=/app/uploads
INGESTION_NODE_HOSTNAME=swarm-worker-ingestion
SEARCH_NODE_HOSTNAME=swarm-worker-search

INGESTION_CONCURRENCY=4
IMAP_POLL_INTERVAL=300
```

Relación entre las dos rutas:

- `UPLOADS_HOST_PATH`:
  ruta del host donde está montado el NFS.
- `DOCS_DIR`:
  ruta dentro de los contenedores.

En este repositorio, el bind mount de Swarm usa `UPLOADS_HOST_PATH:/app/uploads`.

## Paso 4. Revisar qué despliega cada nodo

Con el Compose actual:

- `frontend`, `backend`, `mongo`, `redis` y `qdrant` van al nodo con label `role=infra`
- `worker-ingestion` va al hostname definido en `INGESTION_NODE_HOSTNAME`
- `worker-search` va al hostname definido en `SEARCH_NODE_HOSTNAME`

Esto implica dos cosas:

- las imágenes deben existir en esos nodos antes del `docker stack deploy`
- el NFS para uploads debe estar montado al menos en manager y workers

## Paso 5. Desplegar

### Opción A. Usar `deploy.sh`

Antes de usarlo, define si hace falta:

```bash
export REPO_URL=git@github.com:tu-org/tu-repo.git
export PROJECT_DIR="$HOME/sistema-rag"
export REMOTE_PROJECT_DIR=~/sistema-rag
export COORDINATOR=swarm-manager
export WORKERS="swarm-worker-ingestion swarm-worker-search"
```

El script sigue siendo útil, pero ya no debes asumir que los nombres reales del entorno coinciden con los ejemplos del repo.

Comandos:

```bash
chmod +x deploy.sh
./deploy.sh setup
```

Notas:

- el script construye `rag_worker:latest` en cada worker
- el script construye `rag_backend:latest` y `rag_frontend:latest` en el nodo manager
- después ejecuta `docker stack deploy -c docker-compose.yml rag`

### Opción B. Despliegue manual

Construye imágenes en el nodo donde van a ejecutarse.

En el nodo de ingesta:

```bash
docker build -t rag_worker:latest ./worker
```

En el nodo de búsqueda:

```bash
docker build -t rag_worker:latest ./worker
```

En el nodo manager:

```bash
docker build -t rag_backend:latest ./backend
docker build -t rag_frontend:latest ./frontend
set -a
source .env
set +a
docker stack deploy -c docker-compose.yml rag
```

## Paso 6. Validar el despliegue

Comprobaciones básicas:

```bash
docker stack services rag
docker service ps rag_backend
docker service ps rag_worker-ingestion
docker service ps rag_worker-search
docker service logs -f rag_backend
docker service logs -f rag_worker-ingestion
```

Validaciones funcionales:

1. Abre la aplicación web.
2. Inicia sesión con el usuario admin.
3. Sube un PDF pequeño.
4. Verifica que el fichero aparece en `/srv/rag/uploads`.
5. Verifica que el worker de ingesta procesa el documento.
6. Ejecuta una búsqueda para comprobar Qdrant y el worker de search.

## Actualizaciones

Si usas el script:

```bash
./deploy.sh update
```

Si lo haces manualmente:

1. actualiza código en cada nodo
2. reconstruye las imágenes afectadas en los nodos correspondientes
3. vuelve a lanzar `docker stack deploy -c docker-compose.yml rag`

## Limitaciones actuales del repositorio

- `docker stack deploy` ignora `depends_on`, así que puede haber reinicios iniciales hasta que Mongo/Redis/Qdrant estén disponibles.
- El flujo está pensado para una sola réplica de `worker-ingestion` porque ahí también corre Celery Beat.
- No hay pipeline de registro de imágenes; el despliegue depende de imágenes locales por nodo.
- MongoDB y Qdrant quedan anclados al nodo `infra` y con volúmenes locales.
- El almacenamiento compartido está contemplado para uploads, no para convertir Mongo/Qdrant en servicios distribuidos.
- El archivo `docker-compose.yml` usa `INGESTION_NODE_HOSTNAME` y `SEARCH_NODE_HOSTNAME`; define ambos en `.env` con tus hostnames reales.

## Recomendaciones prácticas

- Usa discos locales para MongoDB y Qdrant.
- Usa NFS solo para uploads compartidas.
- Mantén `DOCS_DIR=/app/uploads` igual en backend y workers.
- No incrementes la réplica de `worker-ingestion` sin separar antes Celery Beat.
- Si vas a exponer el sistema a usuarios reales, pon Traefik, Caddy o Nginx delante del frontend para TLS y control de entrada.
