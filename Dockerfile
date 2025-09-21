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

# 2) Build (only build Remix app and its dependencies)
FROM node:22-bookworm-slim AS builder
ENV NODE_ENV=development
ENV TURBO_TELEMETRY_DISABLE=1
WORKDIR /app
COPY --from=deps /app .
# Generate clients/translations and build only Remix and its deps
RUN npm run prisma:generate && npm run translate:compile && npx turbo run build --filter=@documenso/remix^...

# 3) Runtime image
FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production
# Copy built app and prune dev deps
WORKDIR /app
COPY --from=builder /app .
RUN npm prune --omit=dev || true
# Run Remix server directly without dev-only tools (dotenv, cross-env)
WORKDIR /app/apps/remix
EXPOSE 3000
CMD ["node", "build/server/main.js"]

