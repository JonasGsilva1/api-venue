"""
Suíte de Testes Automatizada da API Unificada Venue Intelligence / RaizEvento (100% Python FastAPI).
Valida integralmente todos os requisitos do PROJECT_CONTEXT.md e PROGRESS_LOG.md:
- Módulos A, B, C, D e E
- Contratos estritos Pydantic v2 (ConfigDict(extra="forbid"))
- Matriz de resiliência HTTP (201, 400, 502, 503, 504)
- Objeto raiz de insumos sem colchetes externos (incluindo BAR-83-IPA e BAR-01-AGUA)
- Autenticação Bearer Token JWT e RBAC
- WebSocket e SSE
"""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.repositories.memory_db import memory_db

client = TestClient(app)
AUTH_HEADER = {"Authorization": "Bearer dev-raiz-token-2026"}
AUTH_HEADER_ALT = {"Authorization": "Bearer dev-token"}


@pytest.fixture(autouse=True)
def reset_db():
    """Restaura o estado inicial do memory_db antes de cada teste."""
    memory_db.reset()


# ── Infraestrutura & Health ──────────────────────────────────────────────────

def test_health_check_publico():
    response = client.get("/health")
    assert response.status_code == 200
    dados = response.json()
    assert dados["status"] == "ok"
    assert dados["servico"] == "venue-intelligence-core"
    assert dados["versao"] == "2.0.0"
    assert dados["status_operacional_evento"] == "ESTAVEL"
    assert dados["motor_ia_online"] is True


def test_redirect_raiz_para_docs():
    response = client.get("/", follow_redirects=False)
    assert response.status_code == 307
    assert response.headers["location"] == "/docs"


# ── Autenticação & RBAC ──────────────────────────────────────────────────────

def test_acesso_sem_token_rejeitado_com_401():
    response = client.get("/api/v1/insumos/status")
    assert response.status_code == 401
    dados = response.json()
    assert dados["erro"] == "NAO_AUTENTICADO"


def test_acesso_com_token_invalido_rejeitado_com_401():
    response = client.get("/api/v1/insumos/status", headers={"Authorization": "Bearer token-falso"})
    assert response.status_code == 401
    assert response.json()["erro"] == "NAO_AUTENTICADO"


def test_emissao_jwt_e_rbac_por_papel():
    # Emite token para visualizador
    r_vis = client.post("/api/v1/auth/token", json={"usuario": "auditor.evento", "papel": "visualizador"})
    assert r_vis.status_code == 201
    token_vis = r_vis.json()["access_token"]
    h_vis = {"Authorization": f"Bearer {token_vis}"}

    # Visualizador pode ler GET
    r_get = client.get("/api/v1/pdv/status", headers=h_vis)
    assert r_get.status_code == 200

    # Visualizador é bloqueado em rota de escrita (exige operador/admin) -> 403
    r_post = client.post(
        "/api/v1/ops/dispatch",
        headers=h_vis,
        json={"pdv_id": 1, "nivel_critico": "ALTO", "sugestao_acao": "Reforço urgente de estoque"},
    )
    assert r_post.status_code == 403
    assert r_post.json()["erro"] == "ACESSO_NEGADO"

    # Emite token para operador
    r_op = client.post("/api/v1/auth/token", json={"usuario": "operador.arena", "papel": "operador"})
    assert r_op.status_code == 201
    token_op = r_op.json()["access_token"]
    h_op = {"Authorization": f"Bearer {token_op}"}

    # Operador consegue despachar
    r_op_post = client.post(
        "/api/v1/ops/dispatch",
        headers=h_op,
        json={"pdv_id": 1, "nivel_critico": "ALTO", "sugestao_acao": "Reforço urgente de estoque"},
    )
    assert r_op_post.status_code == 201


def test_dev_tokens_funcionam_como_admin():
    for h in (AUTH_HEADER, AUTH_HEADER_ALT):
        r = client.get("/api/v1/pdv/status", headers=h)
        assert r.status_code == 200


# ── Módulo A: Telemetria, IA e Resiliência ──────────────────────────────────

def test_telemetria_201_tempo_real():
    payload = {
        "pdv_id": 1,
        "sensor_status": "ONLINE",
        "coordenadas_simuladas": [
            {"x": 120.5, "y": 180.2},
            {"x": 122.0, "y": 184.7},
            {"x": 125.3, "y": 179.9},
        ],
        "transacoes_pos_ultimos_3m": 4,
        "estoque_percentual": 42,
        "taxa_nfc_seg_por_pessoa": None,
        "simular_falha_ia": "NENHUMA",
    }
    r = client.post("/api/v1/telemetry/frame-analysis", headers=AUTH_HEADER, json=payload)
    assert r.status_code == 201
    dados = r.json()
    assert dados["sucesso"] is True
    assert dados["modo_leitura"] == "TEMPO_REAL"
    assert dados["leitura"]["pax_count"] == 3
    assert dados["leitura"]["status_cor"] == "VERDE"
    assert dados["leitura"]["confianca_ia"] >= 0.90


def test_telemetria_400_contrato_violado_com_campo_extra():
    payload = {
        "pdv_id": 1,
        "sensor_status": "ONLINE",
        "coordenadas_simuladas": [{"x": 100, "y": 200}],
        "transacoes_pos_ultimos_3m": 2,
        "estoque_percentual": 50,
        "simular_falha_ia": "NENHUMA",
        "rosto_id": "face_xyz",  # Campo extra proibido por extra='forbid'
    }
    r = client.post("/api/v1/telemetry/frame-analysis", headers=AUTH_HEADER, json=payload)
    assert r.status_code == 400
    dados = r.json()
    assert dados["erro"] == "CONTRATO_VIOLADO"
    assert any("rosto_id" in d["campo"] for d in dados["detalhes"])


def test_telemetria_400_coordenada_fora_do_limite():
    payload = {
        "pdv_id": 1,
        "sensor_status": "ONLINE",
        "coordenadas_simuladas": [{"x": 1500.0, "y": 200.0}],  # x > 1000
        "transacoes_pos_ultimos_3m": 2,
        "estoque_percentual": 50,
        "simular_falha_ia": "NENHUMA",
    }
    r = client.post("/api/v1/telemetry/frame-analysis", headers=AUTH_HEADER, json=payload)
    assert r.status_code == 400
    assert r.json()["erro"] == "CONTRATO_VIOLADO"


def test_telemetria_502_sensor_offline_fallback():
    payload = {
        "pdv_id": 1,
        "sensor_status": "OFFLINE",
        "coordenadas_simuladas": [],
        "transacoes_pos_ultimos_3m": 4,
        "estoque_percentual": 42,
        "simular_falha_ia": "NENHUMA",
    }
    r = client.post("/api/v1/telemetry/frame-analysis", headers=AUTH_HEADER, json=payload)
    assert r.status_code == 502
    assert r.headers.get("X-Modo-Leitura") == "FALLBACK_502"
    dados = r.json()
    assert dados["sucesso"] is False
    assert dados["modo_leitura"] == "FALLBACK_502"
    assert "Sensor OFFLINE" in dados["aviso_contingencia"]
    assert dados["leitura"]["pax_count"] > 0  # Estimado pelo histórico de 15 min


def test_telemetria_504_timeout_ia_media_movel():
    payload = {
        "pdv_id": 1,
        "sensor_status": "ONLINE",
        "coordenadas_simuladas": [{"x": 100, "y": 200}],
        "transacoes_pos_ultimos_3m": 4,
        "estoque_percentual": 42,
        "simular_falha_ia": "TIMEOUT_504",
    }
    r = client.post("/api/v1/telemetry/frame-analysis", headers=AUTH_HEADER, json=payload)
    assert r.status_code == 504
    assert r.headers.get("X-Modo-Leitura") == "MEDIA_MOVEL_504"
    dados = r.json()
    assert dados["sucesso"] is False
    assert dados["modo_leitura"] == "MEDIA_MOVEL_504"
    assert "Graceful Degradation" in dados["aviso_contingencia"]


def test_telemetria_503_ia_down_contingencia_pos():
    payload = {
        "pdv_id": 1,
        "sensor_status": "ONLINE",
        "coordenadas_simuladas": [{"x": 100, "y": 200}],
        "transacoes_pos_ultimos_3m": 6,
        "estoque_percentual": 42,
        "simular_falha_ia": "DOWN_503",
    }
    r = client.post("/api/v1/telemetry/frame-analysis", headers=AUTH_HEADER, json=payload)
    assert r.status_code == 503
    assert r.headers.get("X-Modo-Leitura") == "CONTINGENCIA_503"
    assert r.headers.get("Retry-After") == "30"
    dados = r.json()
    assert dados["sucesso"] is False
    assert dados["modo_leitura"] == "CONTINGENCIA_503"
    assert "Circuit Breaker" in dados["aviso_contingencia"]


def test_inferencia_isolada():
    payload = {
        "pdv_id": 5,  # Bar Principal Norte
        "coordenadas_simuladas": [{"x": 10, "y": 20}] * 84,  # 84 pax
        "transacoes_pos_ultimos_3m": 0,
        "estoque_percentual": 12,  # Chopp IPA #83 a 12%
        "taxa_nfc_seg_por_pessoa": 45,  # Anomalia NFC lento
    }
    r = client.post("/api/v1/inferencia", headers=AUTH_HEADER, json=payload)
    assert r.status_code == 200
    dados = r.json()
    assert dados["pax_count"] == 84
    assert dados["status_cor"] == "VERMELHO"
    assert dados["alerta_ruptura_estoque"] is True
    assert "NFC_LENTO" in dados["anomalias"]
    assert "RUPTURA_MASCARADA" in dados["anomalias"]
    assert "ESTOQUE_CRITICO" in dados["anomalias"]


# ── Módulo B: Produto 1 — Insumos ───────────────────────────────────────────

def test_insumos_status_retorna_objeto_raiz_com_seeds():
    r = client.get("/api/v1/insumos/status", headers=AUTH_HEADER)
    assert r.status_code == 200
    dados = r.json()

    # Diretriz inegociável: deve ser um OBJETO RAIZ { ... }, NUNCA uma lista [ ... ]
    assert isinstance(dados, dict)
    assert "total_itens_monitorados" in dados
    assert "itens_em_deficit" in dados
    assert "insumos" in dados
    assert isinstance(dados["insumos"], list)
    assert dados["total_itens_monitorados"] == 150

    # Verifica os seeds obrigatórios
    itens = {i["item_id"]: i for i in dados["insumos"]}
    assert "BAR-83-IPA" in itens
    assert itens["BAR-83-IPA"]["nome"] == "Chopp IPA (Barril 50L)"
    assert itens["BAR-83-IPA"]["localizacao"] == "Bar Principal Norte"
    assert itens["BAR-83-IPA"]["quantidade_atual"] == 6
    assert itens["BAR-83-IPA"]["quantidade_minima"] == 20
    assert itens["BAR-83-IPA"]["status"] == "DEFICIT_CRITICO"
    assert itens["BAR-83-IPA"]["deficit_estimado"] == 14

    assert "BAR-01-AGUA" in itens
    assert itens["BAR-01-AGUA"]["nome"] == "Água Mineral 500ml"
    assert itens["BAR-01-AGUA"]["status"] == "DEFICIT_CRITICO"
    assert itens["BAR-01-AGUA"]["deficit_estimado"] == 11

    assert "BAR-02-CAFE" in itens
    assert itens["BAR-02-CAFE"]["status"] == "ESTAVEL"
    assert itens["BAR-02-CAFE"]["deficit_estimado"] == 0


def test_insumos_reabastecimento():
    payload = {"item_id": "BAR-83-IPA", "quantidade_solicitada": 14, "prioridade": "ALTA"}
    r = client.post("/api/v1/insumos/reabastecimento", headers=AUTH_HEADER, json=payload)
    assert r.status_code == 201
    dados = r.json()
    assert dados["protocolo_id"] == "REAB-2026-0042"
    assert dados["item_id"] == "BAR-83-IPA"
    assert dados["quantidade_solicitada"] == 14
    assert dados["status_pedido"] == "SOLICITADO"


# ── Módulo C: Produto 2 — Predições e Despacho ──────────────────────────────

def test_predicoes_gargalos():
    r = client.get("/api/v1/predicoes/gargalos", headers=AUTH_HEADER)
    assert r.status_code == 200
    dados = r.json()
    assert dados["setor"] == "Portão Principal / Entrada Norte"
    assert dados["nivel_predito"] == "CRITICO"
    assert dados["acao_recomendada"] == "Acionar 2 filas adicionais"
    assert dados["tempo_estimado_formacao_fila"] == "03m 30s"


def test_predicoes_acionar_fluxo_transita_estado_operacional():
    # Verifica estado inicial
    assert client.get("/health").json()["status_operacional_evento"] == "ESTAVEL"

    payload = {
        "alerta_id": "PRED-9921",
        "acao_executada": "ACIONAR_DUAS_FILAS_ADICIONAIS",
        "setor": "Portão Principal",
    }
    r = client.post("/api/v1/predicoes/acionar-fluxo", headers=AUTH_HEADER, json=payload)
    assert r.status_code == 201
    dados = r.json()
    assert dados["status_operacional_evento"] == "ACAO_EM_ANDAMENTO"

    # Confirma que /health e /venue/readiness-heatmap refletem o novo estado
    assert client.get("/health").json()["status_operacional_evento"] == "ACAO_EM_ANDAMENTO"


def test_ops_dispatch_transita_estado_operacional():
    payload = {
        "pdv_id": 5,
        "nivel_critico": "CRITICO",
        "sugestao_acao": "Abrir 2 caixas extras no Bar Principal Norte",
    }
    r = client.post("/api/v1/ops/dispatch", headers=AUTH_HEADER, json=payload)
    assert r.status_code == 201
    dados = r.json()
    assert dados["status_operacional_evento"] == "ACAO_EM_ANDAMENTO"
    assert dados["nome_zona"] == "Bar Principal Norte"

    # Listar despachos
    r_list = client.get("/api/v1/ops/dispatch", headers=AUTH_HEADER)
    assert r_list.status_code == 200
    assert r_list.json()["total_ordens"] >= 1


# ── Módulo D: Painel do Estande, Heatmap e Analytics ─────────────────────────

def test_pdv_status_e_paradoxo_roteamento_push():
    r = client.get("/api/v1/pdv/status", headers=AUTH_HEADER)
    assert r.status_code == 200
    dados = r.json()
    assert dados["total_zonas"] == 5

    zonas = {z["codigo_zona"]: z for z in dados["zonas"]}
    # Z1 tem tempo de espera 228s (> 180s) -> habilitar_redirecionamento_push DEVE SER True
    assert zonas["Z1"]["habilitar_redirecionamento_push"] is True

    # Z2 tem tempo de espera 46s (<= 180s) -> habilitar_redirecionamento_push DEVE SER False
    assert zonas["Z2"]["habilitar_redirecionamento_push"] is False


def test_venue_readiness_heatmap():
    r = client.get("/api/v1/venue/readiness-heatmap", headers=AUTH_HEADER)
    assert r.status_code == 200
    dados = r.json()
    readiness = dados["readiness"]
    assert readiness["sensores_ativos"] == 5
    assert readiness["fontes_online_str"] == "5/6" or readiness["fontes_online_str"] == "6/6"
    assert readiness["cameras_neurais_ativas"] == 12
    assert readiness["sensores_iot_barris"] == 54
    assert readiness["lidar_fps"] == 60
    assert readiness["estoque_inicial_ok"] is True
    assert readiness["motor_ia_online"] is True

    heatmap = dados["heatmap_global"]
    assert heatmap["pessoas_presentes"] == 24
    assert heatmap["ocupacao_estimada_pct"] == 46
    assert heatmap["permanencia_media_seg"] == 318
    assert heatmap["densidade_maxima_m2"] == 0.78
    assert heatmap["velocidade_media_ms"] == 0.68
    assert heatmap["zonas_atracao"] == 3


def test_analytics_dropoff_summary():
    r = client.get("/api/v1/analytics/dropoff-summary", headers=AUTH_HEADER)
    assert r.status_code == 200
    dados = r.json()
    assert dados["window_time_min"] == 30
    assert dados["queue_time_medio_min"] > 0
    assert isinstance(dados["density_point_atingido"], bool)
    assert 0 <= dados["dropoff_rate_estimado_pct"] <= 100
    assert 1.0 <= dados["ces_score"] <= 5.0

    acumulado = dados["acumulado_evento"]
    assert acumulado["publico_acumulado"] == 960
    assert acumulado["publico_por_dia"]["D1"] == 240
    assert acumulado["publico_por_dia"]["D2"] == 320
    assert acumulado["publico_por_dia"]["D3"] == 400
    assert acumulado["atendimentos_cortesia"] == 720
    assert acumulado["bebidas_unidades"] == 840
    assert acumulado["autosservico_retiradas"] == 660
    assert acumulado["engajamento_interacoes"] == 360


# ── Módulo E: Streaming em Tempo Real (SSE e WebSocket) ─────────────────────

def test_sse_stream_snapshot():
    r = client.get("/api/v1/telemetry/stream?limite_eventos=1", headers=AUTH_HEADER)
    assert r.status_code == 200
    assert "text/event-stream" in r.headers["content-type"]
    conteudo = r.text
    assert "event: snapshot" in conteudo
    assert "BAR-83-IPA" in conteudo


def test_websocket_stream_snapshot():
    with client.websocket_connect("/api/v1/live/stream?token=dev-raiz-token-2026") as ws:
        msg = ws.receive_json()
        assert msg["tipo"] == "snapshot"
        assert msg["status_operacional_evento"] == "ESTAVEL"

        # Teste de ping -> heartbeat
        ws.send_text("ping")
        heartbeat = ws.receive_json()
        assert heartbeat["tipo"] == "heartbeat"


def test_rejeicao_query_params_nao_mapeados():
    # Endpoints GET devem rejeitar query params não mapeados com 400 (Contract-First)
    r = client.get("/api/v1/insumos/status?param_invalido=123", headers=AUTH_HEADER)
    assert r.status_code == 400
    assert r.json()["erro"] == "CONTRATO_VIOLADO"
