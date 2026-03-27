FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Pass VITE_ vars at build time (or runtime if configured, but Build time is standard for Vite)
ARG VITE_API_URL
ARG VITE_MAX_CONCURRENCY
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_MAX_CONCURRENCY=$VITE_MAX_CONCURRENCY

RUN npm run build

EXPOSE 80

# Run Vite Preview on port 80
CMD ["npm", "run", "preview", "--", "--host", "--port", "80"]
