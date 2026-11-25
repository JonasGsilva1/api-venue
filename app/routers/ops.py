"""Módulo B — Despacho tático de equipe/orientadores de fluxo."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import UsuarioAutenticado, exigir_leitura, exigir_operacao
from app.contracts import DispatchListResponseContract, DispatchRequestContract, DispatchResponseContract
from app.errors import RESPOSTA_404, RESPOSTAS_PADRAO, sem_query_params
from app.repositories.memory_db import memory_db
from app.services.event_bus import criar_evento, event_bus
from app.services.mappers import dispatch_para_contrato

router = APIRouter(
    prefix="/api/v1/ops", tags=["Despacho Ops"], responses=RESPOSTAS_PADRAO
)


@router.get(
    "/dispatch",
    response_model=DispatchListResponseContract,
    status_code=status.HTTP_200_OK,
    summary="Despacho Ops — listar despachos",
    description=(
        "Mostra todas as ordens de envio de equipe já criadas e se o evento está estável ou com ação em andamento.\n\n"
        "**Onde aparece no site:** ainda não é usado pelo site; serve para consultar aqui no Swagger os despachos criados."
    ),
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
    summary="Despacho Ops — registrar despacho",
    description=(
        "Registra o envio de equipe para ajudar em uma zona cheia e muda o status do evento para ação em andamento. "
        "Se o nível for `CRITICO_PCD_CLIMA`, também marca que a rota acessível precisa de liberação.\n\n"
        "**Onde aparece no site:** botão \"Despacho Ops\" no topo do site e botão \"Acionar Despacho Ops\" na janela Analisar vídeo."
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
