"""
Testes da camada de configuração de banco de dados, `RepositoryProxy` e `/health/db`.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.config import mascarar_database_url, normalizar_database_url
from app.main import app
from app.repositories.memory_db import MemoryDB, memory_db

client = TestClient(app)


def test_normalizar_database_url_supabase_e_mascaramento():
    assert normalizar_database_url("") == ""
    assert (
        normalizar_database_url("postgres://user:pass@aws-1-us-east-2.pooler.supabase.com:6543/postgres")
        == "postgresql://user:pass@aws-1-us-east-2.pooler.supabase.com:6543/postgres?sslmode=require"
    )
    assert (
        normalizar_database_url(
            "postgresql://user:pass@aws-1-us-east-2.pooler.supabase.com:6543/postgres?sslmode=require"
        )
        == "postgresql://user:pass@aws-1-us-east-2.pooler.supabase.com:6543/postgres?sslmode=require"
    )
    assert (
        normalizar_database_url("postgresql://user:pass@localhost:5432/venue")
        == "postgresql://user:pass@localhost:5432/venue"
    )

    mascarada = mascarar_database_url(
        "postgresql://postgres.proj:segredo123@aws-1-us-east-2.pooler.supabase.com:6543/postgres?sslmode=require"
    )
    assert "segredo123" not in mascarada
    assert "postgres.proj:***@" in mascarada
    assert mascarar_database_url("") == ""


def test_health_db_em_modo_memoria():
    r = client.get("/health/db")
    assert r.status_code == 200
    dados = r.json()
    assert dados["status"] == "ok"
    assert dados["backend"] == "memory"
    assert dados["conectado"] is True
    assert dados["latencia_ms"] >= 0.0
    assert dados["zonas_carregadas"] == 5
    assert dados["detalhe"] is None


def test_repository_proxy_delega_para_backend_alternativo():
    class StubBackend:
        backend_name = "postgresql"

        def ping(self):
            return True, 1.25, 5, None

        def close(self):
            return None

    original = memory_db.target
    try:
        memory_db.set_target(StubBackend())
        r = client.get("/health/db")
        assert r.status_code == 200
        dados = r.json()
        assert dados["backend"] == "postgresql"
        assert dados["conectado"] is True
        assert dados["latencia_ms"] == 1.25
        assert dados["zonas_carregadas"] == 5
    finally:
        memory_db.set_target(original if isinstance(original, MemoryDB) else MemoryDB())
