"""
Serviço Interno de Visão Computacional YOLOv8 (`app/services/yolo_vision.py`).

Integra a lógica de detecção óptica por polígonos de zona (`ZONA_BALCAO` e `ZONA_FILA` em 640x360)
do módulo `eventoai-main-mecanism-ia` diretamente ao processo FastAPI (porta 8000):
- Carrega `ultralytics.YOLO('yolov8n.pt')` e `cv2` sob demanda (lazy import) para não impactar
  o consumo de memória em ambientes cloud (Render) caso o vídeo ou pesos não estejam presentes.
- Extrai o ponto da base da bounding box (`ponto_pes = ((x1 + x2) / 2, y2)`) de forma 100% anônima,
  classifica em qual polígono a pessoa está e normaliza para `0.0..1000.0` (`CoordinateContract`).
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, List, Optional, Tuple

from app.contracts import CoordinateContract

LARGURA_PADRAO = 640
ALTURA_PADRAO = 360

# Polígonos calibrados para o frame 640x360 (mesmas coordenadas de `video_analyzer.py`):
# - ZONA_BALCAO: x in [30..320], y in [80..340]
# - ZONA_FILA:   x in [330..620], y in [150..350]
LIMITES_ZONA_BALCAO = (30, 80, 320, 340)
LIMITES_ZONA_FILA = (330, 150, 620, 350)

_MODELO_YOLO: Any = None


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
    """Converte coordenadas de pixel (640x360) para a planta normalizada 0.0..1000.0."""
    norm_x = round(min(max((px / float(largura)) * 1000.0, 0.0), 1000.0), 1)
    norm_y = round(min(max((py / float(altura)) * 1000.0, 0.0), 1000.0), 1)
    return CoordinateContract(x=norm_x, y=norm_y)


def _ponto_em_retangulo(px: int, py: int, limites: Tuple[int, int, int, int]) -> bool:
    x_min, y_min, x_max, y_max = limites
    return x_min <= px <= x_max and y_min <= py <= y_max


def _localizar_recurso(nome_arquivo: str) -> Optional[Path]:
    raiz = Path(__file__).resolve().parent.parent.parent
    candidatos = [
        Path(nome_arquivo),
        raiz / nome_arquivo,
        raiz / "eventoai-main-mecanism-ia" / "eventoai-main" / nome_arquivo,
    ]
    for c in candidatos:
        if c.is_file():
            return c
    return None


def _tentar_inferencia_yolo_real(
    video_origem: str,
    frame_indice: int,
) -> Optional[Tuple[List[CoordinateContract], List[CoordinateContract]]]:
    """
    Executa o YOLOv8n + OpenCV caso `ultralytics`, `cv2` e o arquivo de vídeo estejam disponíveis.
    Retorna `None` de forma segura se o ambiente não possuir o vídeo ou bibliotecas gráficas.
    """
    global _MODELO_YOLO
    caminho_video = _localizar_recurso(video_origem)
    if caminho_video is None:
        return None

    try:
        import cv2  # type: ignore[import-not-found]
        import numpy as np  # type: ignore[import-not-found]
        from ultralytics import YOLO  # type: ignore[import-not-found]
    except Exception:
        return None

    try:
        if _MODELO_YOLO is None:
            caminho_pesos = _localizar_recurso("yolov8n.pt")
            _MODELO_YOLO = YOLO(str(caminho_pesos) if caminho_pesos else "yolov8n.pt")

        cap = cv2.VideoCapture(str(caminho_video))
        if not cap.isOpened():
            return None

        try:
            cap.set(cv2.CAP_PROP_POS_FRAMES, max(0, frame_indice - 1))
            ret, frame = cap.read()
            if not ret or frame is None:
                return None

            frame = cv2.resize(frame, (LARGURA_PADRAO, ALTURA_PADRAO))
            zona_balcao = np.array([[30, 80], [320, 80], [320, 340], [30, 340]], np.int32)
            zona_fila = np.array([[330, 150], [620, 150], [620, 350], [330, 350]], np.int32)

            results = _MODELO_YOLO.track(frame, classes=[0], persist=True, verbose=False)
            coords_fila: List[CoordinateContract] = []
            coords_estande: List[CoordinateContract] = []

            if results and results[0].boxes is not None:
                for box in results[0].boxes:
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    ponto_pes = (int((x1 + x2) / 2), y2)
                    in_balcao = cv2.pointPolygonTest(zona_balcao, ponto_pes, False) >= 0
                    in_fila = cv2.pointPolygonTest(zona_fila, ponto_pes, False) >= 0
                    ponto_norm = normalizar_ponto_planta(ponto_pes[0], ponto_pes[1])
                    if in_balcao:
                        coords_estande.append(ponto_norm)
                    elif in_fila:
                        coords_fila.append(ponto_norm)

            return coords_fila, coords_estande
        finally:
            cap.release()
    except Exception:
        return None


def _gerar_deteccoes_opticas_calibradas(
    frame_indice: int,
    pessoas_fila_override: Optional[int] = None,
    pessoas_estande_override: Optional[int] = None,
) -> Tuple[List[CoordinateContract], List[CoordinateContract]]:
    """
    Gera posições de pés `(px, py)` estritamente dentro dos polígonos `ZONA_FILA` e `ZONA_BALCAO`
    do frame 640x360 e normaliza para `0..1000`, garantindo funcionamento determinístico mesmo
    sem arquivo `.mp4` no servidor.
    """
    ciclo = max(1, frame_indice // 3)
    qtd_fila = pessoas_fila_override if pessoas_fila_override is not None else (6 if ciclo % 2 == 1 else 4)
    qtd_estande = pessoas_estande_override if pessoas_estande_override is not None else (8 if ciclo % 2 == 1 else 5)

    coords_fila: List[CoordinateContract] = []
    for i in range(qtd_fila):
        # Dentro de ZONA_FILA: x in [330..620], y in [150..350]
        px = 345 + ((i * 37 + frame_indice * 3) % 260)
        py = 165 + ((i * 29 + frame_indice * 2) % 170)
        if _ponto_em_retangulo(px, py, LIMITES_ZONA_FILA):
            coords_fila.append(normalizar_ponto_planta(px, py))

    coords_estande: List[CoordinateContract] = []
    for i in range(qtd_estande):
        # Dentro de ZONA_BALCAO: x in [30..320], y in [80..340]
        px = 45 + ((i * 43 + frame_indice * 2) % 260)
        py = 95 + ((i * 31 + frame_indice * 3) % 230)
        if _ponto_em_retangulo(px, py, LIMITES_ZONA_BALCAO):
            coords_estande.append(normalizar_ponto_planta(px, py))

    return coords_fila, coords_estande


def processar_frame_yolo(
    video_origem: str = "video_teste_04.mp4",
    frame_indice: int = 3,
    pessoas_fila_simuladas: Optional[int] = None,
    pessoas_estande_simuladas: Optional[int] = None,
) -> ResultadoVisaoYolo:
    """
    Executa a leitura de visão computacional de um frame (usando YOLOv8n real se o vídeo e modelo
    estiverem disponíveis e nenhum override explícito for informado, ou simulação óptica calibrada).
    """
    if pessoas_fila_simuladas is None and pessoas_estande_simuladas is None:
        real = _tentar_inferencia_yolo_real(video_origem, frame_indice)
        if real is not None:
            coords_fila, coords_estande = real
            return ResultadoVisaoYolo(
                motor_visao="YOLOv8n_REAL",
                resolucao_frame=f"{LARGURA_PADRAO}x{ALTURA_PADRAO}",
                frame_processado=frame_indice,
                coordenadas_fila=coords_fila,
                coordenadas_estande=coords_estande,
            )

    coords_fila, coords_estande = _gerar_deteccoes_opticas_calibradas(
        frame_indice=frame_indice,
        pessoas_fila_override=pessoas_fila_simuladas,
        pessoas_estande_override=pessoas_estande_simuladas,
    )
    return ResultadoVisaoYolo(
        motor_visao="SIMULACAO_OPTICA_BORDA",
        resolucao_frame=f"{LARGURA_PADRAO}x{ALTURA_PADRAO}",
        frame_processado=frame_indice,
        coordenadas_fila=coords_fila,
        coordenadas_estande=coords_estande,
    )

