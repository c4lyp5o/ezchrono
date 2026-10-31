# Build the UI, then run the server. One image, one port.
FROM oven/bun:1.4.4-alpine AS builder
WORKDIR /app
COPY frontend/package.json frontend/bun.lock ./frontend/
RUN cd frontend && bun install --frozen-lockfile
COPY frontend ./frontend
RUN cd frontend && bun run build

FROM oven/bun:1.4.4-alpine
WORKDIR /app
RUN addgroup -S ezchrono && adduser -S ezchrono -G ezchrono -h /home/ezchrono
ENV NODE_ENV=production \
	PORT=5100 \
	EZCHRONO_DB=/app/data/ezchrono.db \
	EZCHRONO_CLIENT_DIR=/app/client
COPY backend/package.json backend/bun.lock ./backend/
RUN cd backend && bun install --production --frozen-lockfile --ignore-scripts
COPY backend/src ./backend/src
COPY package.json ./
COPY --from=builder /app/client ./client
RUN mkdir -p /app/data && chown -R ezchrono:ezchrono /app/data
USER ezchrono
EXPOSE 5100
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
	CMD wget -qO- "http://localhost:${PORT}/api/v1/health" || exit 1
CMD ["bun", "backend/src/index.ts"]
