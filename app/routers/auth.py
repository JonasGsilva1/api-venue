"""Emissão de JWT para testes rápidos por papel RBAC (desative em produção com AUTH_DEV_ISSUER=false)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import emitir_token
from app.config import settings
from app.contracts import ErrorResponseContract, TokenRequestContract, TokenResponseContract
from app.errors import sem_query_params

router = APIRouter(prefix="/api/v1/auth", tags=["Autenticação (JWT / RBAC)"])


@router.post(
    "/token",
    response_model=TokenResponseContract,
    status_code=status.HTTP_201_CREATED,
    summary="Emite um JWT HS256 por papel (ambiente de desenvolvimento)",
    description=(
        "Gera um Bearer JWT para `visualizador`, `operador` ou `admin`. Copie `access_token` e cole no botão "
        f"**Authorize**. Atalho: o token fixo `{settings.dev_token}` já funciona como `admin`.\n\n"
        "Desativado quando `AUTH_DEV_ISSUER=false` (retorna 404)."
    ),
    responses={
        400: {"model": ErrorResponseContract, "description": "Contrato violado."},
        404: {"model": ErrorResponseContract, "description": "Emissor de desenvolvimento desativado."},
    },
    dependencies=[Depends(sem_query_params)],
)
async def gerar_token(pedido: TokenRequestContract) -> TokenResponseContract:
    if not settings.habilitar_emissor_dev:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Emissor de tokens de desenvolvimento desativado.")
    token, expira = emitir_token(pedido.usuario, pedido.papel)
    return TokenResponseContract(access_token=token, token_type="bearer", expira_em_seg=expira, papel=pedido.papel)
