#!/bin/bash

# ==========================================
# Script de Despliegue Sistema-RAG (Multi-Nodo)
# ==========================================
# Uso: ./deploy.sh [modo]
# Modos disponibles:
#   update           - Actualiza código y redespliega
#   setup            - Clona repo en workers, configura entorno, build y despliegue inicial
#   delete           - DETIENE TODO, borra contenedores/imágenes/vólumenes y elimina el repo en todos los nodos
# ==========================================

MODE=$1
FORCE=$2

# Configuración editable por entorno
# Ejemplo:
#   export WORKERS="swarm-worker-ingestion swarm-worker-search"
#   export COORDINATOR="swarm-manager"
#   export REPO_URL="git@github.com:tu-org/tu-repo.git"
#   export PROJECT_DIR="$HOME/sistema-rag"
#   export REMOTE_PROJECT_DIR=~/sistema-rag
WORKERS=(${WORKERS:-swarm-worker-ingestion swarm-worker-search})
COORDINATOR="${COORDINATOR:-swarm-manager}"
REPO_URL="${REPO_URL:-git@github.com:your-org/your-repo.git}"
PROJECT_DIR="${PROJECT_DIR:-$HOME/sistema-rag}"
REMOTE_PROJECT_DIR="${REMOTE_PROJECT_DIR:-~/sistema-rag}"

# Variables globales
pids=""

# Colores para output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# --- TRAPS ---
ctrl_c() {
    echo ""
    warn "🛑 Interrupción detectada (Ctrl+C). Deteniendo procesos en segundo plano..."
    if [ -n "$pids" ]; then
        for pid in $pids; do
            kill $pid 2>/dev/null
        done
    fi
    error "Script cancelado por el usuario."
    exit 1
}
trap ctrl_c INT

log() {
    echo -e "${GREEN}[$(date +'%H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%H:%M:%S')] $1${NC}"
}

# --- FUNCIONES ---

show_help() {
    echo -e "${GREEN}Script de Despliegue Sistema-RAG${NC}"
    echo ""
    echo "Uso: ./deploy.sh [modo]"
    echo ""
    echo "Modos:"
    echo -e "  ${YELLOW}update${NC}           : Actualiza código (git pull), reconstruye imágenes y redespliega stack."
    echo -e "  ${YELLOW}setup${NC}            : Configuración inicial. Clona repo, copia .env, build y despliegue."
    echo -e "  ${YELLOW}configure${NC}        : Editor interactivo de variables .env y propagación a nodos."
    echo -e "  ${YELLOW}delete${NC}           : ⚠️  Borrado TOTAL. Detiene, limpia sistema y borra repo en todos los nodos."
    echo -e "  ${YELLOW}seed${NC}             : Ejecuta el script de seed para poblar la BBDD (Admin/Settings)."
    echo -e "  ${YELLOW}help, -h, --help${NC} : Muestra esta ayuda."
    echo ""
}

do_configure() {
    # ---------------------------------------------------------
    # TEMA WHIPTAIL (BLACK / HACKER STYLE)
    # ---------------------------------------------------------
    export NEWT_COLORS='
        root=,black
        window=,black
        border=green,black
        textbox=green,black
        button=black,green
        entry=black,green
        listbox=green,black
        actlistbox=black,green
        sellistbox=black,green
        actsellistbox=black,green
        checkbox=green,black
        actcheckbox=black,green
    '

    log "🛠️  Iniciando configurador interactivo..."

    # Verificar si whiptail está instalado
    if ! command -v whiptail &> /dev/null; then
        warn "whiptail no encontrado. Se usará modo simple (read)."
        error "Por favor instala whiptail (sudo apt install whiptail) para usar el configurador gráfico."
        exit 1
    fi

    # Asegurar que local .env existe
    if [ ! -f .env ]; then
        if [ -f .env.example ]; then
            cp .env.example .env
            log "✅ .env creado desde .env.example"
        else
            error "No se encuentra .env ni .env.example"
            exit 1
        fi
    else
        # Sincronizar claves nuevas de .env.example a .env
        log "🔄 Sincronizando .env con .env.example (añadiendo variables faltantes)..."
        # Leer .env.example línea por línea
        while IFS= read -r line || [ -n "$line" ]; do
            # Ignorar líneas vacías o comentarios puros (sin =)
            if [[ -z "$line" || "$line" != *"="* ]]; then continue; fi
            
            # Extraer clave (soportando KEY=VAL y # KEY=VAL)
            CLEAN_KEY=$(echo "$line" | sed 's/^[#[:space:]]*//' | cut -d'=' -f1)
            
            # Si la clave no existe en .env, añadirla
            if ! grep -q "^$CLEAN_KEY=" .env && ! grep -q "^#[[:space:]]*$CLEAN_KEY=" .env; then
                echo "$line" >> .env
                # log "➕ Añadida variable faltante: $CLEAN_KEY"
            fi
        done < .env.example
    fi

    # --- HELPER: SHOW SUBMENU ---
    show_submenu() {
        local TITLE=$1
        # El resto de argumentos son pares "CLAVE" "DESCRIPCION"
        shift
        local KEYS_AND_DESCS=("$@")
        
        while true; do
            # Construir menú dinámico leyendo valores actuales
            MENU_ITEMS=()
            for ((i=0; i<${#KEYS_AND_DESCS[@]}; i+=2)); do
                KEY="${KEYS_AND_DESCS[i]}"
                DESC="${KEYS_AND_DESCS[i+1]}"
                
                # Leer valor. Prioridad: Activo > Comentado
                if grep -q "^$KEY=" .env; then
                    VAL=$(grep "^$KEY=" .env | cut -d'=' -f2-)
                    DISPLAY_VAL="$VAL"
                elif grep -q "^#[[:space:]]*$KEY=" .env; then
                    VAL=$(grep "^#[[:space:]]*$KEY=" .env | cut -d'=' -f2-)
                    DISPLAY_VAL="# (Comentado/Vacio)"
                else
                    VAL=""
                    DISPLAY_VAL="(No definido)"
                fi
                
                MENU_ITEMS+=("$KEY" "$DISPLAY_VAL")
            done

            CHOICE=$(whiptail --title "$TITLE" --menu "Selecciona una variable para editar (Borrar valor = Comentar):" 20 100 10 \
                "${MENU_ITEMS[@]}" \
                "ATRAS" "Volver al menú principal" \
                3>&1 1>&2 2>&3)
            
            if [ $? -ne 0 ]; then break; fi # Cancel/Esc = Back
            if [ "$CHOICE" == "ATRAS" ]; then break; fi

            # Pre-cargar valor para editar
            # Si está activo, mostrar valor. Si está comentado, mostrar valor limpio (sin # ni espacios)
            if grep -q "^$CHOICE=" .env; then
                CURRENT_VAL=$(grep "^$CHOICE=" .env | cut -d'=' -f2-)
            elif grep -q "^#[[:space:]]*$CHOICE=" .env; then
                CURRENT_VAL=$(grep "^#[[:space:]]*$CHOICE=" .env | cut -d'=' -f2- | sed 's/^ //')
            else
                CURRENT_VAL=""
            fi

            NEW_VAL=$(whiptail --inputbox "Editar $CHOICE ($DESC)" 10 80 "$CURRENT_VAL" 3>&1 1>&2 2>&3)
            
            if [ $? -eq 0 ]; then
                # Escape de barras para sed
                ESCAPED_VAL=$(echo "$NEW_VAL" | sed 's/\//\\\//g')
                
                if [ -z "$NEW_VAL" ]; then
                    # VALOR VACIO -> COMENTAR (# KEY=)
                    if grep -q "^$CHOICE=" .env; then
                        sed -i "s/^$CHOICE=.*/# $CHOICE=/" .env
                    elif grep -q "^#[[:space:]]*$CHOICE=" .env; then
                        sed -i "s/^#[[:space:]]*$CHOICE=.*/# $CHOICE=/" .env
                    else
                        echo "# $CHOICE=" >> .env
                    fi
                else
                    # VALOR SET -> DESCOMENTAR Y ASIGNAR (KEY=VAL)
                    if grep -q "^$CHOICE=" .env; then
                        sed -i "s/^$CHOICE=.*/$CHOICE=$ESCAPED_VAL/" .env
                    elif grep -q "^#[[:space:]]*$CHOICE=" .env; then
                        # Desactivar comentario y poner valor
                        sed -i "s/^#[[:space:]]*$CHOICE=.*/$CHOICE=$ESCAPED_VAL/" .env
                    else
                        echo "$CHOICE=$NEW_VAL" >> .env
                    fi
                    
                    # Advertencias específicas (Solo si se activó/cambió un valor sensible)
                    if [[ "$CHOICE" == *"PASSWORD"* || "$CHOICE" == *"KEY"* || "$CHOICE" == *"SECRET"* ]]; then
                        whiptail --msgbox "⚠️  ATENCIÓN: Has cambiado una credencial ($CHOICE).\n\nPara que esto surta efecto en la base de datos, DEBES BORRAR los volúmenes existentes (modo 'delete') y volver a hacer 'setup'." 12 78
                    fi
                fi
            fi
        done
    }

    # --- BUCLE PRINCIPAL ---
    while true; do
        MAIN_CHOICE=$(whiptail --title "CONFIGURACIÓN SISTEMA-RAG" --menu "Selecciona una sección:" 22 100 12 \
            "1. GLOBAL" "Entorno, Puerto, Logs" \
            "2. SEGURIDAD" "Passwords Admin, Secret Keys, CORS" \
            "3. BASE DE DATOS" "Mongo, Redis, Qdrant (Hosts & Credenciales)" \
            "4. AI INTELLIGENCE" "Modelos (Embed/Rerank) & Threads CPU" \
            "5. ALMACENAMIENTO" "Directorio Docs, Workers Concurrentes" \
            "6. SERVICIOS" "Frontend URL, IMAP Poll" \
            "GUARDAR" "Guardar y Salir" \
            3>&1 1>&2 2>&3)
        
        EXIT_STATUS=$?
        if [ $EXIT_STATUS -ne 0 ]; then break; fi # Cancel/Esc = Salir

        case "$MAIN_CHOICE" in
            "1. GLOBAL")
                show_submenu "CONFIGURACIÓN GLOBAL" \
                    "NODE_ENV" "Entorno (production/development)" \
                    "PORT" "Puerto del Backend" \
                    "LOG_LEVEL" "Nivel de Detalle del Log"
                ;;
            "2. SEGURIDAD")
                show_submenu "SEGURIDAD & CREDENCIALES" \
                    "SECRET_KEY" "Clave Secreta Global (⚠️ Reset)" \
                    "ALLOWED_ORIGINS" "Orígenes Permitidos (CORS)" \
                    "BCRYPT_ROUNDS" "Rondas de Sal (Bcrypt)" \
                    "ADMIN_EMAIL" "Email Admin Inicial" \
                    "ADMIN_PASSWORD" "Password Admin Inicial" \
                    "ADMIN_DOMAIN" "Dominio Admin (Opcional)"
                ;;
            "3. BASE DE DATOS")
                show_submenu "CONEXIONES BASE DE DATOS" \
                    "MONGO_HOST" "Host MongoDB" \
                    "MONGO_PORT" "Puerto MongoDB" \
                    "MONGO_DB_NAME" "Nombre Base de Datos Mongo" \
                    "MONGO_INITDB_ROOT_USERNAME" "Usuario Root Mongo" \
                    "MONGO_INITDB_ROOT_PASSWORD" "Password Root Mongo (⚠️ Reset)" \
                    "REDIS_HOST" "Host Redis" \
                    "REDIS_PORT" "Puerto Redis" \
                    "REDIS_PASSWORD" "Password Redis (⚠️ Reset)" \
                    "QDRANT_HOST" "Host Qdrant" \
                    "QDRANT_PORT" "Puerto Qdrant API" \
                    "QDRANT_URL" "URL Qdrant Interna" \
                    "QDRANT_API_KEY" "API Key Qdrant (⚠️ Reset)" \
                    "QDRANT_COLLECTION" "Nombre Colección Qdrant" \
                    "QDRANT_TELEMETRY_DISABLED" "Desactivar Telemetría Qdrant" \
                    "QDRANT_ALLOW_RECOVERY_MODE" "Modo Recuperación Qdrant"
                ;;
            "4. AI INTELLIGENCE")
                show_submenu "AI CORE & OPTIMIZACIÓN" \
                    "EMBEDDING_MODEL" "Modelo HuggingFace (Ej: intfloat/multilingual-e5-large)" \
                    "EMBEDDING_SIZE" "Dimensión del vector (Ej: 1024)" \
                    "SPARSE_EMBEDDING_MODEL" "Modelo Sparse (Ej: Qdrant/bm42-all-minilm-l6-v2-att)" \
                    "RERANKER_MODEL" "Modelo Reranker (Cross-Encoder)" \
                    "OMP_NUM_THREADS" "Hilos OpenMP (CPU)" \
                    "MKL_NUM_THREADS" "Hilos MKL (CPU)"
                ;;
            "5. ALMACENAMIENTO")
                show_submenu "ALMACENAMIENTO & INGESTIÓN" \
                    "DOCS_DIR" "Directorio de Documentos" \
                    "INGESTION_CONCURRENCY" "Workers Concurrentes (Procesos)"
                ;;
            "6. SERVICIOS")
                show_submenu "SERVICIOS EXTERNOS" \
                    "VITE_API_URL" "URL Base API (/api/v1)" \
                    "IMAP_POLL_INTERVAL" "Intervalo Polling Email (seg)"
                ;;

            "GUARDAR")
                break
                ;;
        esac
    done
    
    # Propagar cambios a workers remotos
    if (whiptail --title "Propagar Cambios" --yesno "¿Deseas copiar esta configuración a todos los workers (${WORKERS[*]})?" 10 70); then
        log "📤 Propagando .env a workers..."
        for host in "${WORKERS[@]}"; do
            # Copiar archivo .env usando scp
            scp -q .env $host:$REMOTE_PROJECT_DIR/.env
            if [ $? -eq 0 ]; then
                log "✅ .env copiado a $host"
            else
                error "❌ Fallo al copiar .env a $host"
            fi
        done
        whiptail --msgbox "Configuración propagada exitosamente." 8 40
    else
        warn "Cambios guardados SOLO localmente en $COORDINATOR."
    fi
}

do_delete() {
    warn "⚠️  INICIANDO ELIMINACIÓN TOTAL EN EL CLUSTER ($COORDINATOR + ${WORKERS[*]}) ⚠️"
    warn "Esto detendrá todos los contenedores, borrará volúmenes y ELIMINARÁ EL REPOSITORIO en todos los nodos."
    warn "Esto detendrá todos los contenedores, borrará volúmenes y ELIMINARÁ EL REPOSITORIO en todos los nodos."
    
    if [[ "$FORCE" == "-y" ]]; then
        confirm="s"
    else
        read -p "¿Estás seguro? (s/N): " confirm
    fi
        
    if [[ "$confirm" != "s" && "$confirm" != "S" ]]; then
        error "Cancelado."
        exit 1
    fi

    # 1. Detener servicios en Coordinadora (Stack)
    log "🛑 Deteniendo stack 'rag' en el cluster..."
    docker stack rm rag > /dev/null 2>&1
    
    log "⏳ Esperando 20 segundos a que los servicios se detengan completamente..."
    sleep 20

    # 2. Limpiar Workers (Remoto)
    for host in "${WORKERS[@]}"; do
        log "🗑️  Limpiando nodo remoto: $host..."
        # Force stop anything remaining and prune volumes
        ssh $host "docker ps -aq | xargs -r docker stop > /dev/null 2>&1; \
                   echo 'Pruning system on $host...'; \
                   docker system prune -af --volumes; \
                   docker volume rm \$(docker volume ls -q) 2>/dev/null; \
                   rm -rf $REMOTE_PROJECT_DIR"
    done

    # 3. Limpiar coordinador local
    log "🗑️  Limpiando nodo local: $COORDINATOR..."
    docker ps -aq | xargs -r docker stop > /dev/null 2>&1
    log "Pruning system on $COORDINATOR..."
    docker system prune -af --volumes
    # Force remove any remaining volumes explicitly
    docker volume rm $(docker volume ls -q) 2>/dev/null
    
    # Borrar repo local (Saliendo del directorio primero)
    log "🗑️  Borrando repositorio local..."
    cd ..
    rm -rf "$PROJECT_DIR"
    
    log "✅ Limpieza completada en todos los nodos. Datos eliminados."
}

do_setup() {
    log "🚀 Iniciando SETUP en todo el cluster..."

    # 1. Configurar Workers (Remoto)
    for host in "${WORKERS[@]}"; do
        log "📦 Configurando remoto: $host..."
        # Clonar repo si no existe
        ssh $host "if [ ! -d $REMOTE_PROJECT_DIR ]; then \
                     git clone $REPO_URL $REMOTE_PROJECT_DIR; \
                   else \
                     echo 'Repo ya existe en $host, haciendo pull...'; \
                     cd $REMOTE_PROJECT_DIR && git pull; \
                   fi"
        
        # Configurar .env base (si no existe)
        ssh $host "cd $REMOTE_PROJECT_DIR && if [ ! -f .env ]; then cp .env.example .env; fi"
    done
    
    # 2. Configurar coordinador local
    log "📦 Configurando local: $COORDINATOR..."

    # Verificar si el repo existe en local
    if [ ! -d "$PROJECT_DIR" ]; then
         log "Clonando repo en local..."
         git clone "$REPO_URL" "$PROJECT_DIR"
    fi

    cd "$PROJECT_DIR" || { error "No se pudo entrar a $PROJECT_DIR"; exit 1; }

    if [ ! -f .env ]; then 
        log "Copiando .env.example a .env en local..."
        cp .env.example .env
    fi
    
    # --- CONFIGURACIÓN INTERACTIVA ---
    echo ""
    
    if [[ "$FORCE" == "-y" ]]; then
        config_confirm="n"
    else
        read -p "¿Deseas revisar/editar la configuración .env ahora? (s/N): " config_confirm
    fi

    if [[ "$config_confirm" == "s" || "$config_confirm" == "S" ]]; then
        do_configure
    else
        log "Usando configuración por defecto/existente."
        # Asegurar 'safe consistency': copiar .env local a remotos incluso si no se editó
        # para garantizar que todos usen el mismo .env base.
        log "Sincronizando .env base a workers..."
        for host in "${WORKERS[@]}"; do
            scp -q .env $host:$REMOTE_PROJECT_DIR/.env
        done
    fi
    # ---------------------------------
    
    warn "⚠️  IMPORTANTE: Asegúrate de tener los secretos en .env configurados antes de continuar (especialmente Qdrant/Mongo)."
    sleep 2

    # 3. Construir Workers (PARALELO)
    log "🔨 Construyendo Workers en PARALELO..."
    pids=""
    for host in "${WORKERS[@]}"; do
        log "🚀 Lanzando build en $host..."
        ssh $host "cd $REMOTE_PROJECT_DIR && docker build -t rag_worker:latest ./worker" &
        pids="$pids $!"
    done

    # Esperar a que terminen
    wait $pids
    # Reset pids after wait
    pids=""
    log "✅ Builds de Workers completados."

    # 4. Construir Backend/Frontend (Local)
    log "🔨 Construyendo Backend y Frontend en local ($COORDINATOR)..."
    # Ya estamos en PROJECT_DIR
    docker build -t rag_backend:latest ./backend
    docker build -t rag_frontend:latest ./frontend

    # 5. Desplegar Stack
    log "🚀 Desplegando Docker Stack..."
    # Exportar variables de entorno para que docker stack deploy las use en sustitución
    set -a
    source .env
    set +a
    docker stack deploy -c docker-compose.yml rag
    log "✅ Setup y Despliegue completados."
    

}

do_update() {
    log "🔄 Iniciando UPDATE del sistema..."

    # 1. Actualizar workers en paralelo
    log "📦 Actualizando y construyendo Workers en PARALELO..."
    pids=""
    for host in "${WORKERS[@]}"; do
        log "🚀 Lanzando update & build en $host..."
        ssh $host "cd $REMOTE_PROJECT_DIR && git pull && docker build -t rag_worker:latest ./worker" &
        pids="$pids $!"
    done

    # Esperar a que terminen
    wait $pids
    # Reset pids after wait
    pids=""
    log "✅ Updates de Workers completados."

    # 2. Actualizar coordinador local
    log "📦 Actualizando código y construyendo en local ($COORDINATOR)..."
    
    # Asegurar que estamos en el directorio correcto
    cd "$PROJECT_DIR" || { error "No se encuentra el directorio $PROJECT_DIR"; exit 1; }
    
    git pull
    
    # Reconstruir imágenes locales
    docker build -t rag_backend:latest ./backend
    docker build -t rag_frontend:latest ./frontend

    # 3. Redesplegar el Stack
    log "🔄 Actualizando servicios en el cluster..."
    set -a
    source .env
    set +a
    docker stack deploy -c docker-compose.yml rag
    log "✅ Update completado."


}



# Función para ejecutar el seed
seed() {
    log "🌱 Ejecutando seed de base de datos..."
    # Ejecutar en el contenedor 'api' del stack 'rag'
    # Primero buscamos el ID del contenedor
    CONTAINER_ID=$(docker ps -qf "name=rag_api")
    
    if [ -n "$CONTAINER_ID" ]; then
        if docker exec $CONTAINER_ID npm run seed; then
            log "✅ Seed completado correctamente."
        else
            error "❌ Error ejecutando seed."
        fi
    else
        error "❌ No se encontró el contenedor de la API (rag_api). Asegúrate de que el stack esté corriendo (./deploy.sh setup o update)."
    fi
}

# --- MAIN LOGIC ---

if [ -z "$MODE" ]; then
    show_help
    exit 1
fi

case "$MODE" in
    delete)
        do_delete
        ;;
    setup)
        do_setup
        ;;
    seed)
        seed
        ;;
    configure)
        # Asegurar directorio correcto antes de llamar
        if [ -d "$PROJECT_DIR" ]; then 
            cd "$PROJECT_DIR" 
        else
            error "Directorio del proyecto no encontrado en $PROJECT_DIR. Ejecuta setup primero."
            exit 1
        fi
        do_configure
        ;;
    update)
        do_update
        ;;
    help|-h|--help)
        show_help
        ;;
    *)
        error "Modo desconocido: $MODE"
        show_help
        exit 1
        ;;
esac
