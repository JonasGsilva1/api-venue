"""
Tratamento centralizado de erros — todas as respostas de erro seguem `ErrorResponseContract`,
exceto os códigos de resiliência (502/503/504), que devolvem `TelemetryAnalysisResponseContract`
com a estimativa de contingência (graceful degradation).
"""
from __future__ import annotations

import logging
from typing import Callable, Dict, List, Optional

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.contracts import ErroCampoContract, ErrorResponseContract, TelemetryAnalysisResponseContract
from app.repositories.memory_db import agora_utc

logger = logging.getLogger("raizevento.errors")


class ResilienciaHTTPException(Exception):
    """
    Sinaliza que o pacote foi processado em modo de contingência.
    O handler devolve o status (502/503/504) com o corpo completo da leitura estimada.
    """

    def __init__(self, status_code: int, payload: TelemetryAnalysisResponseContract, headers: Optional[Dict[str, str]] = None):
        super().__init__(payload.aviso_contingencia)
        self.status_code = status_code
        self.payload = payload
        self.headers = headers or {}


_CODIGO_POR_STATUS = {
    400: "CONTRATO_VIOLADO",
    401: "NAO_AUTENTICADO",
    403: "ACESSO_NEGADO",
    404: "RECURSO_NAO_ENCONTRADO",
    405: "METODO_NAO_PERMITIDO",
}


def _resposta_erro(status_code: int, mensagem: str, detalhes: Optional[List[ErroCampoContract]] = None,
                   headers: Optional[Dict[str, str]] = None) -> JSONResponse:
    corpo = ErrorResponseContract(
        erro=_CODIGO_POR_STATUS.get(status_code, "ERRO_INTERNO" if status_code >= 500 else "ERRO_HTTP"),
        mensagem=mensagem,
        status_code=status_code,
        detalhes=detalhes or [],
        timestamp=agora_utc(),
    )
    return JSONResponse(status_code=status_code, content=corpo.model_dump(mode="json"), headers=headers)


async def _handler_validacao(request: Request, exc: RequestValidationError) -> JSONResponse:
    """400 Bad Request: qualquer violação de contrato descarta o pacote com segurança (sem ecoar o input)."""
    detalhes = [
        ErroCampoContract(
            campo=".".join(str(p) for p in erro.get("loc", ())),
            mensagem=str(erro.get("msg", "inválido")),
            tipo=str(erro.get("type", "value_error")),
        )
        for erro in exc.errors()
    ]
    logger.warning("CONTRATO_VIOLADO %s %s campos=%s", request.method, request.url.path, [d.campo for d in detalhes])
    return _resposta_erro(
        status.HTTP_400_BAD_REQUEST,
        "Pacote descartado com segurança: o payload viola o contrato estrito (campos extras, tipos ou limites inválidos).",
        detalhes,
    )


async def _handler_http(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    mensagem = exc.detail if isinstance(exc.detail, str) else "Erro HTTP."
    return _resposta_erro(exc.status_code, mensagem, headers=getattr(exc, "headers", None))


async def _handler_resiliencia(request: Request, exc: ResilienciaHTTPException) -> JSONResponse:
    logger.warning("RESILIENCIA %s modo=%s pdv=%s", exc.status_code, exc.payload.modo_leitura, exc.payload.leitura.pdv_id)
    return JSONResponse(status_code=exc.status_code, content=exc.payload.model_dump(mode="json"), headers=exc.headers)


async def _handler_inesperado(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("ERRO_INTERNO %s %s", request.method, request.url.path)
    return _resposta_erro(status.HTTP_500_INTERNAL_SERVER_ERROR, "Erro interno inesperado. O incidente foi registrado.")


def registrar_handlers(app: FastAPI) -> None:
    app.add_exception_handler(RequestValidationError, _handler_validacao)  # type: ignore[arg-type]
    app.add_exception_handler(StarletteHTTPException, _handler_http)  # type: ignore[arg-type]
    app.add_exception_handler(ResilienciaHTTPException, _handler_resiliencia)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, _handler_inesperado)


def apenas_query_params(*permitidos: str) -> Callable[[Request], None]:
    """Contract-first também na query string: parâmetros não mapeados geram 400."""

    def _guard(request: Request) -> None:
        extras = [k for k in request.query_params.keys() if k not in permitidos]
        if extras:
            raise RequestValidationError(
                [{"type": "extra_forbidden", "loc": ("query", k), "msg": "Extra inputs are not permitted"} for k in extras]
            )

    return _guard


sem_query_params = apenas_query_params()

# Respostas de erro documentadas em todos os routers protegidos.
RESPOSTAS_PADRAO = {
    400: {"model": ErrorResponseContract, "description": "Contrato violado (campos extras, tipos ou limites inválidos)."},
    401: {"model": ErrorResponseContract, "description": "Token ausente, inválido ou expirado."},
    403: {"model": ErrorResponseContract, "description": "Papel RBAC sem permissão."},
}
RESPOSTA_404 = {404: {"model": ErrorResponseContract, "description": "Recurso não encontrado."}}
