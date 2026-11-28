"""
Testes do cliente HTTP desacoplado (`app/services/ai_client.py`) entre Backend e Mecanismo de IA remoto.
"""
from __future__ import annotations

import json
from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app as backend_app
from app.repositories.memory_db import memory_db
from app.services import ai_client

backend_client = TestClient(backend_app)
AUTH_HEADER = {"Authorization": "Bearer dev-raiz-token-2026"}


@pytest.fixture(autouse=True)
def reset_estado():
    memory_db.reset()


def test_backend_comunica_com_ia_remota_via_http_e_resiliencia(monkeypatch):
    segredo = "segredo-backend-ia-2026"
    monkeypatch.setattr(
        ai_client,
        "settings",
        SimpleNamespace(
            ai_engine_url="https://ai-service.internal",
            ai_engine_secret=segredo,
            ai_timeout_seg=0.5,
        ),
    )

    chamadas = []

    def handler(request: httpx.Request) -> httpx.Response:
        chamadas.append(request)
        assert request.headers.get("X-AI-Secret") == segredo
        body = json.loads(request.content.decode("utf-8"))

        if request.url.path == "/ai/v1/inferencia":
            if body.get("simular_falha_ia") == "DOWN_503":
                return httpx.Response(503, json={"detail": "Motor indisponível"})
            if body.get("simular_falha_ia") == "TIMEOUT_504":
                raise httpx.ReadTimeout("Timeout simulado", request=request)
            return httpx.Response(
                200,
                json={
                    "pdv_id": body["pdv_id"],
                    "pax_count": body["pax_count"],
                    "tempo_espera_seg": 228,
                    "tempo_espera_fmt": "3m 48s",
                    "densidade_m2": 0.26,
                    "status_cor": "VERDE",
                    "confianca_ia": 0.94,
                    "anomalias": [],
                },
            )

        if request.url.path == "/ai/v1/yolo-scan":
            return httpx.Response(
                200,
                json={
                    "motor_visao": "SIMULACAO_OPTICA_BORDA",
                    "resolucao_frame": "640x360",
                    "frame_processado": body["frame_indice"],
                    "coordenadas_fila": [{"x": 600.0, "y": 500.0} for _ in range(body["pessoas_fila_simuladas"])],
                    "coordenadas_estande": [{"x": 200.0, "y": 300.0} for _ in range(body["pessoas_estande_simuladas"])],
                },
            )

        if request.url.path == "/ai/v1/predicoes/calcular":
            previsoes = [
                {
                    "zona_id": z["zona_id"],
                    "nome": z["nome"],
                    "setor": z["setor"],
                    "amostras_usadas": len(z["amostras"]),
                    "suficiente": True,
                    "espera_atual_min": 4.2,
                    "projecao_5m": 5.5,
                    "projecao_10m": 6.8,
                    "projecao_15m": 8.1,
                    "velocidade_min_por_min": 0.26,
                    "minutos_ate_limite": 14.6,
                    "confianca_pct": 91.0,
                    "nivel_alerta": "AVISO",
                }
                for z in body["zonas"]
            ]
            return httpx.Response(
                200,
                json={
                    "limite_espera_min": body["limite_espera_min"],
                    "total_zonas": len(previsoes),
                    "alertas_ativos": len(previsoes),
                    "previsoes": previsoes,
                },
            )

        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(
        ai_client,
        "_criar_async_client",
        lambda timeout: httpx.AsyncClient(transport=transport, timeout=timeout),
    )

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
        json={
            "video_origem": "video_teste_04.mp4",
            "frame_indice": 3,
            "pessoas_fila_simuladas": 7,
            "pessoas_estande_simuladas": 5,
        },
    )
    assert r_yolo.status_code == 201
    assert r_yolo.json()["pessoas_zona_fila"] == 7
    assert r_yolo.json()["pessoas_zona_estande"] == 5

    r_pred = backend_client.get("/api/v1/predicoes/filas", headers=AUTH_HEADER)
    assert r_pred.status_code == 200
    pred = r_pred.json()
    assert pred["total_zonas"] == 5
    assert pred["alertas_ativos"] == 5
    assert pred["previsoes"][0]["projecao_5m"] == 5.5
    assert len(chamadas) == 8


def test_predicoes_filas_fallback_local_sem_ai_engine_url():
    r_pred = backend_client.get("/api/v1/predicoes/filas", headers=AUTH_HEADER)
    assert r_pred.status_code == 200
    pred = r_pred.json()
    assert pred["total_zonas"] == 5
    assert len(pred["previsoes"]) == 5
    assert all(item["suficiente"] is True for item in pred["previsoes"])
