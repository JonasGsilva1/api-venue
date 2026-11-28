"""
Cliente HTTP entre o Backend (`app/`) e o Mecanismo de IA (`ai_service/`).

- Quando `AI_ENGINE_URL` está configurada no ambiente (ex.: deploy separado no Render),
  envia requisições HTTP para `/ai/v1/*` com cabeçalho opcional `X-AI-Secret`.
- Quando `AI_ENGINE_URL` está vazia, executa em processo via `ai_engine`, `yolo_vision`
  e `ai_service.prediction` para manter compatibilidade local e nos testes existentes.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Optional, Sequence

import httpx

from ai_service.contracts import AiPredicaoResponse, ZonaHistoricoPredicao
from ai_service.prediction import calcular_predicoes_lote
from app.config import settings
from app.contracts import CoordinateContract
from app.repositories.memory_db import ZonaRecord
from app.services import ai_engine, yolo_vision
from app.services.ai_engine import MotorIAIndisponivelError, ResultadoInferencia
from app.services.yolo_vision import ResultadoVisaoYolo

logger = logging.getLogger(__name__)


def _ai_engine_url() -> str:
    return str(getattr(settings, "ai_engine_url", "") or "").strip().strip('"').strip("'").rstrip("/")


def _ai_engine_secret() -> str:
    return str(getattr(settings, "ai_engine_secret", "") or "").strip().strip('"').strip("'")


def _ai_timeout_seg() -> float:
    return float(getattr(settings, "ai_timeout_seg", 2.5))


def _headers() -> dict[str, str]:
    segredo = _ai_engine_secret()
    return {"X-AI-Secret": segredo} if segredo else {}


def _criar_async_client(timeout: float) -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=timeout)


async def inferir_com_timeout(
    zona: ZonaRecord,
    pax: int,
    taxa_nfc: Optional[int],
    simular_falha: str = "NENHUMA",
) -> ResultadoInferencia:
    url = _ai_engine_url()
    if not url:
        return await ai_engine.inferir_com_timeout(zona, pax, taxa_nfc, simular_falha)

    payload = {
        "pdv_id": max(1, zona.id),
        "area_m2": zona.area_m2,
        "tempo_servico_seg": zona.tempo_servico_seg,
        "postos_atendimento": zona.postos_atendimento,
        "pax_count": pax,
        "taxa_nfc_seg_por_pessoa": taxa_nfc,
        "simular_falha_ia": simular_falha,
    }
    try:
        async with _criar_async_client(_ai_timeout_seg()) as client:
            resp = await asyncio.wait_for(
                client.post(f"{url}/ai/v1/inferencia", json=payload, headers=_headers()),
                timeout=_ai_timeout_seg(),
            )
    except (httpx.TimeoutException, asyncio.TimeoutError) as exc:
        raise asyncio.TimeoutError() from exc
    except httpx.HTTPError as exc:
        logger.warning("Falha de rede ao chamar Mecanismo de IA: tipo=%s", type(exc).__name__)
        raise MotorIAIndisponivelError("Falha ao conectar ao Mecanismo de IA.") from exc

    if resp.status_code >= 500 or resp.status_code in (401, 403):
        raise MotorIAIndisponivelError(f"Mecanismo de IA respondeu com HTTP {resp.status_code}.")
    resp.raise_for_status()
    dados = resp.json()
    return ResultadoInferencia(
        pax_count=dados["pax_count"],
        tempo_espera_seg=dados["tempo_espera_seg"],
        densidade_m2=dados["densidade_m2"],
        status_cor=dados["status_cor"],
        confianca_ia=dados["confianca_ia"],
        anomalias=list(dados.get("anomalias", [])),
    )


async def calcular_inferencia(
    zona: ZonaRecord,
    pax: int,
    taxa_nfc: Optional[int],
) -> ResultadoInferencia:
    url = _ai_engine_url()
    if not url:
        return ai_engine.calcular_inferencia(zona, pax, taxa_nfc)
    try:
        return await inferir_com_timeout(zona, pax, taxa_nfc, simular_falha="NENHUMA")
    except asyncio.TimeoutError as exc:
        raise MotorIAIndisponivelError("Mecanismo de IA excedeu o tempo limite.") from exc


async def escanear_frame_yolo(
    video_origem: str = "video_teste_04.mp4",
    frame_indice: int = 3,
    pessoas_fila_simuladas: Optional[int] = None,
    pessoas_estande_simuladas: Optional[int] = None,
) -> ResultadoVisaoYolo:
    url = _ai_engine_url()
    if not url:
        return yolo_vision.processar_frame_yolo(
            video_origem=video_origem,
            frame_indice=frame_indice,
            pessoas_fila_simuladas=pessoas_fila_simuladas,
            pessoas_estande_simuladas=pessoas_estande_simuladas,
        )

    payload = {
        "video_origem": video_origem,
        "frame_indice": frame_indice,
        "pessoas_fila_simuladas": pessoas_fila_simuladas,
        "pessoas_estande_simuladas": pessoas_estande_simuladas,
    }
    try:
        async with _criar_async_client(max(5.0, _ai_timeout_seg())) as client:
            resp = await client.post(f"{url}/ai/v1/yolo-scan", json=payload, headers=_headers())
    except (httpx.TimeoutException, httpx.HTTPError) as exc:
        logger.warning("Falha ao chamar /ai/v1/yolo-scan: tipo=%s", type(exc).__name__)
        raise MotorIAIndisponivelError("Mecanismo de IA indisponível para visão computacional.") from exc

    if resp.status_code >= 500 or resp.status_code in (401, 403):
        raise MotorIAIndisponivelError(f"Mecanismo de IA respondeu com HTTP {resp.status_code}.")
    resp.raise_for_status()
    dados = resp.json()
    return ResultadoVisaoYolo(
        motor_visao=dados["motor_visao"],
        resolucao_frame=dados["resolucao_frame"],
        frame_processado=dados["frame_processado"],
        coordenadas_fila=[CoordinateContract(x=c["x"], y=c["y"]) for c in dados["coordenadas_fila"]],
        coordenadas_estande=[CoordinateContract(x=c["x"], y=c["y"]) for c in dados["coordenadas_estande"]],
    )


async def calcular_predicoes_filas(
    zonas_historico: Sequence[ZonaHistoricoPredicao],
    limite_espera_min: float = 8.0,
) -> AiPredicaoResponse:
    url = _ai_engine_url()
    if not url:
        return calcular_predicoes_lote(zonas_historico, limite_espera_min)

    payload = {
        "zonas": [z.model_dump(mode="json") for z in zonas_historico],
        "limite_espera_min": limite_espera_min,
    }
    try:
        async with _criar_async_client(max(5.0, _ai_timeout_seg())) as client:
            resp = await client.post(f"{url}/ai/v1/predicoes/calcular", json=payload, headers=_headers())
    except (httpx.TimeoutException, httpx.HTTPError) as exc:
        logger.warning("Falha ao chamar /ai/v1/predicoes/calcular: tipo=%s", type(exc).__name__)
        raise MotorIAIndisponivelError("Mecanismo de IA indisponível para calcular predições.") from exc

    if resp.status_code >= 500 or resp.status_code in (401, 403):
        raise MotorIAIndisponivelError(f"Mecanismo de IA respondeu com HTTP {resp.status_code}.")
    resp.raise_for_status()
    return AiPredicaoResponse.model_validate(resp.json())
