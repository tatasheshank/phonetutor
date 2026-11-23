# One Dockerfile, two images (built on the server itself, so ARM vs x86 just works):
#   docker build --target web   -t aitutor-web   .
#   docker build --target agent -t aitutor-agent .
# deploy/docker-compose.yml does both.
#
# Debian (glibc) base: LiveKit's native packages ship linux-*-gnu builds, not musl/Alpine.

FROM node:20-bookworm-slim AS deps
WORKDIR /app
# Workspace manifests first, so `npm ci` is cached until dependencies change.
COPY package.json package-lock.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/agent/package.json apps/agent/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund

FROM deps AS source
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
COPY content ./content

# ---------- Web app (Next.js) ----------
FROM source AS web-build
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w @ai-tutor/web

FROM web-build AS web
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app/apps/web
EXPOSE 3000
# Runs as the unprivileged "node" user from the base image.
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
CMD ["npx", "next", "start", "-p", "3000"]

# ---------- Tutor worker (LiveKit agent) ----------
FROM source AS agent
ENV NODE_ENV=production
WORKDIR /app/apps/agent
# Fetch model files the plugins need (VAD etc.) into the image, not at first lesson.
RUN npx tsx src/main.ts download-files || echo "download-files: nothing to download"
# The worker runs as root inside its container: plugins cache models under node_modules and
# $HOME. It exposes no ports; it only makes outbound connections to LiveKit and Sarvam.
CMD ["npx", "tsx", "src/main.ts", "start"]
