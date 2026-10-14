"""
Módulo A — Telemetria, Motor de IA e Resiliência HTTP.

`POST /api/v1/telemetry/frame-analysis` — códigos possíveis:
- 201 TEMPO_REAL        → inferência do motor de IA dentro do orçamento de 2.5 s.
- 400 CONTRATO_VIOLADO  → payload fora do contrato (exception handler de RequestValidationError).
- 502 FALLBACK_502      → `sensor_status = OFFLINE` (média histórica de 15 min).
- 504 MEDIA_MOVEL_504   → motor de IA excedeu 2.5 s (`simular_falha_ia = TIMEOUT_504`).
- 503 CONTINGENCIA_503  → motor de IA fora do ar (`simular_falha_ia = DOWN_503`) — Circuit Breaker.
Em 502/503/504 a leitura estimada é PERSISTIDA e transmitida em tempo real (graceful degradation).
"""
from __future__ import annotations

import asyncio
from typing import Annotated, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, status

from app.auth import UsuarioAutenticado, exigir_operacao
from app.config import settings
from app.contracts import (
    InferenceRequestContract,
    InferenceResponseContract,
    TelemetryAnalysisRequestContract,
    TelemetryAnalysisResponseContract,
)
from app.errors import RESPOSTA_404, RESPOSTAS_PADRAO, ResilienciaHTTPException, sem_query_params
from app.repositories.memory_db import LeituraRecord, agora_utc, memory_db
from app.services import ai_engine
from app.services.ai_engine import MotorIAIndisponivelError, ResultadoInferencia, formatar_tempo
from app.services.event_bus import criar_evento, event_bus
from app.services.mappers import leitura_para_contrato
from app.services.resilience import estimar_contingencia_503, estimar_fallback_502, estimar_media_movel_504

router = APIRouter(prefix="/api/v1", responses=RESPOSTAS_PADRAO)

_COORDS_Z1 = [
    {"x": 120.5, "y": 180.2}, {"x": 122.0, "y": 184.7}, {"x": 125.3, "y": 179.9},
    {"x": 118.1, "y": 182.4}, {"x": 121.7, "y": 177.0}, {"x": 124.9, "y": 186.3},
]

EXEMPLOS_FRAME = {
    "tempo_real_201": {
        "summary": "201 · TEMPO_REAL — Z1 com 6 pax",
        "value": {"pdv_id": 1, "sensor_status": "ONLINE", "coordenadas_simuladas": _COORDS_Z1,
                  "transacoes_pos_ultimos_3m": 4, "estoque_percentual": 42, "simular_falha_ia": "NENHUMA"},
    },
    "anomalia_nfc_ruptura_201": {
        "summary": "201 · Anomalias — NFC 45 s/pessoa, POS parado e barril 12%",
        "value": {"pdv_id": 5, "sensor_status": "ONLINE", "coordenadas_simuladas": _COORDS_Z1,
                  "transacoes_pos_ultimos_3m": 0, "estoque_percentual": 12, "taxa_nfc_seg_por_pessoa": 45,
                  "simular_falha_ia": "NENHUMA"},
    },
    "sensor_offline_502": {
        "summary": "502 · FALLBACK_502 — sensor OFFLINE",
        "value": {"pdv_id": 5, "sensor_status": "OFFLINE", "coordenadas_simuladas": [],
                  "transacoes_pos_ultimos_3m": 12, "estoque_percentual": 12, "simular_falha_ia": "NENHUMA"},
    },
    "timeout_ia_504": {
        "summary": "504 · MEDIA_MOVEL_504 — timeout do motor de IA (> 2.5 s)",
        "value": {"pdv_id": 1, "sensor_status": "ONLINE", "coordenadas_simuladas": _COORDS_Z1,
                  "transacoes_pos_ultimos_3m": 4, "estoque_percentual": 42, "simular_falha_ia": "TIMEOUT_504"},
    },
    "ia_fora_do_ar_503": {
        "summary": "503 · CONTINGENCIA_503 — motor de IA fora do ar",
        "value": {"pdv_id": 1, "sensor_status": "ONLINE", "coordenadas_simuladas": _COORDS_Z1,
                  "transacoes_pos_ultimos_3m": 6, "estoque_percentual": 42, "simular_falha_ia": "DOWN_503"},
    },
    "contrato_invalido_400": {
        "summary": "400 · CONTRATO_VIOLADO — campo extra + coordenada fora de 0..1000",
        "value": {"pdv_id": 1, "sensor_status": "ONLINE", "coordenadas_simuladas": [{"x": 1500, "y": 10}],
                  "transacoes_pos_ultimos_3m": 4, "rosto_id": "abc-123"},
    },
}

_AVISOS = {
    "FALLBACK_502": "Sensor OFFLINE: leitura estimada pela média histórica do PDV ({base}).",
    "MEDIA_MOVEL_504": "Motor de IA excedeu o orçamento de {timeout}s: Graceful Degradation pela {base}.",
    "CONTINGENCIA_503": "Motor de IA indisponível: Circuit Breaker aberto, fila calculada exclusivamente pelo POS ({base}).",
}
_STATUS_POR_MODO = {"TEMPO_REAL": 201, "FALLBACK_502": 502, "MEDIA_MOVEL_504": 504, "CONTINGENCIA_503": 503}

_resposta_resiliencia = {"model": TelemetryAnalysisResponseContract}
RESPOSTAS_FRAME = {
    **RESPOSTA_404,
    502: {**_resposta_resiliencia, "description": "Bad Gateway — sensor OFFLINE; estimativa FALLBACK_502 (média 15 min)."},
    503: {**_resposta_resiliencia, "description": "Service Unavailable — motor de IA fora do ar; CONTINGENCIA_503 (POS)."},
    504: {**_resposta_resiliencia, "description": "Gateway Timeout — IA > 2.5 s; MEDIA_MOVEL_504 (média 3 min)."},
}


@router.post(
    "/telemetry/frame-analysis",
    response_model=TelemetryAnalysisResponseContract,
    status_code=status.HTTP_201_CREATED,
    tags=["Módulo A · Telemetria & Resiliência"],
    summary="Ingestão de frame de telemetria com Matriz de Resiliência (400/502/503/504)",
    description=(
        "Recebe o pacote anônimo dos sensores, aciona o motor interno de IA e grava a leitura em memória, "
        "transmitindo-a via WebSocket/SSE.\n\n"
        "**Use o seletor de exemplos** para reproduzir cada código: `201` tempo real · `400` contrato inválido · "
        "`502` sensor OFFLINE · `504` timeout da IA · `503` IA fora do ar.\n\n"
        "Requer papel `operador` ou `admin`."
    ),
    responses=RESPOSTAS_FRAME,
    dependencies=[Depends(sem_query_params)],
)
async def analisar_frame(
    pacote: Annotated[TelemetryAnalysisRequestContract, Body(openapi_examples=EXEMPLOS_FRAME)],
    usuario: UsuarioAutenticado = Depends(exigir_operacao),
) -> TelemetryAnalysisResponseContract:
    zona = memory_db.obter_zona(pacote.pdv_id)
    if zona is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Zona/PDV {pacote.pdv_id} não existe (ver GET /api/v1/pdv/status).")

    pax_bruto = len(pacote.coordenadas_simuladas)
    base: Optional[str] = None
    resultado: ResultadoInferencia

    if pacote.sensor_status == "OFFLINE":
        modo = "FALLBACK_502"
        resultado, base = estimar_fallback_502(
            zona, pacote.transacoes_pos_ultimos_3m, pacote.estoque_percentual, pacote.taxa_nfc_seg_por_pessoa
        )
    else:
        try:
            resultado = await ai_engine.inferir_com_timeout(
                zona, pax_bruto, pacote.transacoes_pos_ultimos_3m, pacote.estoque_percentual,
                pacote.taxa_nfc_seg_por_pessoa, pacote.simular_falha_ia,
            )
            modo = "TEMPO_REAL"
            memory_db.definir_motor_ia_online(True)  # half-open → fechado após sucesso
        except asyncio.TimeoutError:
            modo = "MEDIA_MOVEL_504"
            resultado, base = estimar_media_movel_504(
                zona, pax_bruto, pacote.transacoes_pos_ultimos_3m, pacote.estoque_percentual,
                pacote.taxa_nfc_seg_por_pessoa,
            )
        except MotorIAIndisponivelError:
            modo = "CONTINGENCIA_503"
            memory_db.definir_motor_ia_online(False)  # Circuit Breaker aberto
            resultado = estimar_contingencia_503(
                zona, pax_bruto, pacote.transacoes_pos_ultimos_3m, pacote.estoque_percentual,
                pacote.taxa_nfc_seg_por_pessoa,
            )
            ritmo = round(pacote.transacoes_pos_ultimos_3m / 3, 2)
            base = f"{ritmo} atend./min no POS para {pax_bruto} pax"

    anterior = memory_db.ultima_leitura(zona.id)
    registro = memory_db.registrar_leitura(
        LeituraRecord(
            id=0, pdv_id=zona.id, timestamp=agora_utc(), pax_count=resultado.pax_count,
            tempo_espera_seg=resultado.tempo_espera_seg, densidade_m2=resultado.densidade_m2,
            status_cor=resultado.status_cor, confianca_ia=resultado.confianca_ia,
            alerta_ruptura_estoque=resultado.alerta_ruptura_estoque, anomalias=resultado.anomalias,
            modo_leitura=modo, sensor_status=pacote.sensor_status,
            transacoes_pos_ultimos_3m=pacote.transacoes_pos_ultimos_3m, estoque_percentual=pacote.estoque_percentual,
        )
    )
    leitura = leitura_para_contrato(registro)

    event_bus.publicar(criar_evento("leitura", f"Leitura {modo} no PDV {zona.id} ({zona.nome})", leitura=leitura))
    if anterior is not None and anterior.status_cor != registro.status_cor:
        event_bus.publicar(
            criar_evento("mudanca_cor", f"{zona.nome}: {anterior.status_cor} → {registro.status_cor}", leitura=leitura)
        )

    http_status = _STATUS_POR_MODO[modo]
    resposta = TelemetryAnalysisResponseContract(
        sucesso=modo == "TEMPO_REAL",
        http_status=http_status,  # type: ignore[arg-type]
        modo_leitura=modo,  # type: ignore[arg-type]
        aviso_contingencia=None if base is None else _AVISOS[modo].format(base=base, timeout=settings.ai_timeout_seg),
        leitura=leitura,
    )
    if http_status != 201:
        headers = {"X-Modo-Leitura": modo}
        if http_status == 503:
            headers["Retry-After"] = "30"
        raise ResilienciaHTTPException(http_status, resposta, headers)
    return resposta


@router.post(
    "/inferencia",
    response_model=InferenceResponseContract,
    status_code=status.HTTP_200_OK,
    tags=["Módulo A · Telemetria & Resiliência"],
    summary="Motor de IA isolado: pax, espera, densidade, semáforo e ruptura",
    description=(
        "Executa o motor interno de IA **sem persistir** a leitura. Útil para validar a calibração:\n"
        "- `status_cor`: VERDE < 300 s · AMARELO 300..720 s · VERMELHO > 720 s\n"
        "- `alerta_ruptura_estoque`: pax ≥ 6 com 0 vendas no POS (zonas BAR) ou barril ≤ 12%\n"
        "- `taxa_nfc_seg_por_pessoa` ≥ 45 → anomalia `NFC_LENTO`\n\n"
        "PDV inexistente usa a calibração de referência do estande (6 pax → 2m 40s). Requer `operador`/`admin`."
    ),
    dependencies=[Depends(sem_query_params)],
)
async def processar_inferencia(
    payload: InferenceRequestContract,
    usuario: UsuarioAutenticado = Depends(exigir_operacao),
) -> InferenceResponseContract:
    zona = memory_db.obter_zona(payload.pdv_id) or ai_engine.ZONA_REFERENCIA
    r = ai_engine.calcular_inferencia(
        zona, len(payload.coordenadas_simuladas), payload.transacoes_pos_ultimos_3m,
        payload.estoque_percentual, payload.taxa_nfc_seg_por_pessoa,
    )
    return InferenceResponseContract(
        pdv_id=payload.pdv_id,
        pax_count=r.pax_count,
        tempo_espera_seg=r.tempo_espera_seg,
        tempo_espera_fmt=formatar_tempo(r.tempo_espera_seg),
        densidade_m2=r.densidade_m2,
        status_cor=r.status_cor,  # type: ignore[arg-type]
        confianca_ia=r.confianca_ia,
        alerta_ruptura_estoque=r.alerta_ruptura_estoque,
        anomalias=r.anomalias,  # type: ignore[arg-type]
        tempo_estimado_reposicao_min=r.tempo_estimado_reposicao_min,
    )

