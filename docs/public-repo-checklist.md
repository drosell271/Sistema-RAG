# Checklist para Hacer Público el Repo

Esta lista está centrada en privacidad y exposición de datos del entorno, no solo en seguridad técnica.

## 1. Archivos y credenciales

Verifica antes de publicar:

- que `.env` no esté trackeado
- que `secure/` no contenga documentos, correos o adjuntos reales
- que no haya dumps de Mongo, Redis o Qdrant dentro del repo
- que no existan tokens, API keys o contraseñas en commits antiguos

## 2. Branding y datos identificables

Sustituye si aplica:

- nombre real de empresa
- dominios internos o públicos
- logos privados
- emails corporativos
- nombres reales de nodos, hosts, VMs o clusters
- rutas internas de filesystem o NFS

## 3. Scripts y despliegue

Revisa especialmente:

- [`deploy.sh`](../deploy.sh)
- [`docker-compose.yml`](../docker-compose.yml)
- [`docker-compose.yml.local`](../docker-compose.yml.local)
- [`.env.example`](../.env.example)

## 4. Pantallazos para el README

Los más útiles para un repo público son estos:

1. Pantalla de login.
   Que se vea limpia, sin dominio real ni logos privados si no quieres exponerlos.
2. Pantalla de búsqueda con resultados.
   Usa documentos ficticios o anonimizados.
3. Biblioteca o árbol de carpetas.
   Muestra estructura y permisos, pero no nombres reales de clientes o proyectos.
4. Administración.
   Haz el pantallazo de la parte visual y de configuración general, no de SMTP/IMAP con credenciales.
5. Gestión de usuarios y grupos.
   Usa usuarios de ejemplo.
6. Logs.
   Muestra tipos de eventos, nunca correos reales, rutas reales o IDs sensibles.

## 5. Qué ocultar en los pantallazos

- nombre de empresa si no quieres vincular el repo
- emails reales
- nombres de personas
- nombres de clientes
- nombres de proyectos internos
- IPs, dominios y hostnames reales
- API keys, tokens o hashes
- rutas NFS o paths internos si identifican tu infraestructura

## 6. Buen patrón para capturas

Usa datos de demo:

- empresa: `Example Corp`
- dominio: `rag.example.com`
- usuarios: `admin@example.com`, `analyst@example.com`
- documentos: `manual-demo.pdf`, `contrato-demo.pdf`, `politica-seguridad-demo.txt`
- nodos: `swarm-manager`, `swarm-worker-ingestion`, `swarm-worker-search`

## 7. Orden recomendado de imágenes en el README

1. Hero image de búsqueda o biblioteca
2. Login
3. Búsqueda con resultados
4. Administración
5. Usuarios y grupos
6. Logs
