# ==============================================================================
# GuessLess — Unified Multi-Stage Production Dockerfile
# Builds React SPA (client/dist) + Express TypeScript API (server/dist)
# Keeps Prisma CLI + tsx so Cloud Run migration job (s40fcb4ce-migrate) can run
# `npx --no-install prisma migrate deploy && npm run seed` using the same image.
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Build server (tsc + prisma generate) and client (vite build)
# ------------------------------------------------------------------------------
FROM node:24-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Copy workspace manifests first for Docker layer caching
COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json

RUN npm ci

# Copy application source
COPY server ./server
COPY client ./client

# Generate Prisma client and build both workspaces
RUN npm run prisma:generate -w server \
  && npm run build -w server \
  && npm run build -w client

# ------------------------------------------------------------------------------
# Stage 2: Production runtime image (non-root, port 8080)
# ------------------------------------------------------------------------------
FROM node:24-bookworm-slim AS runtime

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json

# Install server production dependencies + exact prisma CLI & tsx for migration/seed job
RUN npm ci --omit=dev --workspace=server \
  && npm install --no-save --no-audit --no-fund prisma@5.22.0 tsx@4.19.2 \
  && npm cache clean --force

# Copy generated Prisma client and compiled artifacts
COPY --from=builder --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=node:node /app/server/dist ./server/dist
COPY --from=builder --chown=node:node /app/server/prisma ./server/prisma
COPY --from=builder --chown=node:node /app/server/src ./server/src
COPY --from=builder --chown=node:node /app/server/tsconfig.json ./server/tsconfig.json
COPY --from=builder --chown=node:node /app/client/dist ./client/dist

# Bake Git commit SHA into image (returned by GET /api/v1/health even after rollback)
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}
ENV NODE_ENV=production
ENV PORT=8080
ENV PATH="/app/node_modules/.bin:${PATH}"

WORKDIR /app/server
USER node

EXPOSE 8080

CMD ["node", "dist/index.js"]