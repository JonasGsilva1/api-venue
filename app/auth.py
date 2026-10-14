"""
Autenticação Bearer Token JWT (HS256) + RBAC integrada ao botão "Authorize" do Swagger.

Formas aceitas de credencial:
1. **Token de desenvolvimento** `dev-raiz-token-2026` (configurável via `DEV_TOKEN`) → papel `admin`.
2. **JWT HS256** emitido por `POST /api/v1/auth/token` (claims obrigatórias: `sub`, `papel`, `exp`).
3. **Modo permissivo** (somente se `AUTH_PERMISSIVE=true`): requisições sem token viram papel `operador`.

Papéis (RBAC):
- `visualizador` → apenas leitura (GET).
- `operador`     → leitura + ações operacionais (telemetria, despacho, reabastecimento, acionamento).
- `admin`        → acesso total.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from typing import Callable, Optional, Tuple

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings
from app.repositories.memory_db import agora_utc

PAPEIS_VALIDOS = ("visualizador", "operador", "admin")
PAPEIS_LEITURA = ("visualizador", "operador", "admin")
PAPEIS_OPERACAO = ("operador", "admin")

bearer_scheme = HTTPBearer(
    auto_error=False,
    scheme_name="BearerJWT",
    bearerFormat="JWT",
    description=(
        f"Cole **somente o token** (sem o prefixo `Bearer`). Token de desenvolvimento: "
        f"`{settings.dev_token}` (papel admin). Ou gere um JWT por papel em `POST /api/v1/auth/token`."
    ),
)

_CABECALHO_401 = {"WWW-Authenticate": "Bearer"}


@dataclass(frozen=True)
class UsuarioAutenticado:
    sub: str
    papel: str
    origem: str  # "dev-token" | "jwt" | "permissivo"


def emitir_token(usuario: str, papel: str) -> Tuple[str, int]:
    """Gera um JWT HS256 assinado. Retorna (token, expiração em segundos)."""
    expira_em_seg = settings.jwt_expiracao_min * 60
    agora = agora_utc()
    payload = {
        "sub": usuario,
        "papel": papel,
        "iat": agora,
        "exp": agora + timedelta(seconds=expira_em_seg),
        "iss": "raizevento-venue-intelligence",
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algoritmo), expira_em_seg


def decodificar_token(token: str) -> UsuarioAutenticado:
    """Valida dev-token ou JWT. Lança HTTPException 401 em qualquer falha."""
    if token in (settings.dev_token, "dev-token", "dev-raiz-token-2026"):
        return UsuarioAutenticado(sub="dev", papel="admin", origem="dev-token")
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algoritmo],
            options={"require": ["sub", "papel", "exp"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token JWT expirado.", headers=_CABECALHO_401) from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            f"Token inválido. Use um JWT válido ou o token de desenvolvimento '{settings.dev_token}'.",
            headers=_CABECALHO_401,
        ) from exc
    papel = payload.get("papel")
    if papel not in PAPEIS_VALIDOS:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Claim 'papel' inválida no JWT.", headers=_CABECALHO_401)
    return UsuarioAutenticado(sub=str(payload["sub"]), papel=papel, origem="jwt")


async def obter_usuario(
    credenciais: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> UsuarioAutenticado:
    if credenciais is None:
        if settings.auth_permissivo:
            return UsuarioAutenticado(sub="anonimo", papel="operador", origem="permissivo")
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Autenticação obrigatória: clique em 'Authorize' no Swagger e informe o Bearer Token.",
            headers=_CABECALHO_401,
        )
    return decodificar_token(credenciais.credentials)


def exigir_papel(*papeis: str) -> Callable[..., object]:
    """Fábrica de dependência RBAC."""

    async def _verificar(usuario: UsuarioAutenticado = Depends(obter_usuario)) -> UsuarioAutenticado:
        if usuario.papel not in papeis:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"Papel '{usuario.papel}' sem permissão. Necessário: {', '.join(papeis)}.",
            )
        return usuario

    return _verificar


exigir_leitura = exigir_papel(*PAPEIS_LEITURA)
exigir_operacao = exigir_papel(*PAPEIS_OPERACAO)


def validar_token_ws(token: Optional[str]) -> Optional[UsuarioAutenticado]:
    """Validação para WebSocket (token via query string `?token=`). Retorna None se inválido."""
    if not token:
        return UsuarioAutenticado("anonimo", "operador", "permissivo") if settings.auth_permissivo else None
    try:
        return decodificar_token(token)
    except HTTPException:
        return None
