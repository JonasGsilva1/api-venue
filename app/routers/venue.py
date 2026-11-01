"""Módulo D — Painel do Estande, Mapa de Calor e Analytics (Slides S01 a S10)."""
from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import UsuarioAutenticado, exigir_leitura, exigir_operacao
from app.config import settings
from app.contracts import (
    AcumuladoEventoContract,
    AnalyticsDropoffResponseContract,
    AutosservicoItemContract,
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
    TransacaoRequestContract,
)
from app.errors import RESPOSTAS_PADRAO, sem_query_params
from app.repositories.memory_db import agora_utc, memory_db
from app.services.mappers import (
    autosservico_para_contrato,
    camera_para_contrato,
    instagramavel_para_contrato,
    readiness_contrato,
    zona_para_contrato,
)

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
            bebidas_unidades=acc.bebidas_unidades,
            autosservico_retiradas=acc.autosservico_retiradas,
            engajamento_interacoes=acc.engajamento_interacoes,
        ),
        janela_tempo_min=window,
        tempo_medio_fila_min=q_min_round,
        ponto_densidade_atingido=density_hit,
        taxa_abandono_estimada_pct=dropoff_round,
        pontuacao_esforco_ces=ces_round,
    )


# ════════════════════════════════════════════════════════════════════════════
# Endpoints da Suíte Tática UI — Autosserviço, Instagramáveis e Síntese
# ════════════════════════════════════════════════════════════════════════════
@router.get(
    "/venue/autosservico",
    response_model=List[AutosservicoItemContract],
    status_code=status.HTTP_200_OK,
    summary="Lista todos os totens de autosserviço (F&B / Chopp / Kiosks)",
)
async def listar_autosservico(usuario: UsuarioAutenticado = Depends(exigir_leitura)) -> List[AutosservicoItemContract]:
    return [autosservico_para_contrato(a) for a in memory_db.listar_autosservico()]


@router.post(
    "/venue/autosservico/{id}/transacao",
    response_model=AutosservicoItemContract,
    status_code=status.HTTP_200_OK,
    summary="Registra transação simulada ou real em totem de autosserviço",
)
async def transacao_autosservico(
    id: str,
    payload: TransacaoRequestContract,
    usuario: UsuarioAutenticado = Depends(exigir_operacao),
) -> AutosservicoItemContract:
    item = memory_db.transacao_autosservico(id, payload.valor)
    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Totem '{id}' não encontrado.")
    return autosservico_para_contrato(item)


@router.post(
    "/venue/autosservico/{id}/reabastecer",
    response_model=AutosservicoItemContract,
    status_code=status.HTTP_200_OK,
    summary="Reabastece insumo e copos do totem para 100%",
)
async def reabastecer_autosservico(
    id: str,
    usuario: UsuarioAutenticado = Depends(exigir_operacao),
) -> AutosservicoItemContract:
    item = memory_db.reabastecer_autosservico(id)
    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Totem '{id}' não encontrado.")
    return autosservico_para_contrato(item)


@router.post(
    "/venue/autosservico/{id}/manutencao",
    response_model=AutosservicoItemContract,
    status_code=status.HTTP_200_OK,
    summary="Alterna status operacional / manutenção de um totem",
)
async def manutencao_autosservico(
    id: str,
    usuario: UsuarioAutenticado = Depends(exigir_operacao),
) -> AutosservicoItemContract:
    item = memory_db.toggle_manutencao_autosservico(id)
    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Totem '{id}' não encontrado.")
    return autosservico_para_contrato(item)


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
    status_code=status.HTTP_201_CREATED,
    summary="Cadastra nova atração (autosserviço ou instagramável) no venue",
)
async def criar_atracao(
    payload: CriarAtracaoRequestContract,
    usuario: UsuarioAutenticado = Depends(exigir_operacao),
):
    novo = memory_db.criar_atracao(
        tipo=payload.tipo,
        nome=payload.nome,
        setor=payload.setor,
        insumo_ou_patrocinador=payload.insumoOuPatrocinador,
    )
    if payload.tipo == "autosservico":
        return autosservico_para_contrato(novo)  # type: ignore[arg-type]
    return instagramavel_para_contrato(novo)  # type: ignore[arg-type]


@router.get(
    "/venue/sintese",
    response_model=SinteseAcumuladaContract,
    status_code=status.HTTP_200_OK,
    summary="Calcula métricas agregadas da síntese acumulada do evento",
)
async def obter_sintese(usuario: UsuarioAutenticado = Depends(exigir_leitura)) -> SinteseAcumuladaContract:
    return SinteseAcumuladaContract(**memory_db.calcular_sintese())


@router.post(
    "/venue/simular-pico",
    status_code=status.HTTP_200_OK,
    summary="Simula pico de fluxo na arena, afetando totens e pontos de engajamento",
)
async def simular_pico(usuario: UsuarioAutenticado = Depends(exigir_operacao)):
    memory_db.simular_pico_fluxo()
    return {"status": "ok", "mensagem": "Pico de fluxo simulado em todos os setores da arena."}


@router.get(
    "/venue/cameras",
    response_model=CamerasResponseContract,
    status_code=status.HTTP_200_OK,
    summary="Telemetria em tempo real das 7 câmeras de hardware da arena (4 Entradas + 3 F&B)",
    description=(
        "Retorna todas as 7 câmeras de hardware (`CAM-ENT-01`..`04` de acesso/perímetro e `CAM-FB-01`..`03` de F&B), "
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
    description="Consulta uma câmera individual pelo seu ID (`cam-ent-01`..`04` ou `cam-fb-01`..`03`).",
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
