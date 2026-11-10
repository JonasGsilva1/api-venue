"""
Variante simplificada do Worker YOLOv8 (Formato A) para `video_teste_03.mp4`,
integrada diretamente ao contrato estrito `TelemetryAnalysisRequestContract` da API Principal (porta 8000).
"""
from __future__ import annotations

from video_analyzer import DEFAULT_API_TOKEN, DEFAULT_API_URL, executar_analisador

if __name__ == "__main__":
    executar_analisador(
        video_path="video_teste_03.mp4",
        api_url=DEFAULT_API_URL,
        api_token=DEFAULT_API_TOKEN,
        pdv_fila=1,
        pdv_estande=3,
    )
