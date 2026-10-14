"""
Configuração centralizada (variáveis de ambiente com padrões seguros para desenvolvimento).
Sem dependências extras: leitura direta de `os.environ`, validada no boot.
"""
from __future__ import annotations

import os
from dataclasses import dataclass


def _env_bool(nome: str, padrao: bool) -> bool:
    valor = os.getenv(nome)
    if valor is None:
        return padrao
    return valor.strip().lower() in {"1", "true", "yes", "sim", "on"}


def _env_float(nome: str, padrao: float) -> float:
    valor = os.getenv(nome)
    return padrao if valor is None else float(valor)


def _env_int(nome: str, padrao: int) -> int:
    valor = os.getenv(nome)
    return padrao if valor is None else int(valor)


@dataclass(frozen=True)
class Settings:
    # ── Autenticação JWT (RBAC) ──────────────────────────────────────────────
    jwt_secret: str
    jwt_algoritmo: str
    jwt_expiracao_min: int
    dev_token: str
    habilitar_emissor_dev: bool
    auth_permissivo: bool

    # ── Motor de IA / Resiliência ────────────────────────────────────────────
    ai_timeout_seg: float

    # ── Analytics (Drop-off / CES) ───────────────────────────────────────────
    window_time_min: int
    deslocamento_medio_min: int

    # ── CORS ─────────────────────────────────────────────────────────────────
    cors_origins: tuple[str, ...]


def carregar_settings() -> Settings:
    timeout = _env_float("AI_ENGINE_TIMEOUT_SEG", 2.5)
    if timeout <= 0:
        raise ValueError("AI_ENGINE_TIMEOUT_SEG deve ser > 0")
    origins = tuple(o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip())
    return Settings(
        jwt_secret=os.getenv("JWT_SECRET", "raizevento-dev-secret-troque-em-producao-2026"),
        jwt_algoritmo="HS256",
        jwt_expiracao_min=_env_int("JWT_EXPIRACAO_MIN", 480),
        dev_token=os.getenv("DEV_TOKEN", "dev-raiz-token-2026"),
        habilitar_emissor_dev=_env_bool("AUTH_DEV_ISSUER", True),
        auth_permissivo=_env_bool("AUTH_PERMISSIVE", False),
        ai_timeout_seg=timeout,
        window_time_min=_env_int("WINDOW_TIME_MIN", 30),
        deslocamento_medio_min=_env_int("DESLOCAMENTO_MEDIO_MIN", 8),
        cors_origins=origins or ("*",),
    )


settings = carregar_settings()
