FROM node:20-slim

# qpdf for PDF protect/unlock
RUN apt-get update && apt-get install -y --no-install-recommends \
    qpdf \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Frontend: install deps and build ────────────────────────────────────────
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci

COPY frontend/ ./frontend/
RUN cd frontend && npm run build

# ── Backend: production deps only ───────────────────────────────────────────
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

COPY backend/ ./backend/

# ── Runtime config ──────────────────────────────────────────────────────────
ENV NODE_ENV=production
ENV QPDF_PATH=/usr/bin/qpdf

EXPOSE 3001
CMD ["node", "backend/server.js"]
