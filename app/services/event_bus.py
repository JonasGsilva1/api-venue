"""
Barramento de eventos em memória (pub/sub) que alimenta o WebSocket e o SSE.
Cada cliente recebe sua própria fila; a publicação é imediata (latência sub-milissegundo
no processo + rede), atendendo ao alvo de 10 ms a 400 ms.
"""
from __future__ import annotations

import asyncio
from typing import Optional, Set

from app.contracts import EventoTempoRealContract
from app.repositories.memory_db import agora_utc, memory_db

TAMANHO_FILA_CLIENTE = 256


class EventBus:
    def __init__(self) -> None:
        self._filas: Set[asyncio.Queue[EventoTempoRealContract]] = set()

    @property
    def conexoes(self) -> int:
        return len(self._filas)

    def assinar(self) -> asyncio.Queue[EventoTempoRealContract]:
        fila: asyncio.Queue[EventoTempoRealContract] = asyncio.Queue(maxsize=TAMANHO_FILA_CLIENTE)
        self._filas.add(fila)
        return fila

    def cancelar(self, fila: asyncio.Queue[EventoTempoRealContract]) -> None:
        self._filas.discard(fila)

    def publicar(self, evento: EventoTempoRealContract) -> None:
        for fila in list(self._filas):
            if fila.full():  # cliente lento: descarta o evento mais antigo, nunca bloqueia a API
                try:
                    fila.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            fila.put_nowait(evento)


def criar_evento(tipo: str, mensagem: Optional[str] = None, **dados: object) -> EventoTempoRealContract:
    return EventoTempoRealContract(
        tipo=tipo,  # type: ignore[arg-type]
        emitido_em=agora_utc(),
        status_operacional_evento=memory_db.status_operacional,  # type: ignore[arg-type]
        mensagem=mensagem,
        **dados,  # type: ignore[arg-type]
    )


event_bus = EventBus()
