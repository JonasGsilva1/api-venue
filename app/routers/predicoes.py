"""Módulo B — Acionamento Preditivo de Gargalos."""
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
    prefix="/api/v1/predicoes", tags=["Predições de Gargalos (IA)"], responses=RESPOSTAS_PADRAO
)


@router.get(
    "/gargalos",
    response_model=PredicaoGargaloResponseContract,
    status_code=status.HTTP_200_OK,
    summary="Predições de Gargalos (IA) — ver previsão",
    description=(
        "Mostra onde uma fila crítica está se formando, o motivo e a ação recomendada para evitar gargalo.\n\n"
        "**Onde aparece no site:** aba Predições de Gargalos (IA) → card de previsão ativa no topo da aba."
    ),
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
    summary="Predições de Gargalos (IA) — executar ação recomendada",
    description=(
        "Registra que o operador executou a ação sugerida pela previsão (como abrir mais filas) e muda o status do evento para ação em andamento.\n\n"
        "**Onde aparece no site:** aba Predições de Gargalos (IA) → botão \"Executar ação recomendada\" e aba Síntese Acumulada → botão \"Executar Medida Preditiva\"."
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
