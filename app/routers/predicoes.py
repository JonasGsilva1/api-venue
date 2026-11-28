"""Módulo B — Acionamento Preditivo de Gargalos."""
from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status

from ai_service.contracts import AmostraEspera, ZonaHistoricoPredicao
from app.auth import UsuarioAutenticado, exigir_leitura, exigir_operacao
from app.contracts import (
    AcionarFluxoRequestContract,
    AcionarFluxoResponseContract,
    PredicaoFilaZonaContract,
    PredicaoGargaloResponseContract,
    PredicoesFilasResponseContract,
)
from app.errors import RESPOSTAS_PADRAO, sem_query_params
from app.repositories.memory_db import memory_db
from app.services import ai_client
from app.services.ai_engine import MotorIAIndisponivelError
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


@router.get(
    "/filas",
    response_model=PredicoesFilasResponseContract,
    status_code=status.HTTP_200_OK,
    summary="Predições de Gargalos (IA) — prever filas por zona",
    description=(
        "Lê o histórico recente de espera das zonas no banco de dados, envia para o Mecanismo de IA "
        "e devolve a projeção para daqui a 5, 10 e 15 minutos junto com a confiança (%).\n\n"
        "**Onde aparece no site:** aba Predições de Gargalos (IA) → tabela de tendência e projeções futuras."
    ),
    dependencies=[Depends(sem_query_params)],
)
async def prever_filas_zonas(usuario: UsuarioAutenticado = Depends(exigir_leitura)) -> PredicoesFilasResponseContract:
    zonas_historico = []
    for zona in memory_db.listar_zonas():
        leituras = sorted(
            memory_db.historico(zona.id, timedelta(minutes=30)),
            key=lambda item: item.timestamp,
        )
        amostras = [
            AmostraEspera(
                timestamp_ms=int(l.timestamp.timestamp() * 1000),
                espera_min=round(l.tempo_espera_seg / 60.0, 2),
            )
            for l in leituras
        ]
        zonas_historico.append(
            ZonaHistoricoPredicao(
                zona_id=f"zona-{zona.id}",
                nome=zona.nome,
                setor=zona.tipo,
                amostras=amostras,
            )
        )

    try:
        resultado = await ai_client.calcular_predicoes_filas(zonas_historico, limite_espera_min=8.0)
    except MotorIAIndisponivelError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc

    return PredicoesFilasResponseContract(
        limite_espera_min=resultado.limite_espera_min,
        total_zonas=resultado.total_zonas,
        alertas_ativos=resultado.alertas_ativos,
        previsoes=[PredicaoFilaZonaContract(**item.model_dump()) for item in resultado.previsoes],
    )


@router.post(
    "/acionar-fluxo",
    response_model=AcionarFluxoResponseContract,
    status_code=status.HTTP_201_CREATED,
    summary="Predições de Gargalos (IA) — executar ação recomendada",
    description=(
        "Registra que o operador executou a ação sugerida pela previsão (como abrir mais filas) e muda o status do evento para ação em andamento.\n\n"
        "**Onde aparece no site:** aba Predições de Gargalos (IA) → botão \"Executar ação recomendada\" e aba Síntese Acumulada → botão \"Executar ação recomendada\"."
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
