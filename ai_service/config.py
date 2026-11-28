"""Configuração isolada do Mecanismo de IA (sem dependência do backend ou banco de dados)."""
from __future__ import annotations

import os
from dataclasses import dataclass


def _env_str(nome: str, padrao: str = "") -> str:
    return os.getenv(nome, padrao).strip().strip('"').strip("'")


def _env_float(nome: str, padrao: float) -> float:
    valor = os.getenv(nome)
    return padrao if valor is None else float(valor)


@dataclass(frozen=True)
class AiSettings:
    secret: str
    timeout_seg: float
    cors_origins: tuple[str, ...]


def carregar_ai_settings() -> AiSettings:
    timeout = _env_float("AI_ENGINE_TIMEOUT_SEG", 2.5)
    if timeout <= 0:
        raise ValueError("AI_ENGINE_TIMEOUT_SEG deve ser > 0")
    origins = tuple(o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip())
    return AiSettings(
        secret=_env_str("AI_ENGINE_SECRET"),
        timeout_seg=timeout,
        cors_origins=origins or ("*",),
    )


ai_settings = carregar_ai_settings()
