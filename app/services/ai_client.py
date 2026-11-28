"""
Cliente HTTP entre o Backend (`app/`) e o serviço separado do Mecanismo de IA.

- Quando `AI_ENGINE_URL` está configurada no ambiente (deploy separado no Render),
  envia requisições HTTP para `/ai/v1/*` com cabeçalho opcional `X-AI-Secret`.
- Quando `AI_ENGINE_URL` está vazia, usa o fallback local em processo para manter
  o ambiente local e os testes funcionando sem precisar subir o segundo servidor.
"""
from __future__ import annotations

import asyncio
import logging
from typing import List, Optional, Sequence

import httpx

from app.config import settings
from app.contracts import (
    CoordinateContract,
    PredicaoFilaZonaContract,
    PredicoesFilasResponseContract,
    ZonaHistoricoPredicaoContract,
)
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


def _calcular_predicoes_fallback(
    zonas_historico: Sequence[ZonaHistoricoPredicaoContract],
    limite_espera_min: float,
) -> PredicoesFilasResponseContract:
    previsoes: List[PredicaoFilaZonaContract] = []
    for zona in zonas_historico:
        amostras = sorted(zona.amostras, key=lambda a: a.timestamp_ms)
        n = len(amostras)
        atual = round(amostras[-1].espera_min, 2) if n > 0 else 0.0
        if n < 5:
            previsoes.append(
                PredicaoFilaZonaContract(
                    zona_id=zona.zona_id,
                    nome=zona.nome,
                    setor=zona.setor,
                    amostras_usadas=n,
                    suficiente=False,
                    espera_atual_min=atual,
                    confianca_pct=0.0,
                    nivel_alerta="COLETANDO",
                )
            )
            continue

        t0 = amostras[0].timestamp_ms
        xs = [(a.timestamp_ms - t0) / 60000.0 for a in amostras]
        ys = [a.espera_min for a in amostras]
        mx = sum(xs) / n
        my = sum(ys) / n
        sxx = sum((xs[i] - mx) ** 2 for i in range(n))
        if sxx == 0:
            previsoes.append(
                PredicaoFilaZonaContract(
                    zona_id=zona.zona_id,
                    nome=zona.nome,
                    setor=zona.setor,
                    amostras_usadas=n,
                    suficiente=False,
                    espera_atual_min=atual,
                    confianca_pct=0.0,
                    nivel_alerta="COLETANDO",
                )
            )
            continue

        sxy = sum((xs[i] - mx) * (ys[i] - my) for i in range(n))
        syy = sum((ys[i] - my) ** 2 for i in range(n))
        inclinacao = sxy / sxx
        intercepto = my - inclinacao * mx
        r2 = 0.0 if syy == 0 else (sxy * sxy) / (sxx * syy)
        agora = xs[-1]
        confianca = max(0.0, min(1.0, r2 * min(1.0, n / 12.0)))

        if atual >= limite_espera_min:
            minutos_ate_limite: Optional[float] = 0.0
            nivel_alerta = "ESTOUROU"
        else:
            minutos_ate_limite = round((limite_espera_min - atual) / inclinacao, 1) if inclinacao > 0.05 else None
            if minutos_ate_limite is not None and confianca >= 0.4:
                if minutos_ate_limite <= 5.0:
                    nivel_alerta = "URGENTE"
                elif minutos_ate_limite <= 15.0:
                    nivel_alerta = "AVISO"
                else:
                    nivel_alerta = "ESTAVEL"
            else:
                nivel_alerta = "ESTAVEL"

        previsoes.append(
            PredicaoFilaZonaContract(
                zona_id=zona.zona_id,
                nome=zona.nome,
                setor=zona.setor,
                amostras_usadas=n,
                suficiente=True,
                espera_atual_min=atual,
                projecao_5m=round(max(0.0, intercepto + inclinacao * (agora + 5.0)), 2),
                projecao_10m=round(max(0.0, intercepto + inclinacao * (agora + 10.0)), 2),
                projecao_15m=round(max(0.0, intercepto + inclinacao * (agora + 15.0)), 2),
                velocidade_min_por_min=round(inclinacao, 3),
                minutos_ate_limite=minutos_ate_limite,
                confianca_pct=round(confianca * 100.0, 1),
                nivel_alerta=nivel_alerta,  # type: ignore[arg-type]
            )
        )

    alertas = sum(1 for p in previsoes if p.nivel_alerta in ("ESTOUROU", "URGENTE", "AVISO"))
    return PredicoesFilasResponseContract(
        limite_espera_min=limite_espera_min,
        total_zonas=len(previsoes),
        alertas_ativos=alertas,
        previsoes=previsoes,
    )


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
    zonas_historico: Sequence[ZonaHistoricoPredicaoContract],
    limite_espera_min: float = 8.0,
) -> PredicoesFilasResponseContract:
    url = _ai_engine_url()
    if not url:
        return _calcular_predicoes_fallback(zonas_historico, limite_espera_min)

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
    return PredicoesFilasResponseContract.model_validate(resp.json())
