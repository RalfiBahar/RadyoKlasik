# Node control-plane API for the self-hosted radio stack.
FROM node:20-bookworm-slim

# ffmpeg/ffprobe are needed by record.js (Phase 8) and the media ingest
# pipeline (Phase 1); curl is used by the compose healthcheck.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 8001

CMD ["node", "server.js"]
