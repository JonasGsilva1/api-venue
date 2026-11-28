"""
Venue Intelligence Core / RaizEvento — aplicação ÚNICA FastAPI (porta 8000).

API Gateway + autenticação JWT/RBAC + resiliência + motor de IA + WebSocket/SSE no mesmo processo,
compartilhando um só estado em memória (`app/repositories/memory_db.py`) — sem split-brain.

Executar:  uvicorn app.main:app --reload --port 8000   →   http://localhost:8000/docs
"""
from __future__ import annotations

import logging
import mimetypes
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict

mimetypes.add_type("application/javascript", ".mjs")
mimetypes.add_type("application/wasm", ".wasm")
mimetypes.add_type("application/octet-stream", ".onnx")

from fastapi import Depends, FastAPI, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from app.config import mascarar_database_url, settings
from app.contracts import DatabaseHealthContract, HealthResponseContract
from app.errors import registrar_handlers, sem_query_params
from app.repositories.memory_db import agora_utc, memory_db
from app.routers import auth, ops, predicoes, stream, telemetry, venue, videos
from app.services.event_bus import event_bus

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger(__name__)

VERSAO = "2.0.0"

DESCRICAO = f"""
API do painel **Venue Intelligence / RaizEvento** para acompanhar filas, lotação por câmeras e atrações do evento em tempo real.

### Como testar aqui no Swagger
1. Clique em **Authorize** (botão verde com cadeado no canto direito).
2. Cole o token `{settings.dev_token}` (sem escrever `Bearer` na frente) e confirme.

### Onde cada grupo aparece no site
| Grupo no Swagger | Onde aparece no site |
|---|---|
| **Login** | Tela de login e token de acesso |
| **Mapa & Arena · Telemetria das Câmeras** | Aba **Mapa & Arena** → painel **Telemetria das Câmeras** e janela **Analisar vídeo** |
| **Despacho Ops** | Botão **Despacho Ops** no topo e **Acionar Despacho Ops** na janela de vídeo |
| **Predições de Gargalos (IA)** | Aba **Predições de Gargalos (IA)** |
| **Instagramáveis** | Aba **Instagramáveis** e botão **+ Atração** no topo |
| **Síntese Acumulada** | Aba **Síntese Acumulada** e botão **Simular Pico** |
| **Vídeos do Drive** | Aba **Vídeos do Drive** no topo do site |
| **Tempo Real** | Canal de atualizações ao vivo (para uso futuro no site) |
| **Sistema** | Indicador **Conexão com a API** no topo do site e checagem do servidor |

### Códigos de resposta da análise de vídeo (`Analisar vídeo`)
| Código | O que significa |
|---|---|
| `201` | Leitura feita na hora com os dados atuais da câmera |
| `400` | Dados enviados com erro (campo a mais, tipo errado ou valor fora do limite) |
| `502` | Câmera desligada — usa a média dos últimos 15 minutos |
| `504` | IA demorou mais de {settings.ai_timeout_seg}s — usa a média dos últimos 3 minutos |
| `503` | IA fora do ar — estima a fila pelas passagens na catraca |
"""

TAGS = [
    {"name": "Login", "description": "Entrar no sistema e gerar token de acesso para testes."},
    {"name": "Mapa & Arena · Telemetria das Câmeras", "description": "Aba Mapa & Arena: lista das 7 câmeras, status das zonas e envio de pessoas detectadas no vídeo."},
    {"name": "Despacho Ops", "description": "Botões Despacho Ops e Acionar Despacho Ops: envia equipe para aliviar filas críticas."},
    {"name": "Predições de Gargalos (IA)", "description": "Aba Predições de Gargalos (IA): previsão de filas e teste de cálculo de espera."},
    {"name": "Instagramáveis", "description": "Aba Instagramáveis e botão + Atração: fotos, luzes, pausa e cadastro de atrações."},
    {"name": "Síntese Acumulada", "description": "Aba Síntese Acumulada: resumo do evento, simular pico, mapa de calor e taxa de abandono."},
    {"name": "Vídeos do Drive", "description": "Aba Vídeos do Drive: lista e reproduz os vídeos hospedados na pasta do Google Drive."},
    {"name": "Tempo Real", "description": "Canal ao vivo conectado ao cabeçalho do site para atualizar leituras e alertas automaticamente."},
    {"name": "Sistema", "description": "Conexão com a API no cabeçalho do site e checagem se o servidor está no ar."},
]

@asynccontextmanager
async def lifespan(_app: FastAPI):
    destino = mascarar_database_url(settings.database_url) or "in-memory"
    logger.info("Repositório ativo: %s (%s)", memory_db.backend_name, destino)
    try:
        yield
    finally:
        if hasattr(memory_db, "close"):
            memory_db.close()


app = FastAPI(
    title="Venue Intelligence Core · RaizEvento API",
    version=VERSAO,
    description=DESCRICAO,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    openapi_tags=TAGS,
    lifespan=lifespan,
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

for modulo in (auth, telemetry, predicoes, ops, venue, stream, videos):
    app.include_router(modulo.router)


# ── Servir o Front-End Unificado (se frontend/dist existir) ───────────────────
_PASTA_FRONTEND = Path("frontend/dist")
if not _PASTA_FRONTEND.is_dir() and Path("dist").is_dir():
    _PASTA_FRONTEND = Path("dist")

if (_PASTA_FRONTEND / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=str(_PASTA_FRONTEND / "assets")), name="assets")


@app.get("/", include_in_schema=False)
async def raiz() -> Response:
    index_html = _PASTA_FRONTEND / "index.html"
    if index_html.is_file():
        return FileResponse(index_html)
    return RedirectResponse(url="/docs")


@app.get(
    "/status-pdvs",
    response_model=list[ Any ],
    status_code=status.HTTP_200_OK,
    tags=["Sistema"],
    summary="Conexão com a API",
    description=(
        "Resposta rápida usada apenas para medir se o servidor está respondendo e calcular o tempo de resposta em milissegundos.\n\n"
        "**Onde aparece no site:** cabeçalho do site (tempo de resposta em ms e \"Atualizado às\")."
    ),
    dependencies=[Depends(sem_query_params)],
)
async def status_pdvs_compat() -> list[Any]:
    return []


@app.get(
    "/health",
    response_model=HealthResponseContract,
    status_code=status.HTTP_200_OK,
    tags=["Sistema"],
    summary="Saúde da API",
    description=(
        "Mostra se a API está funcionando, o estado geral do evento e quantos clientes estão conectados ao vivo. Não precisa de token.\n\n"
        "**Onde aparece no site:** cabeçalho do site (selo `Estável` / `Ação em andamento`), comando `status` do Terminal CLI e checagem do servidor no Render."
    ),
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


@app.get(
    "/health/db",
    response_model=DatabaseHealthContract,
    status_code=status.HTTP_200_OK,
    tags=["Sistema"],
    summary="Saúde do Banco de Dados",
    description="Verifica a conectividade e a latência com o banco de dados ativo (PostgreSQL/Supabase ou memória).",
    dependencies=[Depends(sem_query_params)],
)
async def health_db() -> DatabaseHealthContract:
    conectado, latencia_ms, zonas, detalhe = memory_db.ping()
    return DatabaseHealthContract(
        status="ok" if conectado else "erro",
        backend=memory_db.backend_name,  # type: ignore[arg-type]
        conectado=conectado,
        latencia_ms=latencia_ms,
        zonas_carregadas=zonas,
        detalhe=detalhe,
    )


@app.get("/{caminho_completo:path}", include_in_schema=False)
async def fallback_spa(caminho_completo: str) -> Response:
    """Serve arquivos estáticos ou fallback do SPA para rotas não mapeadas pela API."""
    arquivo = _PASTA_FRONTEND / caminho_completo
    if caminho_completo and arquivo.is_file():
        return FileResponse(arquivo)
    index_html = _PASTA_FRONTEND / "index.html"
    if index_html.is_file():
        return FileResponse(index_html)
    return RedirectResponse(url="/docs")


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
