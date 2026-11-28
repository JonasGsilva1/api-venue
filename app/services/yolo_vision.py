"""
Adaptador de Visão Computacional YOLOv8 (`app/services/yolo_vision.py`) no Backend.

Delega a lógica de detecção óptica ao módulo independente `ai_service.vision` e converte
os pontos retornados para `CoordinateContract` do contrato do Backend.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

from ai_service.vision import ALTURA_PADRAO, LARGURA_PADRAO
from ai_service.vision import normalizar_ponto_planta as _normalizar_ia
from ai_service.vision import processar_frame_yolo as _processar_ia
from app.contracts import CoordinateContract


@dataclass
class ResultadoVisaoYolo:
    motor_visao: str  # "YOLOv8n_REAL" | "SIMULACAO_OPTICA_BORDA"
    resolucao_frame: str
    frame_processado: int
    coordenadas_fila: List[CoordinateContract]
    coordenadas_estande: List[CoordinateContract]


def normalizar_ponto_planta(
    px: float,
    py: float,
    largura: int = LARGURA_PADRAO,
    altura: int = ALTURA_PADRAO,
) -> CoordinateContract:
    ponto = _normalizar_ia(px, py, largura=largura, altura=altura)
    return CoordinateContract(x=ponto.x, y=ponto.y)


def processar_frame_yolo(
    video_origem: str = "video_teste_04.mp4",
    frame_indice: int = 3,
    pessoas_fila_simuladas: Optional[int] = None,
    pessoas_estande_simuladas: Optional[int] = None,
) -> ResultadoVisaoYolo:
    res = _processar_ia(
        video_origem=video_origem,
        frame_indice=frame_indice,
        pessoas_fila_simuladas=pessoas_fila_simuladas,
        pessoas_estande_simuladas=pessoas_estande_simuladas,
    )
    return ResultadoVisaoYolo(
        motor_visao=res.motor_visao,
        resolucao_frame=res.resolucao_frame,
        frame_processado=res.frame_processado,
        coordenadas_fila=[CoordinateContract(x=c.x, y=c.y) for c in res.coordenadas_fila],
        coordenadas_estande=[CoordinateContract(x=c.x, y=c.y) for c in res.coordenadas_estande],
    )
