"""
Módulo E — Camada de Tempo Real.

- `WS  /api/v1/live/stream?token=<bearer>` — WebSocket bidirecional (envie `ping` para receber heartbeat).
- `GET /api/v1/telemetry/stream`           — Server-Sent Events (Bearer via header; testável no Swagger com `limite_eventos`).

Ambos recebem um `snapshot` inicial e, em seguida, cada evento publicado no barramento
(leitura, mudança de cor, despacho, reabastecimento, acionamento preditivo) + heartbeat a cada 15 s.
"""
from __future__ import annotations

import asyncio
from typing import AsyncIterator, Optional

from fastapi import APIRouter, Depends, Query, Request, WebSocket, WebSocketDisconnect, status
from fastapi.responses import StreamingResponse

from app.auth import UsuarioAutenticado, exigir_leitura, validar_token_ws
from app.contracts import EventoTempoRealContract
from app.errors import RESPOSTAS_PADRAO, apenas_query_params
from app.repositories.memory_db import memory_db
from app.services.event_bus import criar_evento, event_bus
from app.services.mappers import insumos_status, readiness_contrato

router = APIRouter(tags=["Módulo E · Tempo Real (WebSocket & SSE)"])

INTERVALO_HEARTBEAT_SEG = 15.0


def _snapshot() -> EventoTempoRealContract:
    return criar_evento(
        "snapshot",
        "Conectado ao canal de tempo real RaizEvento",
        insumos=insumos_status(memory_db),
        readiness=readiness_contrato(memory_db),
    )


def _heartbeat() -> EventoTempoRealContract:
    return criar_evento("heartbeat")


@router.websocket("/api/v1/live/stream")
async def live_stream(websocket: WebSocket, token: Optional[str] = Query(None)) -> None:
    usuario = validar_token_ws(token)
    if usuario is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Token ausente ou inválido (?token=...)")
        return
    await websocket.accept()
    fila = event_bus.assinar()

    async def _enviar() -> None:
        await websocket.send_json(_snapshot().model_dump(mode="json"))
        while True:
            try:
                evento = await asyncio.wait_for(fila.get(), timeout=INTERVALO_HEARTBEAT_SEG)
            except asyncio.TimeoutError:
                evento = _heartbeat()
            await websocket.send_json(evento.model_dump(mode="json"))

    async def _receber() -> None:
        # Canal de entrada aceita apenas "ping" (sem payload genérico): responde com heartbeat.
        while True:
            mensagem = await websocket.receive_text()
            if mensagem.strip().lower() == "ping":
                fila.put_nowait(_heartbeat())

    tarefas = {asyncio.create_task(_enviar()), asyncio.create_task(_receber())}
    try:
        _, pendentes = await asyncio.wait(tarefas, return_when=asyncio.FIRST_COMPLETED)
        for t in pendentes:
            t.cancel()
        for t in tarefas:
            if t.done() and not t.cancelled():
                exc = t.exception()
                if exc is not None and not isinstance(exc, WebSocketDisconnect):
                    raise exc
    except WebSocketDisconnect:
        pass
    finally:
        for t in tarefas:
            t.cancel()
        event_bus.cancelar(fila)


@router.get(
    "/api/v1/telemetry/stream",
    response_model=EventoTempoRealContract,
    status_code=status.HTTP_200_OK,
    summary="Canal Server-Sent Events (SSE) de telemetria e alertas",
    description=(
        "Stream `text/event-stream`: cada mensagem é um `EventoTempoRealContract` (`event: <tipo>`, `data: <json>`).\n\n"
        "No Swagger, informe `limite_eventos=1` para receber apenas o `snapshot` e encerrar. "
        "Sem limite, a conexão permanece aberta com heartbeat a cada 15 s.\n\n"
        "O canal WebSocket equivalente é `ws://localhost:8000/api/v1/live/stream?token=<token>`."
    ),
    responses={**RESPOSTAS_PADRAO, 200: {"content": {"text/event-stream": {}}, "description": "Fluxo SSE de eventos."}},
    dependencies=[Depends(apenas_query_params("limite_eventos"))],
)
async def telemetry_stream(
    request: Request,
    limite_eventos: Optional[int] = Query(None, ge=1, le=1000, description="Encerra o stream após N eventos (testes)."),
    usuario: UsuarioAutenticado = Depends(exigir_leitura),
) -> StreamingResponse:
    fila = event_bus.assinar()

    async def _gerar() -> AsyncIterator[str]:
        enviados = 0
        try:
            evento = _snapshot()
            while True:
                yield f"event: {evento.tipo}\ndata: {evento.model_dump_json()}\n\n"
                enviados += 1
                if limite_eventos is not None and enviados >= limite_eventos:
                    return
                if await request.is_disconnected():
                    return
                try:
                    evento = await asyncio.wait_for(fila.get(), timeout=INTERVALO_HEARTBEAT_SEG)
                except asyncio.TimeoutError:
                    evento = _heartbeat()
        finally:
            event_bus.cancelar(fila)

    return StreamingResponse(
        _gerar(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )
