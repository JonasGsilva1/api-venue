"""Módulo C — Despacho tático de staff/logística."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import UsuarioAutenticado, exigir_leitura, exigir_operacao
from app.contracts import DispatchListResponseContract, DispatchRequestContract, DispatchResponseContract
from app.errors import RESPOSTA_404, RESPOSTAS_PADRAO, sem_query_params
from app.repositories.memory_db import memory_db
from app.services.event_bus import criar_evento, event_bus
from app.services.mappers import dispatch_para_contrato

router = APIRouter(
    prefix="/api/v1/ops", tags=["Módulo C · Produto 2 — Predição & Despacho"], responses=RESPOSTAS_PADRAO
)


@router.get(
    "/dispatch",
    response_model=DispatchListResponseContract,
    status_code=status.HTTP_200_OK,
    summary="Lista as ordens táticas de remanejamento",
    description="Retorna o objeto raiz `{ total_ordens, status_operacional_evento, ordens }`. Qualquer papel autenticado.",
    dependencies=[Depends(sem_query_params)],
)
async def listar_dispatches(usuario: UsuarioAutenticado = Depends(exigir_leitura)) -> DispatchListResponseContract:
    ordens = [dispatch_para_contrato(d, memory_db) for d in memory_db.listar_dispatches()]
    return DispatchListResponseContract(
        total_ordens=len(ordens),
        status_operacional_evento=memory_db.status_operacional,  # type: ignore[arg-type]
        ordens=ordens,
    )


@router.post(
    "/dispatch",
    response_model=DispatchResponseContract,
    status_code=status.HTTP_201_CREATED,
    summary="Cria ordem tática (ESTAVEL → ACAO_EM_ANDAMENTO)",
    description=(
        "Cria uma ordem de remanejamento de staff/logística para a zona informada e muda o status operacional "
        "do evento para `ACAO_EM_ANDAMENTO`. `CRITICO_PCD_CLIMA` pendente marca `rota_livre_ok = false` no readiness. "
        "Requer `operador`/`admin`."
    ),
    responses=RESPOSTA_404,
    dependencies=[Depends(sem_query_params)],
)
async def criar_dispatch(
    ordem: DispatchRequestContract,
    usuario: UsuarioAutenticado = Depends(exigir_operacao),
) -> DispatchResponseContract:
    if memory_db.obter_zona(ordem.pdv_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Zona/PDV {ordem.pdv_id} não existe (ver GET /api/v1/pdv/status).")
    registro = memory_db.criar_dispatch(ordem.pdv_id, ordem.nivel_critico, ordem.sugestao_acao)
    resposta = dispatch_para_contrato(registro, memory_db)
    event_bus.publicar(
        criar_evento("dispatch", f"Despacho #{resposta.id} ({resposta.nivel_critico}) → {resposta.nome_zona}", dispatch=resposta)
    )
    return resposta
