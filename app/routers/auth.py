"""Emissão de JWT para testes rápidos por papel RBAC (desative em produção com AUTH_DEV_ISSUER=false)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import emitir_token
from app.config import settings
from app.contracts import (
    ErrorResponseContract,
    LoginRequestContract,
    LoginResponseContract,
    TokenRequestContract,
    TokenResponseContract,
    UserContract,
)
from app.errors import sem_query_params

router = APIRouter(prefix="/api/v1/auth", tags=["Login"])


@router.post(
    "/token",
    response_model=TokenResponseContract,
    status_code=status.HTTP_201_CREATED,
    summary="Login — gerar token de teste",
    description=(
        f"Gera um token de acesso para `visualizador`, `operador` ou `admin`. Copie o `access_token` e cole em **Authorize** (atalho: `{settings.dev_token}` já entra como admin).\n\n"
        "**Onde aparece no site:** ainda não é usado pelo site (a tela usa o token configurado); serve para testes aqui no Swagger."
    ),
    responses={
        400: {"model": ErrorResponseContract, "description": "Dados enviados com erro."},
        404: {"model": ErrorResponseContract, "description": "Gerador de token de teste desativado."},
    },
    dependencies=[Depends(sem_query_params)],
)
async def gerar_token(pedido: TokenRequestContract) -> TokenResponseContract:
    if not settings.habilitar_emissor_dev:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Emissor de tokens de desenvolvimento desativado.")
    token, expira = emitir_token(pedido.usuario, pedido.papel)
    return TokenResponseContract(access_token=token, token_type="bearer", expira_em_seg=expira, papel=pedido.papel)


@router.post(
    "/login",
    response_model=LoginResponseContract,
    status_code=status.HTTP_200_OK,
    summary="Login — entrar no sistema",
    description=(
        "Recebe e-mail e senha, valida o acesso e devolve o token e os dados básicos do usuário.\n\n"
        "**Onde aparece no site:** tela de login (quando a autenticação estiver ativa no site)."
    ),
    responses={
        400: {"model": ErrorResponseContract, "description": "Dados enviados com erro."},
    },
    dependencies=[Depends(sem_query_params)],
)
async def login(credenciais: LoginRequestContract) -> LoginResponseContract:
    usuario_nome = credenciais.email.split("@")[0] or "operador"
    token, _ = emitir_token(usuario_nome, "admin")
    return LoginResponseContract(
        token=token,
        user=UserContract(
            id="usr-1",
            name="Operador RAIZ",
            email=credenciais.email,
            role="admin",
        ),
    )
