# ─── Stage 1 : build (npm + tsx) ─────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src

# ─── Stage 2 : runtime slim ──────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

# Crée user non-root (sécurité)
RUN addgroup -S app && adduser -S app -G app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json  ./package.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/src           ./src

# Volume pour uploads (persistant via Fly volume)
RUN mkdir -p /app/data/uploads && chown -R app:app /app
USER app

EXPOSE 3001
CMD ["node", "--import", "tsx", "src/server.ts"]
