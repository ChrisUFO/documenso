# syntax=docker/dockerfile:1

# 1) Install dependencies (with build tools for native deps like sharp)
FROM node:22-bookworm-slim AS deps
ENV NODE_ENV=development
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*
# Copy full repo (simpler, avoids npm ci EUSAGE due to workspace manifest mismatch)
COPY . .
RUN npm ci --legacy-peer-deps --no-audit --no-fund

# 2) Build (build Remix workspace directly)
FROM node:22-bookworm-slim AS builder
ENV NODE_ENV=development
WORKDIR /app
COPY --from=deps /app .
RUN npm run prisma:generate && npm run translate:compile && npm run build -w @documenso/remix
# Sanity check build outputs
RUN ls -la apps/remix/build && ls -la apps/remix/build/server && test -f apps/remix/build/server/main.js

# 3) Runtime image
FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production
# Ensure Prisma runtime deps are present
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates openssl libssl3 \
  && rm -rf /var/lib/apt/lists/*
# Copy built app and prune dev deps
WORKDIR /app
COPY --from=builder /app .
RUN npm prune --omit=dev || true
# Run Remix server directly without dev-only tools (dotenv, cross-env)
WORKDIR /app/apps/remix
EXPOSE 3000
CMD ["node", "build/server/main.js"]

