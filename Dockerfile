# syntax=docker/dockerfile:1

# 1) Install dependencies (with build tools for native deps like sharp)
FROM node:22-bookworm-slim AS deps
ENV NODE_ENV=development
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*
# Copy lockfile first for better caching (monorepo: still copies all sources later)
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps --no-audit --no-fund

# 2) Build
FROM node:22-bookworm-slim AS builder
ENV NODE_ENV=development
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate clients/translations and build workspace
RUN npm run prisma:generate && npm run translate:compile && npm run build

# 3) Runtime image
FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production
WORKDIR /app
# Copy built app and pruned node_modules
COPY --from=builder /app .
# Remove dev dependencies for smaller runtime image
RUN npm prune --omit=dev
EXPOSE 3000
CMD ["npm", "run", "start"]

