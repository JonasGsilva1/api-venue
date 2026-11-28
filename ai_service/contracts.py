"""Contratos Pydantic v2 estritos (`extra="forbid"`) do Mecanismo de IA."""
from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class ContratoEstrito(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CoordenadaAnonima(ContratoEstrito):
    x: float = Field(..., ge=0.0, le=1000.0)
    y: float = Field(..., ge=0.0, le=1000.0)


StatusCor = Literal["VERDE", "AMARELO", "VERMELHO"]
TipoAnomalia = Literal["NFC_LENTO", "SATURACAO"]
FalhaSimulada = Literal["NENHUMA", "TIMEOUT_504", "DOWN_503"]
NivelAlertaPredicao = Literal["COLETANDO", "ESTOUROU", "URGENTE", "AVISO", "ESTAVEL"]


class AiInferenciaRequest(ContratoEstrito):
    pdv_id: int = Field(..., ge=1)
    area_m2: float = Field(..., gt=0.0)
    tempo_servico_seg: float = Field(..., ge=0.0)
    postos_atendimento: int = Field(1, ge=1)
    pax_count: int = Field(..., ge=0, le=5000)
    taxa_nfc_seg_por_pessoa: Optional[int] = Field(None, ge=1, le=600)
    simular_falha_ia: FalhaSimulada = "NENHUMA"


class AiInferenciaResponse(ContratoEstrito):
    pdv_id: int = Field(..., ge=1)
    pax_count: int = Field(..., ge=0)
    tempo_espera_seg: int = Field(..., ge=0)
    tempo_espera_fmt: str
    densidade_m2: float = Field(..., ge=0.0)
    status_cor: StatusCor
    confianca_ia: float = Field(..., ge=0.0, le=1.0)
    anomalias: List[TipoAnomalia]


class AiYoloScanRequest(ContratoEstrito):
    video_origem: str = Field("video_teste_04.mp4", min_length=1, max_length=120)
    frame_indice: int = Field(3, ge=1, le=100000)
    pessoas_fila_simuladas: Optional[int] = Field(None, ge=0, le=500)
    pessoas_estande_simuladas: Optional[int] = Field(None, ge=0, le=500)


class AiYoloScanResponse(ContratoEstrito):
    motor_visao: Literal["YOLOv8n_REAL", "SIMULACAO_OPTICA_BORDA"]
    resolucao_frame: str
    frame_processado: int = Field(..., ge=1)
    coordenadas_fila: List[CoordenadaAnonima]
    coordenadas_estande: List[CoordenadaAnonima]


class AmostraEspera(ContratoEstrito):
    timestamp_ms: int = Field(..., ge=0)
    espera_min: float = Field(..., ge=0.0)


class ZonaHistoricoPredicao(ContratoEstrito):
    zona_id: str = Field(..., min_length=1, max_length=64)
    nome: str = Field(..., min_length=1, max_length=160)
    setor: str = Field(..., min_length=1, max_length=120)
    amostras: List[AmostraEspera] = Field(default_factory=list, max_length=500)


class AiPredicaoRequest(ContratoEstrito):
    zonas: List[ZonaHistoricoPredicao] = Field(default_factory=list, max_length=100)
    limite_espera_min: float = Field(8.0, gt=0.0, le=120.0)


class AiPredicaoItem(ContratoEstrito):
    zona_id: str
    nome: str
    setor: str
    amostras_usadas: int = Field(..., ge=0)
    suficiente: bool
    espera_atual_min: float = Field(..., ge=0.0)
    projecao_5m: Optional[float] = None
    projecao_10m: Optional[float] = None
    projecao_15m: Optional[float] = None
    velocidade_min_por_min: float = 0.0
    minutos_ate_limite: Optional[float] = None
    confianca_pct: float = Field(..., ge=0.0, le=100.0)
    nivel_alerta: NivelAlertaPredicao


class AiPredicaoResponse(ContratoEstrito):
    limite_espera_min: float
    total_zonas: int = Field(..., ge=0)
    alertas_ativos: int = Field(..., ge=0)
    previsoes: List[AiPredicaoItem]


class AiHealthResponse(ContratoEstrito):
    status: Literal["ok"]
    servico: str
    versao: str
    motor_visao_disponivel: bool
