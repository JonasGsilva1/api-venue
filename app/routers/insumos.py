"""Módulo B — Produto 1: Métrica de Insumos (Parte 5)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import UsuarioAutenticado, exigir_leitura, exigir_operacao
from app.contracts import (
    InsumosStatusResponseContract,
    ReabastecimentoRequestContract,
    ReabastecimentoResponseContract,
)
from app.errors import RESPOSTA_404, RESPOSTAS_PADRAO, sem_query_params
from app.repositories.memory_db import memory_db
from app.services.event_bus import criar_evento, event_bus
from app.services.mappers import insumos_status, pedido_para_contrato

router = APIRouter(prefix="/api/v1/insumos", tags=["Módulo B · Produto 1 — Insumos"], responses=RESPOSTAS_PADRAO)


@router.get(
    "/status",
    response_model=InsumosStatusResponseContract,
    status_code=status.HTTP_200_OK,
    summary="Monitoramento consolidado de insumos (objeto raiz, sem lista externa)",
    description=(
        "Retorna **diretamente o objeto raiz** `{ total_itens_monitorados, itens_em_deficit, insumos }` — "
        "nunca uma lista `[ ... ]` por fora.\n\n"
        "- `total_itens_monitorados`: tamanho do catálogo completo monitorado (150).\n"
        "- `itens_em_deficit`: itens detalhados em `DEFICIT_CRITICO` (calculado em tempo real).\n"
        "- Status: `ESTAVEL` (atual ≥ mínimo) · `ATENCAO` (≥ 50% do mínimo) · `DEFICIT_CRITICO` (< 50%).\n\n"
        "Inclui `BAR-83-IPA` (Chopp IPA Barril 50L) e `BAR-01-AGUA`. Qualquer papel autenticado."
    ),
    dependencies=[Depends(sem_query_params)],
)
async def obter_status_insumos(usuario: UsuarioAutenticado = Depends(exigir_leitura)) -> InsumosStatusResponseContract:
    return insumos_status(memory_db)


@router.post(
    "/reabastecimento",
    response_model=ReabastecimentoResponseContract,
    status_code=status.HTTP_201_CREATED,
    summary="Solicitação formal de reabastecimento urgente",
    description=(
        "Registra o pedido em memória com protocolo sequencial (o primeiro do boot é `REAB-2026-0042`) "
        "e o transmite via WebSocket/SSE. `item_id` deve existir em `GET /insumos/status`. Requer `operador`/`admin`."
    ),
    responses=RESPOSTA_404,
    dependencies=[Depends(sem_query_params)],
)
async def solicitar_reabastecimento(
    pedido: ReabastecimentoRequestContract,
    usuario: UsuarioAutenticado = Depends(exigir_operacao),
) -> ReabastecimentoResponseContract:
    if memory_db.obter_insumo(pedido.item_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Insumo '{pedido.item_id}' não é monitorado.")
    registro = memory_db.registrar_reabastecimento(pedido.item_id, pedido.quantidade_solicitada, pedido.prioridade)
    resposta = pedido_para_contrato(registro, memory_db)
    event_bus.publicar(
        criar_evento(
            "reabastecimento",
            f"Reabastecimento {resposta.protocolo_id}: {resposta.quantidade_solicitada}× {resposta.nome_item} ({resposta.prioridade})",
            reabastecimento=resposta,
            insumos=insumos_status(memory_db),
        )
    )
    return resposta
