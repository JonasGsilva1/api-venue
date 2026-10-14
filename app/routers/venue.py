"""Módulo D — Painel do Estande, Mapa de Calor e Analytics (Slides S01 a S10)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, status

from app.auth import UsuarioAutenticado, exigir_leitura
from app.config import settings
from app.contracts import (
    AcumuladoEventoContract,
    AnalyticsDropoffResponseContract,
    HeatmapGlobalContract,
    PdvStatusResponseContract,
    PublicoPorDiaContract,
    ReadinessHeatmapResponseContract,
)
from app.errors import RESPOSTAS_PADRAO, sem_query_params
from app.repositories.memory_db import agora_utc, memory_db
from app.services.mappers import readiness_contrato, zona_para_contrato

router = APIRouter(prefix="/api/v1", tags=["Módulo D · Painel, Heatmap & Analytics"], responses=RESPOSTAS_PADRAO)

# Limiar da RAIZ: deslocamento + fila >= 25 min numa janela de 30 min → Drop-off > 80%.
RAZAO_CRITICA_DROPOFF = 25 / 30


@router.get(
    "/pdv/status",
    response_model=PdvStatusResponseContract,
    status_code=status.HTTP_200_OK,
    summary="Status em tempo real de todas as zonas monitoradas",
    description=(
        "Zonas Z1, Z2, Z3, Z5 e Bar Principal Norte com indicadores do seed, última leitura e "
        "`habilitar_redirecionamento_push` (**true somente quando `tempo_espera_seg > 180`** — Paradoxo do Roteamento)."
    ),
    dependencies=[Depends(sem_query_params)],
)
async def status_pdvs(usuario: UsuarioAutenticado = Depends(exigir_leitura)) -> PdvStatusResponseContract:
    zonas = [zona_para_contrato(z, memory_db.ultima_leitura(z.id)) for z in memory_db.listar_zonas()]
    return PdvStatusResponseContract(
        total_zonas=len(zonas),
        status_operacional_evento=memory_db.status_operacional,  # type: ignore[arg-type]
        atualizado_em=agora_utc(),
        zonas=zonas,
    )


@router.get(
    "/venue/readiness-heatmap",
    response_model=ReadinessHeatmapResponseContract,
    status_code=status.HTTP_200_OK,
    summary="Readiness pós-montagem (S01 + hardware) e mapa de calor global (S06)",
    description=(
        "`readiness`: sensores, fontes online, 12 câmeras neurais, 54 sensores IoT de barris, LiDAR 60 FPS, "
        "estoque inicial, rota livre (PCD) e estado do motor de IA (Circuit Breaker).\n\n"
        "`heatmap_global`: indicadores S06; `estado_operacional` acompanha o status global do evento."
    ),
    dependencies=[Depends(sem_query_params)],
)
async def readiness_heatmap(usuario: UsuarioAutenticado = Depends(exigir_leitura)) -> ReadinessHeatmapResponseContract:
    return ReadinessHeatmapResponseContract(
        readiness=readiness_contrato(memory_db),
        heatmap_global=HeatmapGlobalContract(**memory_db.heatmap()),  # type: ignore[arg-type]
        gerado_em=agora_utc(),
    )


@router.get(
    "/analytics/dropoff-summary",
    response_model=AnalyticsDropoffResponseContract,
    status_code=status.HTTP_200_OK,
    summary="Perda de receita (Window/Queue Time, Density Point, Drop-off, CES) e síntese D1-D3",
    description=(
        "- `queue_time_medio_min`: média das últimas leituras das zonas **BAR**.\n"
        "- `dropoff_rate_estimado_pct`: razão (deslocamento + fila) / window time; acima de 25/30 supera 80%.\n"
        "- `ces_score`: 1 + 4 × razão (1 = esforço baixo, 5 = alto).\n"
        "- `acumulado_evento`: síntese D1-D3 do Slide S10 (960 pessoas)."
    ),
    dependencies=[Depends(sem_query_params)],
)
async def dropoff_summary(usuario: UsuarioAutenticado = Depends(exigir_leitura)) -> AnalyticsDropoffResponseContract:
    ultimas = [(z, memory_db.ultima_leitura(z.id)) for z in memory_db.listar_zonas()]
    filas = [l.tempo_espera_seg for z, l in ultimas if l is not None and z.tipo == "BAR"]
    queue_min = (sum(filas) / len(filas) / 60) if filas else 0.0

    window = settings.window_time_min
    razao = (settings.deslocamento_medio_min + queue_min) / window
    if razao >= RAZAO_CRITICA_DROPOFF:
        dropoff = 81 + 19 * ((min(razao, 1.0) - RAZAO_CRITICA_DROPOFF) / (1 - RAZAO_CRITICA_DROPOFF))
    else:
        dropoff = 80 * (razao / RAZAO_CRITICA_DROPOFF) ** 2

    acc = memory_db.acumulado()
    return AnalyticsDropoffResponseContract(
        window_time_min=window,
        queue_time_medio_min=round(queue_min, 2),
        density_point_atingido=any(l is not None and l.status_cor == "VERMELHO" for _, l in ultimas),
        dropoff_rate_estimado_pct=round(min(max(dropoff, 0.0), 100.0), 1),
        ces_score=round(min(max(1 + 4 * razao, 1.0), 5.0), 1),
        acumulado_evento=AcumuladoEventoContract(
            publico_acumulado=acc.publico_acumulado,
            publico_por_dia=PublicoPorDiaContract(**acc.publico_por_dia),
            atendimentos_cortesia=acc.atendimentos_cortesia,
            bebidas_unidades=acc.bebidas_unidades,
            autosservico_retiradas=acc.autosservico_retiradas,
            engajamento_interacoes=acc.engajamento_interacoes,
        ),
    )
