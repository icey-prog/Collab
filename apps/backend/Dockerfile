# ─── Stage 1 : bundle esbuild (TS → un seul fichier CJS) ─────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npx esbuild src/server.ts \
      --bundle --platform=node --format=cjs --target=node20 \
      --outfile=dist/server.cjs \
      --external:bufferutil --external:utf-8-validate

# ─── Stage 2 : runtime slim (sans node_modules) ──────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
# Uploads persistants — monter un volume Coolify sur /app/data
ENV DATA_DIR=/app/data

RUN addgroup -S app && adduser -S app -G app
COPY --from=builder /app/dist/server.cjs ./server.cjs
RUN mkdir -p /app/data/uploads && chown -R app:app /app
USER app

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3001/ || exit 1

CMD ["node", "server.cjs"]
