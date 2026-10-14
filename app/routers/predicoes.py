"""Módulo C — Produto 2: Acionamento Preditivo (Partes 5 e 6)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, status

from app.auth import UsuarioAutenticado, exigir_leitura, exigir_operacao
from app.contracts import (
    AcionarFluxoRequestContract,
    AcionarFluxoResponseContract,
    PredicaoGargaloResponseContract,
)
from app.errors import RESPOSTAS_PADRAO, sem_query_params
from app.repositories.memory_db import memory_db
from app.services.event_bus import criar_evento, event_bus

router = APIRouter(
    prefix="/api/v1/predicoes", tags=["Módulo C · Produto 2 — Predição & Despacho"], responses=RESPOSTAS_PADRAO
)


@router.get(
    "/gargalos",
    response_model=PredicaoGargaloResponseContract,
    status_code=status.HTTP_200_OK,
    summary="Predição de gargalo operacional e ação recomendada",
    description="Predição ativa do motor de IA (alerta `PRED-9921`, Portão Principal / Entrada Norte). Qualquer papel autenticado.",
    dependencies=[Depends(sem_query_params)],
)
async def consultar_gargalos(usuario: UsuarioAutenticado = Depends(exigir_leitura)) -> PredicaoGargaloResponseContract:
    p = memory_db.obter_predicao()
    return PredicaoGargaloResponseContract(
        setor=p.setor,
        nivel_predito=p.nivel_predito,  # type: ignore[arg-type]
        motivo=p.motivo,
        acao_recomendada=p.acao_recomendada,
        tempo_estimado_formacao_fila=p.tempo_estimado_formacao_fila,
    )


@router.post(
    "/acionar-fluxo",
    response_model=AcionarFluxoResponseContract,
    status_code=status.HTTP_201_CREATED,
    summary="Executa a recomendação preditiva (ESTAVEL → ACAO_EM_ANDAMENTO)",
    description=(
        "Registra a ação executada pelo operador e muda o status operacional global de `ESTAVEL` para "
        "`ACAO_EM_ANDAMENTO`, refletido em `/health`, no heatmap e nos canais WS/SSE. Requer `operador`/`admin`."
    ),
    dependencies=[Depends(sem_query_params)],
)
async def acionar_fluxo(
    acionamento: AcionarFluxoRequestContract,
    usuario: UsuarioAutenticado = Depends(exigir_operacao),
) -> AcionarFluxoResponseContract:
    registro = memory_db.registrar_acionamento(acionamento.alerta_id, acionamento.acao_executada, acionamento.setor)
    resposta = AcionarFluxoResponseContract(
        alerta_id=registro.alerta_id,
        acao_executada=registro.acao_executada,
        setor=registro.setor,
        status_operacional_anterior=registro.status_operacional_anterior,  # type: ignore[arg-type]
        status_operacional_evento="ACAO_EM_ANDAMENTO",
        registrado_em=registro.registrado_em,
    )
    event_bus.publicar(
        criar_evento("acionamento_preditivo", f"{registro.alerta_id}: {registro.acao_executada} em {registro.setor}",
                     acionamento=resposta)
    )
    return resposta
