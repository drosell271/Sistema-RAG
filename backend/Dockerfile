# --- Stage 1: Builder ---
FROM node:20-slim AS builder

WORKDIR /app

# Install dependencies (including devDependencies for build)
COPY api/package*.json ./
RUN npm install

# Copy source and build
COPY api/ .
RUN npm run build

# --- Stage 2: Runner ---
FROM node:20-slim

WORKDIR /app

# Install only production dependencies
COPY api/package*.json ./
RUN npm install --omit=dev

# Copy built artifacts from builder stage
COPY --from=builder /app/dist ./dist

# Copy HTML email templates (not emitted by tsc)
COPY api/src/templates ./dist/templates

EXPOSE 8000

CMD ["npm", "start"]
