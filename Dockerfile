# ── ETAPA 1: Build da interface Front-End (React 19 + TypeScript + Vite) ──────
FROM node:20-slim AS frontend-builder

WORKDIR /build-front
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ── ETAPA 2: Runtime Unificado Python 3.11+ FastAPI (Portas 3000 e 8000) ──────
FROM python:3.11-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT_FRONTEND=3000 \
    PORT_BACKEND=8000 \
    PORT=8000

# Dependências do sistema (curl para healthcheck)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Instala dependências Python do backend
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copia código do backend FastAPI e servidor SPA
COPY app ./app
COPY serve_front.py ./serve_front.py
COPY start.sh ./start.sh
RUN chmod +x ./start.sh

# Copia os arquivos compilados do front-end da etapa anterior
COPY --from=frontend-builder /build-front/dist ./frontend/dist

# Expõe as portas diferenciadas: 3000 (Front-End) e 8000 (API & Swagger)
EXPOSE 3000
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["./start.sh"]
