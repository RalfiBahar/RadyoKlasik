# Radyo Klasik Studio (DJ panel) — production image (Phase 9).
# NEXT_PUBLIC_* values are baked in at build time, so they are build args.
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Empty = connect WebSockets to the page's own host (the panel is served at
# api.radyoklasik.online/panel). Mounted under NEXT_PUBLIC_BASE_PATH.
ARG NEXT_PUBLIC_WS_URL=""
ARG NEXT_PUBLIC_BASE_PATH=/panel
# Empty = ask the API (stream.<domain>); dev sets it to Icecast on :8000.
ARG NEXT_PUBLIC_STREAM_URL=""
ARG NEXT_PUBLIC_STATION_NAME="Radyo Klasik Online"
ARG NEXT_PUBLIC_AIR_LATENCY_MS=900
ARG NEXT_PUBLIC_BROADCAST_HOST=stream.radyoklasik.online
ARG NEXT_PUBLIC_BROADCAST_PORT=8005
ARG NEXT_PUBLIC_BROADCAST_MOUNT=/live
ARG NEXT_PUBLIC_BROADCAST_USER=source
ARG NEXT_PUBLIC_BROADCAST_ENCODING="MP3 128k"
# Rewrites to the API are resolved at build time too: inside compose the API
# is reachable as http://api:8001.
ARG STUDIO_API_URL=http://api:8001
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL \
    NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH \
    NEXT_PUBLIC_STREAM_URL=$NEXT_PUBLIC_STREAM_URL \
    NEXT_PUBLIC_STATION_NAME=$NEXT_PUBLIC_STATION_NAME \
    NEXT_PUBLIC_AIR_LATENCY_MS=$NEXT_PUBLIC_AIR_LATENCY_MS \
    NEXT_PUBLIC_BROADCAST_HOST=$NEXT_PUBLIC_BROADCAST_HOST \
    NEXT_PUBLIC_BROADCAST_PORT=$NEXT_PUBLIC_BROADCAST_PORT \
    NEXT_PUBLIC_BROADCAST_MOUNT=$NEXT_PUBLIC_BROADCAST_MOUNT \
    NEXT_PUBLIC_BROADCAST_USER=$NEXT_PUBLIC_BROADCAST_USER \
    NEXT_PUBLIC_BROADCAST_ENCODING=$NEXT_PUBLIC_BROADCAST_ENCODING \
    STUDIO_API_URL=$STUDIO_API_URL \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3001 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
# Logo + background artwork (the listener site's look).
COPY --from=build /app/public ./public
USER node
EXPOSE 3001
CMD ["node", "server.js"]
