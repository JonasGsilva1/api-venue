"""
Módulo interno do `eventoai-main` (referência do motor de regras de fila e alertas assistidos).
Para o backend unificado da solução na porta 8000, execute na raiz do repositório:
    uvicorn app.main:app --reload --port 8000
"""
from fastapi import FastAPI, HTTPException
from typing import List
from app.schemas import MetricSnapshot, Alert
from app.engine import engine

app = FastAPI(
    title="Evento.ai - Venue Intelligence Engine (Módulo de Regras de Fila)",
    description="Motor de regras de fila, leitura espacial por câmeras e alertas assistidos (zero gestão de insumos).",
    version="2.0.0",
)


@app.get("/")
def read_root():
    return {"status": "ok", "message": "Evento.ai Venue Intelligence Engine (Câmeras & Gargalos)"}


@app.post("/api/v1/telemetry", response_model=List[Alert])
def receive_telemetry(snapshot: MetricSnapshot):
    """Recebe telemetria óptica e retorna novos alertas de gargalo gerados."""
    return engine.process_snapshot(snapshot)


@app.get("/api/v1/status", response_model=MetricSnapshot)
def get_current_status():
    """Retorna o estado operacional e métricas mais recentes do estande."""
    if not engine.current_snapshot:
        raise HTTPException(status_code=404, detail="Nenhuma telemetria recebida até o momento.")
    return engine.current_snapshot


@app.get("/api/v1/alerts", response_model=List[Alert])
def get_alerts(apenas_ativos: bool = True):
    """Retorna a lista de alertas de gargalo gerados no evento."""
    if apenas_ativos:
        return [a for a in engine.active_alerts if not a.resolvido]
    return engine.active_alerts


@app.post("/api/v1/alerts/{alert_id}/resolve")
def resolve_alert(alert_id: str, acao_tomada: str):
    """Registra a decisão humana que resolveu um alerta de fila/gargalo."""
    success = engine.resolve_alert(alert_id, acao_tomada)
    if not success:
        raise HTTPException(status_code=404, detail="Alerta não encontrado ou já resolvido.")
    return {"status": "success", "message": f"Alerta {alert_id} resolvido com a ação: '{acao_tomada}'."}
