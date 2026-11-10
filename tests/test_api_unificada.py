"""
Suíte de Testes Automatizada da API Unificada Venue Intelligence / RaizEvento (100% Python FastAPI).
Valida integralmente todos os requisitos do PROJECT_CONTEXT.md e PROGRESS_LOG.md:
- Monitoramento exclusivo por câmeras (gargalos e fluxo) + ativações instagramáveis
- Ausência total de rotas de gestão de insumos e gastronomia/autosserviço
- Contratos estritos Pydantic v2 (ConfigDict(extra="forbid"))
- Matriz de resiliência HTTP (201, 400, 502, 503, 504)
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


def test_raiz_e_documentacao_swagger():
    # Na raiz: se o front-end compilado existir, serve 200 OK; caso contrário, redireciona 307 para /docs
    response = client.get("/", follow_redirects=False)
    if response.status_code == 200:
        assert "html" in response.headers.get("content-type", "")
    else:
        assert response.status_code == 307
        assert response.headers["location"] == "/docs"

    # Em /docs: sempre retorna 200 OK com o Swagger UI
    resp_docs = client.get("/docs")
    assert resp_docs.status_code == 200


# ── Autenticação & RBAC ──────────────────────────────────────────────────────

def test_acesso_sem_token_rejeitado_com_401():
    response = client.get("/api/v1/venue/cameras")
    assert response.status_code == 401
    dados = response.json()
    assert dados["erro"] == "NAO_AUTENTICADO"


def test_acesso_com_token_invalido_rejeitado_com_401():
    response = client.get("/api/v1/venue/cameras", headers={"Authorization": "Bearer token-falso"})
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
        json={"pdv_id": 1, "nivel_critico": "ALTO", "sugestao_acao": "Remanejar orientadores de fluxo para o acesso"},
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
        json={"pdv_id": 1, "nivel_critico": "ALTO", "sugestao_acao": "Remanejar orientadores de fluxo para o acesso"},
    )
    assert r_op_post.status_code == 201


def test_dev_tokens_funcionam_como_admin():
    for h in (AUTH_HEADER, AUTH_HEADER_ALT):
        r = client.get("/api/v1/pdv/status", headers=h)
        assert r.status_code == 200


# ── Módulo A: Telemetria de Câmeras, IA e Resiliência ────────────────────────

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
    assert dados["leitura"]["alerta_ruptura_estoque"] is False


def test_telemetria_400_contrato_violado_com_campo_extra():
    payload = {
        "pdv_id": 1,
        "sensor_status": "ONLINE",
        "coordenadas_simuladas": [{"x": 100, "y": 200}],
        "transacoes_pos_ultimos_3m": 2,
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
        "simular_falha_ia": "TIMEOUT_504",
    }
    r = client.post("/api/v1/telemetry/frame-analysis", headers=AUTH_HEADER, json=payload)
    assert r.status_code == 504
    assert r.headers.get("X-Modo-Leitura") == "MEDIA_MOVEL_504"
    dados = r.json()
    assert dados["sucesso"] is False
    assert dados["modo_leitura"] == "MEDIA_MOVEL_504"
    assert "Graceful Degradation" in dados["aviso_contingencia"]


def test_telemetria_503_ia_down_contingencia_catraca():
    payload = {
        "pdv_id": 1,
        "sensor_status": "ONLINE",
        "coordenadas_simuladas": [{"x": 100, "y": 200}],
        "transacoes_pos_ultimos_3m": 6,
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


def test_inferencia_isolada_gargalos():
    payload = {
        "pdv_id": 5,  # Corredor de Acesso Norte (120 m2)
        "coordenadas_simuladas": [{"x": 10, "y": 20}] * 190,  # 190 pax -> 1.58 pax/m2 (SATURACAO)
        "transacoes_pos_ultimos_3m": 0,
        "taxa_nfc_seg_por_pessoa": 45,  # Anomalia NFC lento na catraca
    }
    r = client.post("/api/v1/inferencia", headers=AUTH_HEADER, json=payload)
    assert r.status_code == 200
    dados = r.json()
    assert dados["pax_count"] == 190
    assert dados["status_cor"] == "VERMELHO"
    assert "NFC_LENTO" in dados["anomalias"]
    assert "SATURACAO" in dados["anomalias"]
    assert "alerta_ruptura_estoque" not in dados


# ── Validação da Remoção Total de Gestão de Insumos e Gastronomia ────────────

def test_rotas_insumos_e_autosservico_removidas():
    spec = client.get("/openapi.json").json()
    rotas_ativas = list(spec["paths"].keys())
    assert all("insumo" not in rota for rota in rotas_ativas)
    assert all("autosservico" not in rota for rota in rotas_ativas)


# ── Módulo B: Predições de Gargalos e Despacho Tático ────────────────────────

def test_predicoes_gargalos():
    r = client.get("/api/v1/predicoes/gargalos", headers=AUTH_HEADER)
    assert r.status_code == 200
    dados = r.json()
    assert dados["setor"] == "Portão Principal / Entrada Norte"
    assert dados["nivel_predito"] == "CRITICO"
    assert dados["acao_recomendada"] == "Acionar 2 filas adicionais"
    assert dados["tempo_estimado_formacao_fila"] == "03m 30s"


def test_predicoes_acionar_fluxo_transita_estado_operacional():
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

    assert client.get("/health").json()["status_operacional_evento"] == "ACAO_EM_ANDAMENTO"


def test_ops_dispatch_transita_estado_operacional():
    payload = {
        "pdv_id": 5,
        "nivel_critico": "CRITICO",
        "sugestao_acao": "Abrir 2 faixas extras no Corredor de Acesso Norte",
    }
    r = client.post("/api/v1/ops/dispatch", headers=AUTH_HEADER, json=payload)
    assert r.status_code == 201
    dados = r.json()
    assert dados["status_operacional_evento"] == "ACAO_EM_ANDAMENTO"
    assert dados["nome_zona"] == "Corredor de Acesso Norte"

    r_list = client.get("/api/v1/ops/dispatch", headers=AUTH_HEADER)
    assert r_list.status_code == 200
    assert r_list.json()["total_ordens"] >= 1


# ── Módulo C: Painel de Câmeras, Heatmap e Analytics ─────────────────────────

def test_pdv_status_e_roteamento_push():
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
    assert readiness["sensores_ativos"] == 7
    assert readiness["fontes_online_str"] in ("7/7", "6/7")
    assert readiness["cameras_neurais_ativas"] == 7
    assert readiness["lidar_fps"] == 60
    assert readiness["motor_ia_online"] is True
    assert "sensores_iot_barris" not in readiness
    assert "estoque_inicial_ok" not in readiness

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
    assert acumulado["engajamento_interacoes"] == 360
    assert "bebidas_unidades" not in acumulado
    assert "autosservico_retiradas" not in acumulado


# ── Módulo D: Streaming em Tempo Real (SSE e WebSocket) ─────────────────────

def test_sse_stream_snapshot():
    r = client.get("/api/v1/telemetry/stream?limite_eventos=1", headers=AUTH_HEADER)
    assert r.status_code == 200
    assert "text/event-stream" in r.headers["content-type"]
    conteudo = r.text
    assert "event: snapshot" in conteudo
    assert "ESTAVEL" in conteudo


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
    r = client.get("/api/v1/venue/cameras?param_invalido=123", headers=AUTH_HEADER)
    assert r.status_code == 400
    assert r.json()["erro"] == "CONTRATO_VIOLADO"


# ── Adaptações e Endpoints da Suíte Front-End ───────────────────────────────

def test_auth_login_frontend():
    r = client.post("/api/v1/auth/login", json={"email": "operador@raizevento.com", "password": "123"})
    assert r.status_code == 200
    dados = r.json()
    assert "token" in dados
    assert dados["user"]["email"] == "operador@raizevento.com"
    assert dados["user"]["role"] == "admin"


def test_venue_instagramavel_fluxo():
    r = client.get("/api/v1/venue/instagramavel", headers=AUTH_HEADER)
    assert r.status_code == 200
    instas = r.json()
    assert len(instas) >= 4

    # Captura
    r_cap = client.post("/api/v1/venue/instagramavel/inst-01/captura", headers=AUTH_HEADER)
    assert r_cap.status_code == 200
    assert r_cap.json()["capturasTotais"] == 1421

    # Modo Luz
    r_luz = client.post("/api/v1/venue/instagramavel/inst-01/modo-luz", headers=AUTH_HEADER, json={"modo": "Cyber Glow"})
    assert r_luz.status_code == 200
    assert r_luz.json()["iluminacaoCenica"]["modo"] == "Cyber Glow"

    # Toggle status
    r_tog = client.post("/api/v1/venue/instagramavel/inst-01/toggle-status", headers=AUTH_HEADER)
    assert r_tog.status_code == 200


def test_venue_sintese_e_simular_pico():
    r = client.get("/api/v1/venue/sintese", headers=AUTH_HEADER)
    assert r.status_code == 200
    sintese = r.json()
    assert sintese["eventoNome"] == "Festival Som & Luz Arena 2026"
    assert sintese["camerasMonitoradasAtivas"] == 7
    assert sintese["totalAtendimentosGerais"] > 0
    alertas = sintese["principaisAlertas"]
    assert len(alertas) >= 2
    assert any(a["atracaoId"] == "cam-fluxo-01" for a in alertas)

    # Simular pico
    r_pico = client.post("/api/v1/venue/simular-pico", headers=AUTH_HEADER)
    assert r_pico.status_code == 200


def test_venue_criar_atracao():
    payload = {
        "tipo": "instagramavel",
        "nome": "Portal Holográfico Arena",
        "setor": "Arena Principal",
        "patrocinador": "Marca Parceira",
    }
    r = client.post("/api/v1/venue/atracao", headers=AUTH_HEADER, json=payload)
    assert r.status_code == 201
    assert r.json()["nome"] == "Portal Holográfico Arena"


def test_venue_cameras_endpoint_dedicado():
    r = client.get("/api/v1/venue/cameras", headers=AUTH_HEADER)
    assert r.status_code == 200
    dados = r.json()
    assert dados["total_cameras"] == 7
    assert dados["cameras_online"] == 7
    assert len(dados["cameras"]) == 7

    cam_ent = next(c for c in dados["cameras"] if c["id"] == "cam-ent-01")
    assert cam_ent["codigo"] == "CAM-ENT-01"
    assert cam_ent["tipo"] == "entrada_perimetro"
    assert cam_ent["zona"]["ultima_leitura"]["contagem_pessoas"] == 18

    cam_fluxo = next(c for c in dados["cameras"] if c["id"] == "cam-fluxo-01")
    assert cam_fluxo["codigo"] == "CAM-FLUXO-01"
    assert cam_fluxo["zona"]["id"] == 5

    r_detalhe = client.get("/api/v1/venue/cameras/cam-fluxo-01", headers=AUTH_HEADER)
    assert r_detalhe.status_code == 200
    detalhe = r_detalhe.json()
    assert detalhe["codigo"] == "CAM-FLUXO-01"
    assert detalhe["tipo"] == "fluxo_interno"
    assert detalhe["zona"]["id"] == 5

    # Aliases de retrocompatibilidade (cam-int-01..03 e cam-fb-01..03)
    for alias in ("cam-int-01", "cam-fb-01"):
        r_alias = client.get(f"/api/v1/venue/cameras/{alias}", headers=AUTH_HEADER)
        assert r_alias.status_code == 200
        assert r_alias.json()["id"] == "cam-fluxo-01"
        assert r_alias.json()["zona"]["id"] == 5


def test_compatibilidade_frontend_campos_adaptados():
    # 0. Polling /status-pdvs do App.tsx
    r_status_pdvs = client.get("/status-pdvs")
    assert r_status_pdvs.status_code == 200
    assert r_status_pdvs.json() == []

    # 1. PDV Status com localizacao_geo, contagem_pessoas e alerta_ruptura_estoque=False
    r_pdv = client.get("/api/v1/pdv/status", headers=AUTH_HEADER)
    assert r_pdv.status_code == 200
    zonas = r_pdv.json()["zonas"]
    assert "planta(x:570,y:440)" in zonas[0]["localizacao_geo"]
    assert zonas[0]["ultima_leitura"]["contagem_pessoas"] == zonas[0]["ultima_leitura"]["pax_count"]
    assert zonas[0]["ultima_leitura"]["alerta_ruptura_estoque"] is False
    assert all(z["tipo"] in ("BAR", "BANHEIRO", "CATRACA", "ESTANDE") for z in zonas)

    # 2. Readiness com prontidao, mapa_calor_global e pontos_criticos
    r_read = client.get("/api/v1/venue/readiness-heatmap", headers=AUTH_HEADER)
    assert r_read.status_code == 200
    dados_read = r_read.json()
    assert "prontidao" in dados_read
    assert "mapa_calor_global" in dados_read
    assert dados_read["mapa_calor_global"]["pontos_criticos"] == dados_read["heatmap_global"]["hotspots_criticos"]

    # 3. Analytics com aliases em português
    r_drop = client.get("/api/v1/analytics/dropoff-summary", headers=AUTH_HEADER)
    assert r_drop.status_code == 200
    dados_drop = r_drop.json()
    assert dados_drop["janela_tempo_min"] == dados_drop["window_time_min"]
    assert dados_drop["taxa_abandono_estimada_pct"] == dados_drop["dropoff_rate_estimado_pct"]


def test_integracao_worker_yolo_formato_a_atualiza_camera_e_zona():
    """
    Valida que o payload enviado pelo Worker YOLOv8 (`video_analyzer.py` / `simulator.py` no Formato A)
    com coordenadas normalizadas (0..1000) atualiza a Zona Z1 e sincroniza a câmera vinculada (`cam-fluxo-02`).
    """
    coordenadas_yolo_fila = [
        {"x": round((360 + i * 25) / 640.0 * 1000.0, 1), "y": round((220 + i * 10) / 360.0 * 1000.0, 1)}
        for i in range(9)  # 9 pessoas na fila -> 9 * 38s = 342s (5m 42s -> AMARELO / atencao)
    ]
    payload_yolo = {
        "pdv_id": 1,
        "sensor_status": "ONLINE",
        "coordenadas_simuladas": coordenadas_yolo_fila,
        "transacoes_pos_ultimos_3m": 8,
        "taxa_nfc_seg_por_pessoa": None,
        "simular_falha_ia": "NENHUMA",
    }
    r_post = client.post("/api/v1/telemetry/frame-analysis", headers=AUTH_HEADER, json=payload_yolo)
    assert r_post.status_code == 201
    leitura = r_post.json()["leitura"]
    assert leitura["pax_count"] == 9
    assert leitura["status_cor"] == "AMARELO"

    # Verifica que a câmera CAM-FLUXO-02 (vinculada ao pdv_id=1) refletiu a leitura do YOLO
    r_cam = client.get("/api/v1/venue/cameras/cam-fluxo-02", headers=AUTH_HEADER)
    assert r_cam.status_code == 200
    cam = r_cam.json()
    assert cam["zona"]["ultima_leitura"]["pax_count"] == 9
    assert cam["status"] == "atencao"
    assert "9 pessoas" in cam["metricas"]["valor"]


def test_yolo_scan_unificado_in_process_render_safe():
    """
    Valida o endpoint unificado `POST /api/v1/telemetry/yolo-scan` (`app/services/yolo_vision.py`),
    garantindo que roda em processo dentro da API principal e funciona tanto com YOLOv8 local quanto
    em nuvem (Render) sem exigir PyTorch pesado na imagem Docker.
    """
    payload = {
        "video_origem": "video_teste_04.mp4",
        "frame_indice": 6,
        "pdv_fila_id": 1,
        "pdv_estande_id": 3,
        "pessoas_fila_simuladas": 7,
        "pessoas_estande_simuladas": 10,
    }
    r = client.post("/api/v1/telemetry/yolo-scan", headers=AUTH_HEADER, json=payload)
    assert r.status_code == 201
    dados = r.json()
    assert dados["resolucao_frame"] == "640x360"
    assert dados["pessoas_zona_fila"] == 7
    assert dados["pessoas_zona_estande"] == 10
    assert dados["pessoas_detectadas_total"] == 17
    assert dados["alerta_assistido_ativo"] is True
    assert len(dados["coordenadas_fila"]) == 7
    assert len(dados["coordenadas_estande"]) == 10
    assert dados["leitura_fila"]["pax_count"] == 7
    assert dados["leitura_estande"]["pax_count"] == 10


