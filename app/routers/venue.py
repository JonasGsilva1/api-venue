"""Módulo C — Telemetria das 7 Câmeras, Mapa de Calor, Ativações e Analytics."""
from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import UsuarioAutenticado, exigir_leitura, exigir_operacao
from app.config import settings
from app.contracts import (
    AcumuladoEventoContract,
    AnalyticsDropoffResponseContract,
    CamerasResponseContract,
    CameraTelemetryItemContract,
    CriarAtracaoRequestContract,
    HeatmapGlobalContract,
    InstagramavelItemContract,
    ModoLuzRequestContract,
    PdvStatusResponseContract,
    PublicoPorDiaContract,
    ReadinessHeatmapResponseContract,
    SinteseAcumuladaContract,
)
from app.errors import RESPOSTAS_PADRAO, sem_query_params
from app.repositories.memory_db import agora_utc, memory_db
from app.services.mappers import (
    camera_para_contrato,
    instagramavel_para_contrato,
    readiness_contrato,
    zona_para_contrato,
)

router = APIRouter(prefix="/api/v1", tags=["Módulo C · Câmeras, Heatmap & Analytics"], responses=RESPOSTAS_PADRAO)

# Limiar da RAIZ: deslocamento + fila >= 25 min numa janela de 30 min → Drop-off > 80%.
RAZAO_CRITICA_DROPOFF = 25 / 30


@router.get(
    "/pdv/status",
    response_model=PdvStatusResponseContract,
    status_code=status.HTTP_200_OK,
    summary="Status em tempo real de todas as zonas monitoradas por câmeras",
    description=(
        "Zonas Z1, Z2, Z3, Z5 e Corredor de Acesso Norte com indicadores do seed, última leitura e "
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
    summary="Readiness de câmeras/sensores e mapa de calor global",
    description=(
        "`readiness`: sensores ativos, fontes online, 7 câmeras neurais ativas, LiDAR 60 FPS, "
        "rota livre (PCD) e estado do motor de IA (Circuit Breaker).\n\n"
        "`heatmap_global`: indicadores globais de ocupação e densidade; `estado_operacional` acompanha o status global do evento."
    ),
    dependencies=[Depends(sem_query_params)],
)
async def readiness_heatmap(usuario: UsuarioAutenticado = Depends(exigir_leitura)) -> ReadinessHeatmapResponseContract:
    readiness_data = readiness_contrato(memory_db)
    heatmap_data = HeatmapGlobalContract(**memory_db.heatmap())  # type: ignore[arg-type]
    return ReadinessHeatmapResponseContract(
        readiness=readiness_data,
        heatmap_global=heatmap_data,
        prontidao=readiness_data,
        mapa_calor_global=heatmap_data,
        gerado_em=agora_utc(),
    )


@router.get(
    "/analytics/dropoff-summary",
    response_model=AnalyticsDropoffResponseContract,
    status_code=status.HTTP_200_OK,
    summary="Análise de abandono de fila (Window/Queue Time, Density Point, Drop-off, CES) e síntese D1-D3",
    description=(
        "- `queue_time_medio_min`: média das últimas leituras das zonas de acesso e circulação.\n"
        "- `dropoff_rate_estimado_pct`: razão (deslocamento + fila) / window time; acima de 25/30 supera 80%.\n"
        "- `ces_score`: 1 + 4 × razão (1 = esforço baixo, 5 = alto).\n"
        "- `acumulado_evento`: síntese D1-D3 do público (960 pessoas)."
    ),
    dependencies=[Depends(sem_query_params)],
)
async def dropoff_summary(usuario: UsuarioAutenticado = Depends(exigir_leitura)) -> AnalyticsDropoffResponseContract:
    ultimas = [(z, memory_db.ultima_leitura(z.id)) for z in memory_db.listar_zonas()]
    filas = [l.tempo_espera_seg for z, l in ultimas if l is not None and z.tipo in ("CATRACA", "BAR")]
    queue_min = (sum(filas) / len(filas) / 60) if filas else 0.0

    window = settings.window_time_min
    razao = (settings.deslocamento_medio_min + queue_min) / window
    if razao >= RAZAO_CRITICA_DROPOFF:
        dropoff = 81 + 19 * ((min(razao, 1.0) - RAZAO_CRITICA_DROPOFF) / (1 - RAZAO_CRITICA_DROPOFF))
    else:
        dropoff = 80 * (razao / RAZAO_CRITICA_DROPOFF) ** 2

    acc = memory_db.acumulado()
    q_min_round = round(queue_min, 2)
    density_hit = any(l is not None and l.status_cor == "VERMELHO" for _, l in ultimas)
    dropoff_round = round(min(max(dropoff, 0.0), 100.0), 1)
    ces_round = round(min(max(1 + 4 * razao, 1.0), 5.0), 1)

    return AnalyticsDropoffResponseContract(
        window_time_min=window,
        queue_time_medio_min=q_min_round,
        density_point_atingido=density_hit,
        dropoff_rate_estimado_pct=dropoff_round,
        ces_score=ces_round,
        acumulado_evento=AcumuladoEventoContract(
            publico_acumulado=acc.publico_acumulado,
            publico_por_dia=PublicoPorDiaContract(**acc.publico_por_dia),
            atendimentos_cortesia=acc.atendimentos_cortesia,
            engajamento_interacoes=acc.engajamento_interacoes,
        ),
        janela_tempo_min=window,
        tempo_medio_fila_min=q_min_round,
        ponto_densidade_atingido=density_hit,
        taxa_abandono_estimada_pct=dropoff_round,
        pontuacao_esforco_ces=ces_round,
    )


# ════════════════════════════════════════════════════════════════════════════
# Endpoints da Suíte Tática UI — Câmeras, Instagramáveis e Síntese
# ════════════════════════════════════════════════════════════════════════════
@router.get(
    "/venue/instagramavel",
    response_model=List[InstagramavelItemContract],
    status_code=status.HTTP_200_OK,
    summary="Lista pontos instagramáveis e ativações de marca",
)
async def listar_instagramavel(usuario: UsuarioAutenticado = Depends(exigir_leitura)) -> List[InstagramavelItemContract]:
    return [instagramavel_para_contrato(i) for i in memory_db.listar_instagramavel()]


@router.post(
    "/venue/instagramavel/{id}/captura",
    response_model=InstagramavelItemContract,
    status_code=status.HTTP_200_OK,
    summary="Registra foto / captura social em ponto instagramável",
)
async def captura_instagramavel(
    id: str,
    usuario: UsuarioAutenticado = Depends(exigir_operacao),
) -> InstagramavelItemContract:
    item = memory_db.captura_instagramavel(id)
    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Ativação '{id}' não encontrada.")
    return instagramavel_para_contrato(item)


@router.post(
    "/venue/instagramavel/{id}/modo-luz",
    response_model=InstagramavelItemContract,
    status_code=status.HTTP_200_OK,
    summary="Altera modo de iluminação cenográfica",
)
async def modo_luz_instagramavel(
    id: str,
    payload: ModoLuzRequestContract,
    usuario: UsuarioAutenticado = Depends(exigir_operacao),
) -> InstagramavelItemContract:
    item = memory_db.mudar_modo_luz_instagramavel(id, payload.modo)
    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Ativação '{id}' não encontrada.")
    return instagramavel_para_contrato(item)


@router.post(
    "/venue/instagramavel/{id}/toggle-status",
    response_model=InstagramavelItemContract,
    status_code=status.HTTP_200_OK,
    summary="Alterna status ativo / pausado de ativação instagramável",
)
async def toggle_status_instagramavel(
    id: str,
    usuario: UsuarioAutenticado = Depends(exigir_operacao),
) -> InstagramavelItemContract:
    item = memory_db.toggle_status_instagramavel(id)
    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Ativação '{id}' não encontrada.")
    return instagramavel_para_contrato(item)


@router.post(
    "/venue/atracao",
    response_model=InstagramavelItemContract,
    status_code=status.HTTP_201_CREATED,
    summary="Cadastra nova ativação instagramável no venue",
)
async def criar_atracao(
    payload: CriarAtracaoRequestContract,
    usuario: UsuarioAutenticado = Depends(exigir_operacao),
) -> InstagramavelItemContract:
    novo = memory_db.criar_atracao(
        nome=payload.nome,
        setor=payload.setor,
        patrocinador=payload.patrocinador,
    )
    return instagramavel_para_contrato(novo)


@router.get(
    "/venue/sintese",
    response_model=SinteseAcumuladaContract,
    status_code=status.HTTP_200_OK,
    summary="Calcula métricas agregadas de fluxo de câmeras e ativações da síntese acumulada",
)
async def obter_sintese(usuario: UsuarioAutenticado = Depends(exigir_leitura)) -> SinteseAcumuladaContract:
    return SinteseAcumuladaContract(**memory_db.calcular_sintese())


@router.post(
    "/venue/simular-pico",
    status_code=status.HTTP_200_OK,
    summary="Simula pico de fluxo de público na arena",
)
async def simular_pico(usuario: UsuarioAutenticado = Depends(exigir_operacao)):
    memory_db.simular_pico_fluxo()
    return {"status": "ok", "mensagem": "Pico de fluxo simulado em todos os setores da arena."}


@router.get(
    "/venue/cameras",
    response_model=CamerasResponseContract,
    status_code=status.HTTP_200_OK,
    summary="Telemetria em tempo real das 7 câmeras de monitoramento de gargalos (4 Entradas + 3 Fluxo Interno)",
    description=(
        "Retorna todas as 7 câmeras de hardware (`CAM-ENT-01`..`04` de acesso/perímetro e `CAM-INT-01`..`03` de fluxo interno), "
        "incluindo coordenadas 3D (`posicao`, `alvo`), taxa de quadros (`fps`), métricas operacionais e a respectiva "
        "`zona` com `ultima_leitura` completa (contagem de pessoas, tempo de espera, densidade/m² e confiança da IA)."
    ),
    dependencies=[Depends(sem_query_params)],
)
async def listar_cameras(usuario: UsuarioAutenticado = Depends(exigir_leitura)) -> CamerasResponseContract:
    itens = [camera_para_contrato(c, memory_db) for c in memory_db.listar_cameras()]
    online = sum(
        1 for c in itens if c.zona.ultima_leitura is None or c.zona.ultima_leitura.sensor_status == "ONLINE"
    )
    return CamerasResponseContract(
        total_cameras=len(itens),
        cameras_online=online,
        atualizado_em=agora_utc(),
        cameras=itens,
    )


@router.get(
    "/venue/cameras/{camera_id}",
    response_model=CameraTelemetryItemContract,
    status_code=status.HTTP_200_OK,
    summary="Telemetria detalhada de uma câmera de hardware específica",
    description="Consulta uma câmera individual pelo seu ID (`cam-ent-01`..`04` ou `cam-int-01`..`03`).",
    dependencies=[Depends(sem_query_params)],
)
async def obter_camera(
    camera_id: str,
    usuario: UsuarioAutenticado = Depends(exigir_leitura),
) -> CameraTelemetryItemContract:
    cam = memory_db.obter_camera(camera_id)
    if not cam:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Câmera '{camera_id}' não encontrada.")
    return camera_para_contrato(cam, memory_db)
