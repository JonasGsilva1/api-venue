"""
Configuração centralizada (variáveis de ambiente com padrões seguros para desenvolvimento).
Sem dependências extras: leitura direta de `os.environ`, validada no boot.
"""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from dotenv import load_dotenv


def _carregar_dotenv_se_aplicavel() -> None:
    """Carrega `.env` fora do pytest para manter testes unitários isolados em memória."""
    if "PYTEST_CURRENT_TEST" in os.environ or "pytest" in sys.modules:
        return
    if os.getenv("DISABLE_DOTENV", "").strip().lower() in {"1", "true", "yes", "sim", "on"}:
        return
    load_dotenv(override=False)


_carregar_dotenv_se_aplicavel()


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


def _env_str(nome: str, padrao: str = "") -> str:
    return os.getenv(nome, padrao).strip().strip('"').strip("'")


def normalizar_database_url(url: str) -> str:
    """Normaliza `postgres://` para `postgresql://` e aplica `sslmode=require` no Supabase."""
    limpa = url.strip().strip('"').strip("'")
    if not limpa:
        return ""
    if limpa.startswith("postgres://"):
        limpa = "postgresql://" + limpa[len("postgres://"):]

    partes = urlsplit(limpa)
    host = (partes.hostname or "").lower()
    if host.endswith("supabase.com") or host.endswith("supabase.co"):
        params = parse_qsl(partes.query, keep_blank_values=True)
        if not any(k.lower() == "sslmode" for k, _ in params):
            params.append(("sslmode", "require"))
            limpa = urlunsplit((partes.scheme, partes.netloc, partes.path, urlencode(params), partes.fragment))
    return limpa


def mascarar_database_url(url: str) -> str:
    """Oculta credenciais da string de conexão para uso seguro em logs."""
    limpa = url.strip()
    if not limpa:
        return ""
    try:
        partes = urlsplit(limpa)
    except ValueError:
        return "***"
    if not partes.netloc or "@" not in partes.netloc:
        return limpa
    credenciais, host_porta = partes.netloc.rsplit("@", 1)
    usuario = credenciais.split(":", 1)[0] if ":" in credenciais else credenciais
    netloc_mascarado = f"{usuario}:***@{host_porta}" if usuario else f"***@{host_porta}"
    return urlunsplit((partes.scheme, netloc_mascarado, partes.path, partes.query, partes.fragment))


@dataclass(frozen=True)
class Settings:
    # ── Banco de Dados (PostgreSQL / Supabase) ───────────────────────────────
    database_url: str
    database_pool_min: int
    database_pool_max: int
    database_connect_timeout: int

    # ── Autenticação JWT (RBAC) ──────────────────────────────────────────────
    jwt_secret: str
    jwt_algoritmo: str
    jwt_expiracao_min: int
    dev_token: str
    habilitar_emissor_dev: bool
    auth_permissivo: bool

    # ── Motor de IA / Resiliência ────────────────────────────────────────────
    ai_timeout_seg: float
    ai_engine_url: str
    ai_engine_secret: str

    # ── Analytics (Drop-off / CES) ───────────────────────────────────────────
    window_time_min: int
    deslocamento_medio_min: int

    # ── CORS ─────────────────────────────────────────────────────────────────
    cors_origins: tuple[str, ...]

    # ── Google Drive ────────────────────────────────────────────────────────
    google_drive_apps_script_url: str
    google_drive_api_key: str
    google_drive_folder_id: str


def carregar_settings() -> Settings:
    timeout = _env_float("AI_ENGINE_TIMEOUT_SEG", 2.5)
    if timeout <= 0:
        raise ValueError("AI_ENGINE_TIMEOUT_SEG deve ser > 0")
    origins = tuple(o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip())
    pool_min = max(1, _env_int("DATABASE_POOL_MIN", 1))
    pool_max = max(pool_min, _env_int("DATABASE_POOL_MAX", 10))
    return Settings(
        database_url=normalizar_database_url(_env_str("DATABASE_URL")),
        database_pool_min=pool_min,
        database_pool_max=pool_max,
        database_connect_timeout=max(1, _env_int("DATABASE_CONNECT_TIMEOUT", 10)),
        jwt_secret=os.getenv("JWT_SECRET", "raizevento-dev-secret-troque-em-producao-2026"),
        jwt_algoritmo="HS256",
        jwt_expiracao_min=_env_int("JWT_EXPIRACAO_MIN", 480),
        dev_token=os.getenv("DEV_TOKEN", "dev-raiz-token-2026"),
        habilitar_emissor_dev=_env_bool("AUTH_DEV_ISSUER", True),
        auth_permissivo=_env_bool("AUTH_PERMISSIVE", False),
        ai_timeout_seg=timeout,
        ai_engine_url=_env_str("AI_ENGINE_URL").rstrip("/"),
        ai_engine_secret=_env_str("AI_ENGINE_SECRET"),
        window_time_min=_env_int("WINDOW_TIME_MIN", 30),
        deslocamento_medio_min=_env_int("DESLOCAMENTO_MEDIO_MIN", 8),
        cors_origins=origins or ("*",),
        google_drive_apps_script_url=_env_str("GOOGLE_DRIVE_APPS_SCRIPT_URL"),
        google_drive_api_key=_env_str("GOOGLE_DRIVE_API_KEY"),
        google_drive_folder_id=_env_str("GOOGLE_DRIVE_FOLDER_ID"),
    )


settings = carregar_settings()
