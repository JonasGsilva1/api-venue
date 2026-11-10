"""
Worker de Visão Computacional (Formato A) — YOLOv8 + OpenCV integrado à API Unificada RaizEvento.

Lê frames de vídeo (ou stream sintético de fallback), detecta pessoas de forma 100% anônima
por zona (Polígono Estande/Balcão e Polígono Fila de Acesso), converte os pontos dos pés (x, y)
para a escala normalizada 0..1000 (`CoordinateContract`) e envia via POST autenticado (Bearer JWT)
para `POST /api/v1/telemetry/frame-analysis` na porta 8000.
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np
import requests

try:
    from ultralytics import YOLO
except ImportError:
    YOLO = None  # Permite execução em modo sintético caso ultralytics não esteja instalado

# Configurações padrão de integração com a API Principal (Porta 8000)
DEFAULT_API_URL = os.getenv("VENUE_API_URL", "http://127.0.0.1:8000/api/v1/telemetry/frame-analysis")
DEFAULT_API_TOKEN = os.getenv("VENUE_API_TOKEN", "dev-raiz-token-2026")
DEFAULT_VIDEO_PATH = os.getenv("VENUE_VIDEO_PATH", "video_teste_04.mp4")

FRAME_WIDTH = 640
FRAME_HEIGHT = 360

# Polígonos das zonas no frame 640x360:
# - zona_balcao: Área interna do estande/lounge (mapeada por padrão para PDV/Zona 3)
# - zona_fila: Área onde o público aguarda acesso (mapeada por padrão para PDV/Zona 1 - CAM-FLUXO-02)
ZONA_BALCAO = np.array([[30, 80], [320, 80], [320, 340], [30, 340]], np.int32)
ZONA_FILA = np.array([[330, 150], [620, 150], [620, 350], [330, 350]], np.int32)


def normalizar_coordenada(px: int, py: int, largura: int = FRAME_WIDTH, altura: int = FRAME_HEIGHT) -> Dict[str, float]:
    """
    Converte a coordenada em pixels (640x360) para a planta anônima normalizada (0.0..1000.0)
    exigida pelo contrato estrito `CoordinateContract` da API principal.
    """
    norm_x = round(min(max((px / float(largura)) * 1000.0, 0.0), 1000.0), 1)
    norm_y = round(min(max((py / float(altura)) * 1000.0, 0.0), 1000.0), 1)
    return {"x": norm_x, "y": norm_y}


def montar_payload_frame(
    pdv_id: int,
    coordenadas: List[Dict[str, float]],
    transacoes_pos_ultimos_3m: int,
    taxa_nfc_seg_por_pessoa: Optional[int] = None,
) -> Dict[str, object]:
    """
    Monta o payload estrito compatível com `TelemetryAnalysisRequestContract` (`extra="forbid"`).
    Zero campos de estoque/insumos e zero identificação pessoal (100% anônimo).
    """
    return {
        "pdv_id": pdv_id,
        "sensor_status": "ONLINE",
        "coordenadas_simuladas": coordenadas,
        "transacoes_pos_ultimos_3m": max(0, int(transacoes_pos_ultimos_3m)),
        "taxa_nfc_seg_por_pessoa": taxa_nfc_seg_por_pessoa,
        "simular_falha_ia": "NENHUMA",
    }


def enviar_telemetria_zona(
    session: requests.Session,
    api_url: str,
    token: str,
    payload: Dict[str, object],
    timeout: float = 1.0,
) -> Optional[Dict[str, object]]:
    """Envia o pacote de coordenadas da zona para `POST /api/v1/telemetry/frame-analysis`."""
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    try:
        response = session.post(api_url, json=payload, headers=headers, timeout=timeout)
        if response.status_code in (200, 201):
            return response.json()
        print(f"⚠️ Resposta HTTP {response.status_code} ao enviar PDV {payload['pdv_id']}: {response.text[:160]}")
    except requests.exceptions.RequestException as exc:
        print(f"⚠️ API indisponível ({api_url}): {exc}")
    return None


def localizar_arquivo_video(video_arg: str) -> Optional[str]:
    """Procura o arquivo de vídeo no diretório atual, na pasta do script ou na raiz do repositório."""
    if video_arg.isdigit():
        return video_arg
    candidatos = [
        Path(video_arg),
        Path(__file__).resolve().parent / video_arg,
        Path(__file__).resolve().parent.parent / video_arg,
    ]
    for caminho in candidatos:
        if caminho.is_file():
            return str(caminho)
    return None


def _gerar_frame_sintetico(frame_idx: int) -> Tuple[np.ndarray, List[Tuple[int, int]], List[Tuple[int, int]]]:
    """
    Fallback visual caso o arquivo `.mp4` não esteja presente no disco:
    gera um frame 640x360 com posições simuladas de pessoas no estande e na fila.
    """
    frame = np.full((FRAME_HEIGHT, FRAME_WIDTH, 3), (28, 32, 38), dtype=np.uint8)
    ciclo = (frame_idx // 3) % 90
    qtd_balcao = 3 + (ciclo % 5)
    qtd_fila = 2 + (ciclo // 10)  # Sobe gradualmente de 2 até 10 pessoas na fila (dispara alerta >= 6)

    pes_balcao: List[Tuple[int, int]] = []
    pes_fila: List[Tuple[int, int]] = []

    for i in range(qtd_balcao):
        px = 70 + ((i * 55 + frame_idx * 2) % 210)
        py = 130 + ((i * 47) % 180)
        pes_balcao.append((px, py))
        cv2.rectangle(frame, (px - 14, py - 50), (px + 14, py), (16, 185, 129), 2)
        cv2.circle(frame, (px, py), 4, (16, 185, 129), -1)

    for i in range(qtd_fila):
        px = 360 + ((i * 38 + frame_idx) % 230)
        py = 180 + ((i * 33) % 145)
        pes_fila.append((px, py))
        cv2.rectangle(frame, (px - 14, py - 50), (px + 14, py), (59, 130, 246), 2)
        cv2.circle(frame, (px, py), 4, (59, 130, 246), -1)

    return frame, pes_balcao, pes_fila


def executar_analisador(
    video_path: str = DEFAULT_VIDEO_PATH,
    api_url: str = DEFAULT_API_URL,
    api_token: str = DEFAULT_API_TOKEN,
    pdv_fila: int = 1,
    pdv_estande: int = 3,
    headless: bool = False,
    max_frames: Optional[int] = None,
    forcar_sintetico: bool = False,
) -> None:
    caminho_resolvido = None if forcar_sintetico else localizar_arquivo_video(video_path)
    usar_sintetico = caminho_resolvido is None or YOLO is None

    model = None
    cap = None

    if not usar_sintetico:
        print("🔄 Carregando modelo de Inteligência Artificial (YOLOv8n)...")
        model_path = localizar_arquivo_video("yolov8n.pt") or "yolov8n.pt"
        model = YOLO(model_path)
        origem_video = int(caminho_resolvido) if caminho_resolvido.isdigit() else caminho_resolvido
        cap = cv2.VideoCapture(origem_video)
        if not cap.isOpened():
            print(f"⚠️ Não foi possível abrir '{video_path}'. Ativando gerador sintético de frames.")
            usar_sintetico = True
        else:
            print(f"🎥 Vídeo '{caminho_resolvido}' carregado. Enviando telemetria para: {api_url}")
    else:
        motivo = "modo --sintetico" if forcar_sintetico else f"vídeo '{video_path}' não encontrado ou YOLO ausente"
        print(f"ℹ️ Iniciando em modo de simulação óptica ({motivo}).")
        print(f"📡 Conectado à API Principal: {api_url}")

    if not headless:
        print("Pressione a tecla 'q' na janela do vídeo para encerrar a qualquer momento.\n")

    session = requests.Session()
    frame_count = 0
    ultima_resposta_fila: Optional[Dict[str, object]] = None

    try:
        while True:
            if max_frames is not None and frame_count >= max_frames:
                print(f"🏁 Limite de {max_frames} frames atingido.")
                break

            if not usar_sintetico and cap is not None:
                ret, frame = cap.read()
                if not ret:
                    print("🏁 Fim do vídeo alcançado.")
                    break
                frame_count += 1
                if frame_count % 3 != 0:
                    continue

                frame = cv2.resize(frame, (FRAME_WIDTH, FRAME_HEIGHT))
                results = model.track(frame, classes=[0], persist=True, verbose=False)

                coords_estande: List[Dict[str, float]] = []
                coords_fila: List[Dict[str, float]] = []

                if results[0].boxes:
                    for box in results[0].boxes:
                        x1, y1, x2, y2 = map(int, box.xyxy[0])
                        ponto_pes = (int((x1 + x2) / 2), y2)

                        in_balcao = cv2.pointPolygonTest(ZONA_BALCAO, ponto_pes, False) >= 0
                        in_fila = cv2.pointPolygonTest(ZONA_FILA, ponto_pes, False) >= 0

                        coord_norm = normalizar_coordenada(ponto_pes[0], ponto_pes[1])
                        if in_balcao:
                            coords_estande.append(coord_norm)
                        elif in_fila:
                            coords_fila.append(coord_norm)

                annotated_frame = results[0].plot()
            else:
                frame_count += 3
                annotated_frame, pes_balcao, pes_fila = _gerar_frame_sintetico(frame_count)
                coords_estande = [normalizar_coordenada(x, y) for x, y in pes_balcao]
                coords_fila = [normalizar_coordenada(x, y) for x, y in pes_fila]

            pessoas_no_estande = len(coords_estande)
            pessoas_na_fila = len(coords_fila)

            # 1. Envia coordenadas da Zona de Fila (ex.: PDV 1 — Z1 | Acesso Estande Principal / CAM-FLUXO-02)
            payload_fila = montar_payload_frame(
                pdv_id=pdv_fila,
                coordenadas=coords_fila,
                transacoes_pos_ultimos_3m=max(1, pessoas_no_estande * 2),
            )
            resp_fila = enviar_telemetria_zona(session, api_url, api_token, payload_fila)
            if resp_fila:
                ultima_resposta_fila = resp_fila

            # 2. Envia coordenadas da Zona do Estande/Lounge (ex.: PDV 3 — Z3 | Lounge e Mesas de Reunião)
            payload_estande = montar_payload_frame(
                pdv_id=pdv_estande,
                coordenadas=coords_estande,
                transacoes_pos_ultimos_3m=pessoas_no_estande,
            )
            enviar_telemetria_zona(session, api_url, api_token, payload_estande)

            # Extrai indicadores calculados pelo `ai_engine.py` da nossa API Principal
            if ultima_resposta_fila and isinstance(ultima_resposta_fila.get("leitura"), dict):
                leitura_api = ultima_resposta_fila["leitura"]
                cor = leitura_api.get("status_cor", "VERDE")
                espera_fmt = leitura_api.get("tempo_espera_fmt", "0m 00s")
                densidade = leitura_api.get("densidade_m2", 0.0)
                anomalias = leitura_api.get("anomalias", [])
                alerta_assistido = pessoas_na_fila >= 6 or leitura_api.get("tempo_espera_seg", 0) >= 210

                print(
                    f"📊 [Frame {frame_count:04d}] Estande (Z{pdv_estande}): {pessoas_no_estande} pax | "
                    f"Fila (Z{pdv_fila}): {pessoas_na_fila} pax | Espera IA: {espera_fmt} | "
                    f"Densidade: {densidade} pax/m² | Semáforo: {cor}"
                )
                if anomalias or alerta_assistido:
                    motivos = ", ".join(anomalias) if anomalias else "ESPERA_ACIMA_DO_ALVO"
                    print(f"   ⚠️ Alerta Assistido na API (Z{pdv_fila}): {motivos} (Redirecionamento Push ativo)")

            if not headless:
                cv2.polylines(annotated_frame, [ZONA_BALCAO], True, (0, 255, 0), 2)
                cv2.polylines(annotated_frame, [ZONA_FILA], True, (0, 0, 255), 2)

                # HUD com retorno da API Principal
                hud_texto = f"Estande: {pessoas_no_estande} pax | Fila: {pessoas_na_fila} pax"
                if ultima_resposta_fila and isinstance(ultima_resposta_fila.get("leitura"), dict):
                    l_hud = ultima_resposta_fila["leitura"]
                    hud_texto += f" | API: {l_hud.get('status_cor')} ({l_hud.get('tempo_espera_fmt')})"
                cv2.putText(
                    annotated_frame, hud_texto, (12, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2
                )

                cv2.imshow("RaizEvento / Venue Intelligence - YOLO Edge Worker", annotated_frame)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break
    finally:
        if cap is not None:
            cap.release()
        if not headless:
            cv2.destroyAllWindows()
        session.close()
        print("🛑 Analisador de vídeo encerrado.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Worker YOLOv8 (Formato A) conectado à API Venue Intelligence / RaizEvento (porta 8000)."
    )
    parser.add_argument("--video", default=DEFAULT_VIDEO_PATH, help="Caminho do vídeo .mp4 ou índice da webcam (0).")
    parser.add_argument("--api-url", default=DEFAULT_API_URL, help="Endpoint POST /api/v1/telemetry/frame-analysis.")
    parser.add_argument("--token", default=DEFAULT_API_TOKEN, help="Bearer token JWT (padrão: dev-raiz-token-2026).")
    parser.add_argument("--pdv-fila", type=int, default=1, help="ID da zona de fila na API (padrão: 1 = Z1).")
    parser.add_argument("--pdv-estande", type=int, default=3, help="ID da zona de estande na API (padrão: 3 = Z3).")
    parser.add_argument("--headless", action="store_true", help="Executa sem abrir janela gráfica OpenCV.")
    parser.add_argument("--sintetico", action="store_true", help="Força geração sintética de frames sem arquivo .mp4.")
    parser.add_argument("--max-frames", type=int, default=None, help="Encerra após processar N frames.")
    args = parser.parse_args()

    executar_analisador(
        video_path=args.video,
        api_url=args.api_url,
        api_token=args.token,
        pdv_fila=args.pdv_fila,
        pdv_estande=args.pdv_estande,
        headless=args.headless,
        max_frames=args.max_frames,
        forcar_sintetico=args.sintetico,
    )


if __name__ == "__main__":
    main()
