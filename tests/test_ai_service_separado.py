"""
Testes do Mecanismo de IA independente (`ai_service/`) e da comunicação HTTP entre Backend (`app/`) e IA (`ai_service/`).
"""
from __future__ import annotations

from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient

from ai_service import main as ai_main
from ai_service.main import app as ai_app
from app.main import app as backend_app
from app.repositories.memory_db import memory_db
from app.services import ai_client

ai_client_http = TestClient(ai_app)
backend_client = TestClient(backend_app)
AUTH_HEADER = {"Authorization": "Bearer dev-raiz-token-2026"}


@pytest.fixture(autouse=True)
def reset_estado():
    memory_db.reset()


def test_ai_service_health_inferencia_yolo_e_segredo(monkeypatch):
    r_health = ai_client_http.get("/ai/v1/health")
    assert r_health.status_code == 200
    assert r_health.json()["status"] == "ok"
    assert r_health.json()["servico"] == "venue-intelligence-ai"

    monkeypatch.setattr(
        ai_main,
        "ai_settings",
        SimpleNamespace(secret="chave-secreta-ia", timeout_seg=2.5, cors_origins=("*",)),
    )

    sem_segredo = ai_client_http.post(
        "/ai/v1/inferencia",
        json={"pdv_id": 1, "area_m2": 23.0, "tempo_servico_seg": 38.0, "postos_atendimento": 1, "pax_count": 6},
    )
    assert sem_segredo.status_code == 401

    com_segredo = ai_client_http.post(
        "/ai/v1/inferencia",
        headers={"X-AI-Secret": "chave-secreta-ia"},
        json={"pdv_id": 1, "area_m2": 23.0, "tempo_servico_seg": 38.0, "postos_atendimento": 1, "pax_count": 6},
    )
    assert com_segredo.status_code == 200
    dados_inf = com_segredo.json()
    assert dados_inf["tempo_espera_seg"] == 228
    assert dados_inf["status_cor"] == "VERDE"

    invalido = ai_client_http.post(
        "/ai/v1/inferencia",
        headers={"X-AI-Secret": "chave-secreta-ia"},
        json={"pdv_id": 1, "area_m2": 23.0, "tempo_servico_seg": 38.0, "pax_count": 6, "campo_extra": 1},
    )
    assert invalido.status_code == 400

    r_yolo = ai_client_http.post(
        "/ai/v1/yolo-scan",
        headers={"X-AI-Secret": "chave-secreta-ia"},
        json={"video_origem": "video_teste_04.mp4", "frame_indice": 3, "pessoas_fila_simuladas": 6, "pessoas_estande_simuladas": 8},
    )
    assert r_yolo.status_code == 200
    assert len(r_yolo.json()["coordenadas_fila"]) == 6
    assert len(r_yolo.json()["coordenadas_estande"]) == 8


def test_ai_service_predicao_regressao_linear():
    base_t = 1_700_000_000_000
    amostras_subindo = [
        {"timestamp_ms": base_t + i * 60_000, "espera_min": 2.0 + i * 0.5}
        for i in range(6)
    ]
    r = ai_client_http.post(
        "/ai/v1/predicoes/calcular",
        json={
            "limite_espera_min": 8.0,
            "zonas": [
                {"zona_id": "zona-1", "nome": "Z1", "setor": "CATRACA", "amostras": amostras_subindo},
                {"zona_id": "zona-2", "nome": "Z2", "setor": "CATRACA", "amostras": amostras_subindo[:2]},
            ],
        },
    )
    assert r.status_code == 200
    dados = r.json()
    assert dados["total_zonas"] == 2
    assert dados["alertas_ativos"] == 1

    z1, z2 = dados["previsoes"]
    assert z1["suficiente"] is True
    assert z1["espera_atual_min"] == 4.5
    assert z1["projecao_5m"] == 7.0
    assert z1["projecao_10m"] == 9.5
    assert z1["projecao_15m"] == 12.0
    assert z1["minutos_ate_limite"] == 7.0
    assert z1["nivel_alerta"] == "AVISO"

    assert z2["suficiente"] is False
    assert z2["nivel_alerta"] == "COLETANDO"


def test_backend_comunica_com_ai_service_via_http_e_resiliencia(monkeypatch):
    segredo = "segredo-backend-ia-2026"
    monkeypatch.setattr(
        ai_main,
        "ai_settings",
        SimpleNamespace(secret=segredo, timeout_seg=0.05, cors_origins=("*",)),
    )
    monkeypatch.setattr(
        ai_client,
        "settings",
        SimpleNamespace(
            ai_engine_url="https://ai-service.internal",
            ai_engine_secret=segredo,
            ai_timeout_seg=0.05,
        ),
    )

    transport = httpx.ASGITransport(app=ai_app)
    monkeypatch.setattr(
        ai_client,
        "_criar_async_client",
        lambda timeout: httpx.AsyncClient(transport=transport, timeout=timeout),
    )

    # 1. Frame analysis 201 via HTTP até o ai_service
    r_ok = backend_client.post(
        "/api/v1/telemetry/frame-analysis",
        headers=AUTH_HEADER,
        json={
            "pdv_id": 1,
            "sensor_status": "ONLINE",
            "coordenadas_simuladas": [{"x": 120.0, "y": 180.0} for _ in range(6)],
            "transacoes_pos_ultimos_3m": 4,
            "simular_falha_ia": "NENHUMA",
        },
    )
    assert r_ok.status_code == 201
    assert r_ok.json()["leitura"]["tempo_espera_seg"] == 228

    # 2. IA remota indisponível (DOWN_503 -> ai_service retorna 503 -> backend devolve 503 CONTINGENCIA_503)
    r_503 = backend_client.post(
        "/api/v1/telemetry/frame-analysis",
        headers=AUTH_HEADER,
        json={
            "pdv_id": 1,
            "sensor_status": "ONLINE",
            "coordenadas_simuladas": [{"x": 120.0, "y": 180.0} for _ in range(6)],
            "transacoes_pos_ultimos_3m": 6,
            "simular_falha_ia": "DOWN_503",
        },
    )
    assert r_503.status_code == 503
    assert r_503.json()["modo_leitura"] == "CONTINGENCIA_503"

    # 3. IA remota lenta (TIMEOUT_504 -> excede 0.05s -> backend devolve 504 MEDIA_MOVEL_504)
    r_504 = backend_client.post(
        "/api/v1/telemetry/frame-analysis",
        headers=AUTH_HEADER,
        json={
            "pdv_id": 1,
            "sensor_status": "ONLINE",
            "coordenadas_simuladas": [{"x": 120.0, "y": 180.0} for _ in range(6)],
            "transacoes_pos_ultimos_3m": 6,
            "simular_falha_ia": "TIMEOUT_504",
        },
    )
    assert r_504.status_code == 504
    assert r_504.json()["modo_leitura"] == "MEDIA_MOVEL_504"

    # 4. /inferencia e /telemetry/yolo-scan roteados para o ai_service via HTTP
    r_inf = backend_client.post(
        "/api/v1/inferencia",
        headers=AUTH_HEADER,
        json={
            "pdv_id": 1,
            "coordenadas_simuladas": [{"x": 100.0, "y": 100.0} for _ in range(6)],
            "transacoes_pos_ultimos_3m": 4,
        },
    )
    assert r_inf.status_code == 200
    assert r_inf.json()["tempo_espera_seg"] == 228

    r_yolo = backend_client.post(
        "/api/v1/telemetry/yolo-scan",
        headers=AUTH_HEADER,
        json={"video_origem": "video_teste_04.mp4", "frame_indice": 3, "pessoas_fila_simuladas": 7, "pessoas_estande_simuladas": 5},
    )
    assert r_yolo.status_code == 201
    assert r_yolo.json()["pessoas_zona_fila"] == 7
    assert r_yolo.json()["pessoas_zona_estande"] == 5

    # 5. GET /api/v1/predicoes/filas alimentado pelo histórico do banco + cálculo na IA
    r_pred = backend_client.get("/api/v1/predicoes/filas", headers=AUTH_HEADER)
    assert r_pred.status_code == 200
    pred = r_pred.json()
    assert pred["total_zonas"] == 5
    assert len(pred["previsoes"]) == 5
    assert all("projecao_5m" in item and "confianca_pct" in item for item in pred["previsoes"])
