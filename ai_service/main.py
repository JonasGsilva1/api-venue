"""
Aplicação FastAPI independente do Mecanismo de IA (`ai_service`, porta padrão 8001).

Não acessa banco de dados nem armazena estado: recebe números/histórico via HTTP,
executa visão computacional, cálculo de fila ou predição e devolve o resultado em JSON.
"""
from __future__ import annotations

import hmac
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

try:
    from .config import ai_settings
    from .contracts import (
        AiHealthResponse,
        AiInferenciaRequest,
        AiInferenciaResponse,
        AiPredicaoRequest,
        AiPredicaoResponse,
        AiYoloScanRequest,
        AiYoloScanResponse,
    )
    from .inference import MotorIAIndisponivelError, executar_inferencia, formatar_tempo
    from .prediction import calcular_predicoes_lote
    from .vision import motor_visao_disponivel, processar_frame_yolo
except ImportError:  # pragma: no cover - quando rodado de dentro de ai_service/
    from config import ai_settings
    from contracts import (
        AiHealthResponse,
        AiInferenciaRequest,
        AiInferenciaResponse,
        AiPredicaoRequest,
        AiPredicaoResponse,
        AiYoloScanRequest,
        AiYoloScanResponse,
    )
    from inference import MotorIAIndisponivelError, executar_inferencia, formatar_tempo
    from prediction import calcular_predicoes_lote
    from vision import motor_visao_disponivel, processar_frame_yolo

DESCRICAO = """
API independente do **Mecanismo de IA** (Visão Computacional YOLOv8n + Cálculo de Filas + Predição de Gargalos).

- **Stateless:** não acessa o banco de dados diretamente; recebe os dados do Backend e devolve os cálculos prontos.
- **Segurança entre serviços:** se `AI_ENGINE_SECRET` estiver configurada no servidor, as rotas `/ai/v1/*` exigem o cabeçalho `X-AI-Secret`.
"""

app = FastAPI(
    title="Venue Intelligence · Mecanismo de IA",
    version="1.0.0",
    description=DESCRICAO,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(ai_settings.cors_origins),
    allow_credentials="*" not in ai_settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def _erro_validacao(_request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"erro": "CONTRATO_VIOLADO", "mensagem": "Payload inválido para o motor de IA.", "detalhes": exc.errors()},
    )


def _verificar_segredo_ia(x_ai_secret: Optional[str] = Header(None, alias="X-AI-Secret")) -> None:
    segredo = ai_settings.secret
    if segredo and not hmac.compare_digest(x_ai_secret or "", segredo):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Cabeçalho X-AI-Secret ausente ou inválido.",
        )


@app.get(
    "/ai/v1/health",
    response_model=AiHealthResponse,
    tags=["Sistema"],
    summary="Verificar se o Mecanismo de IA está no ar",
    description="Retorna o status de saúde do serviço de IA e se as bibliotecas locais do YOLO estão instaladas.",
)
async def ai_health() -> AiHealthResponse:
    return AiHealthResponse(
        status="ok",
        servico="venue-intelligence-ai",
        versao="1.0.0",
        motor_visao_disponivel=motor_visao_disponivel(),
    )


@app.post(
    "/ai/v1/inferencia",
    response_model=AiInferenciaResponse,
    tags=["Inferência & Filas"],
    summary="Calcular tempo de espera, densidade e semáforo",
    description="Recebe os dados da zona e a contagem de pessoas/NFC, calcula espera, densidade e detecta anomalias.",
    dependencies=[Depends(_verificar_segredo_ia)],
)
async def inferir(payload: AiInferenciaRequest) -> AiInferenciaResponse:
    try:
        r = await executar_inferencia(
            area_m2=payload.area_m2,
            tempo_servico_seg=payload.tempo_servico_seg,
            postos_atendimento=payload.postos_atendimento,
            pax=payload.pax_count,
            taxa_nfc=payload.taxa_nfc_seg_por_pessoa,
            simular_falha=payload.simular_falha_ia,
            timeout_seg=ai_settings.timeout_seg,
        )
    except MotorIAIndisponivelError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    return AiInferenciaResponse(
        pdv_id=payload.pdv_id,
        pax_count=r.pax_count,
        tempo_espera_seg=r.tempo_espera_seg,
        tempo_espera_fmt=formatar_tempo(r.tempo_espera_seg),
        densidade_m2=r.densidade_m2,
        status_cor=r.status_cor,  # type: ignore[arg-type]
        confianca_ia=r.confianca_ia,
        anomalias=r.anomalias,  # type: ignore[arg-type]
    )


@app.post(
    "/ai/v1/yolo-scan",
    response_model=AiYoloScanResponse,
    tags=["Visão Computacional"],
    summary="Analisar frame de vídeo (YOLOv8n / simulação)",
    description="Detecta pessoas nas zonas de fila e estande e devolve apenas coordenadas anônimas normalizadas (0..1000).",
    dependencies=[Depends(_verificar_segredo_ia)],
)
async def yolo_scan(payload: AiYoloScanRequest) -> AiYoloScanResponse:
    visao = processar_frame_yolo(
        video_origem=payload.video_origem,
        frame_indice=payload.frame_indice,
        pessoas_fila_simuladas=payload.pessoas_fila_simuladas,
        pessoas_estande_simuladas=payload.pessoas_estande_simuladas,
    )
    return AiYoloScanResponse(
        motor_visao=visao.motor_visao,  # type: ignore[arg-type]
        resolucao_frame=visao.resolucao_frame,
        frame_processado=visao.frame_processado,
        coordenadas_fila=visao.coordenadas_fila,
        coordenadas_estande=visao.coordenadas_estande,
    )


@app.post(
    "/ai/v1/predicoes/calcular",
    response_model=AiPredicaoResponse,
    tags=["Predição de Gargalos"],
    summary="Calcular predição de filas (+5, +10, +15 min)",
    description=(
        "Recebe uma lista de horários e tempos de espera por zona, ajusta a reta de tendência "
        "e devolve as projeções futuras, confiança (%) e nível de alerta."
    ),
    dependencies=[Depends(_verificar_segredo_ia)],
)
async def calcular_predicoes(payload: AiPredicaoRequest) -> AiPredicaoResponse:
    return calcular_predicoes_lote(payload.zonas, payload.limite_espera_min)
