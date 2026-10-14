"""
Venue Intelligence Core / RaizEvento — aplicação ÚNICA FastAPI (porta 8000).

API Gateway + autenticação JWT/RBAC + resiliência + motor de IA + WebSocket/SSE no mesmo processo,
compartilhando um só estado em memória (`app/repositories/memory_db.py`) — sem split-brain.

Executar:  uvicorn app.main:app --reload --port 8000   →   http://localhost:8000/docs
"""
from __future__ import annotations

import logging
from typing import Any, Dict

from fastapi import Depends, FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.responses import RedirectResponse

from app.config import settings
from app.contracts import HealthResponseContract
from app.errors import registrar_handlers, sem_query_params
from app.repositories.memory_db import agora_utc, memory_db
from app.routers import auth, insumos, ops, predicoes, stream, telemetry, venue
from app.services.event_bus import event_bus

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

VERSAO = "2.0.0"

DESCRICAO = f"""
Suíte operacional **Venue Intelligence / RaizEvento** — 100% Python (FastAPI + Pydantic v2), porta `8000`.

### 🔐 Como autenticar (cadeado)
1. Clique em **Authorize** (canto superior direito).
2. Cole `{settings.dev_token}` (papel **admin**) — sem o prefixo `Bearer`.
3. Para testar RBAC, gere um JWT por papel em `POST /api/v1/auth/token`.

### 🛡️ Contratos estritos
Todos os modelos usam `ConfigDict(extra="forbid")`. Campos extras, tipos ou limites inválidos → **400 CONTRATO_VIOLADO**
(também para query params não mapeados). Não existe nenhum campo de identificação individual: leituras 100% anônimas e agregadas.

### ⚡ Matriz de resiliência (`POST /api/v1/telemetry/frame-analysis`)
| Código | Gatilho | Modo |
|---|---|---|
| 201 | inferência normal | `TEMPO_REAL` |
| 400 | contrato inválido | pacote descartado |
| 502 | `sensor_status = OFFLINE` | `FALLBACK_502` (média 15 min) |
| 504 | `simular_falha_ia = TIMEOUT_504` / IA > {settings.ai_timeout_seg}s | `MEDIA_MOVEL_504` (média 3 min) |
| 503 | `simular_falha_ia = DOWN_503` | `CONTINGENCIA_503` (POS) |

### 📡 Tempo real
- WebSocket: `ws://localhost:8000/api/v1/live/stream?token={settings.dev_token}`
- SSE: `GET /api/v1/telemetry/stream`
"""

TAGS = [
    {"name": "Autenticação (JWT / RBAC)", "description": "Emissão de tokens de desenvolvimento por papel."},
    {"name": "Módulo A · Telemetria & Resiliência", "description": "Ingestão de sensores, motor de IA e códigos 400/502/503/504."},
    {"name": "Módulo B · Produto 1 — Insumos", "description": "Métrica de insumos e reabastecimento (Parte 5)."},
    {"name": "Módulo C · Produto 2 — Predição & Despacho", "description": "Acionamento preditivo e despacho tático (Partes 5 e 6)."},
    {"name": "Módulo D · Painel, Heatmap & Analytics", "description": "Estande RAIZ — Slides S01 a S10."},
    {"name": "Módulo E · Tempo Real (WebSocket & SSE)", "description": "Push de eventos com latência de 10 ms a 400 ms."},
    {"name": "Infraestrutura", "description": "Liveness e status operacional."},
]

app = FastAPI(
    title="Venue Intelligence Core · RaizEvento API",
    version=VERSAO,
    description=DESCRICAO,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    openapi_tags=TAGS,
    swagger_ui_parameters={"persistAuthorization": True, "displayRequestDuration": True, "tryItOutEnabled": True},
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials="*" not in settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Modo-Leitura", "Retry-After"],
)

registrar_handlers(app)

for modulo in (auth, telemetry, insumos, predicoes, ops, venue, stream):
    app.include_router(modulo.router)


@app.get("/", include_in_schema=False)
async def raiz() -> RedirectResponse:
    return RedirectResponse(url="/docs")


@app.get(
    "/health",
    response_model=HealthResponseContract,
    status_code=status.HTTP_200_OK,
    tags=["Infraestrutura"],
    summary="Liveness e status operacional do evento",
    description="Público (sem token) para healthchecks de plataforma. Reflete `ESTAVEL` / `ACAO_EM_ANDAMENTO`.",
    dependencies=[Depends(sem_query_params)],
)
async def health() -> HealthResponseContract:
    return HealthResponseContract(
        status="ok",
        servico="venue-intelligence-core",
        versao=VERSAO,
        timestamp=agora_utc(),
        status_operacional_evento=memory_db.status_operacional,  # type: ignore[arg-type]
        motor_ia_online=memory_db.motor_ia_online,
        conexoes_tempo_real=event_bus.conexoes,
    )


def _openapi_customizado() -> Dict[str, Any]:
    """Remove o 422 padrão do FastAPI: violações de contrato são documentadas (e devolvidas) como 400."""
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(
        title=app.title, version=app.version, description=app.description, routes=app.routes, tags=TAGS
    )
    for operacoes in schema.get("paths", {}).values():
        for operacao in operacoes.values():
            if isinstance(operacao, dict):
                operacao.get("responses", {}).pop("422", None)
    componentes = schema.get("components", {}).get("schemas", {})
    componentes.pop("HTTPValidationError", None)
    componentes.pop("ValidationError", None)
    app.openapi_schema = schema
    return schema


app.openapi = _openapi_customizado  # type: ignore[method-assign]
