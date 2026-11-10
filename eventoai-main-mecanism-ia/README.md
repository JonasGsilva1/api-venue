# Evento.ai — Worker de Visão Computacional YOLOv8 (Formato A)

Módulo de borda (*Edge Worker*) de Visão Computacional (YOLOv8 + OpenCV) e Simulador de Cenários (S01–S10) integrado diretamente à **API Unificada Venue Intelligence / RaizEvento** (`http://127.0.0.1:8000`).

## 📌 Arquitetura de Integração (Formato A)
1. **Worker de Visão (`video_analyzer.py`):**
   * Rastreia pessoas em tempo real usando `yolov8n.pt` + polígonos de zona (`ZONA_BALCAO` e `ZONA_FILA`) em `640x360`.
   * Extrai apenas a coordenada anônima da base de cada *bounding box* (`ponto_pes`) e normaliza para a escala `0.0..1000.0` (`CoordinateContract`).
   * Envia pacotes compatíveis com `TelemetryAnalysisRequestContract` (`extra="forbid"`, zero insumos) com autenticação `Bearer dev-raiz-token-2026` para `POST http://127.0.0.1:8000/api/v1/telemetry/frame-analysis`.
   * Caso o arquivo `video_teste_04.mp4` não esteja na pasta (ou com a flag `--sintetico`), aciona automaticamente o gerador sintético de frames para permitir demonstração imediata.
2. **Simulador de Storyboard (`simulator.py`):**
   * Dispara os cenários `S01` → `S02` → `S03` → `S07/S08` → `S10` alimentando as 5 zonas monitoradas (`Z1`, `Z2`, `Z3`, `Z5` e `Corredor de Acesso Norte`) na API principal.

## 🚀 Como Executar

### Terminal 1 — API Principal + Front-End React (na raiz do repositório):
```powershell
uvicorn app.main:app --reload --port 8000
```
* Front-End 3D: `http://localhost:8000`
* Swagger UI: `http://localhost:8000/docs`

### Terminal 2 — Worker de Visão Computacional YOLOv8:
```powershell
cd eventoai-main-mecanism-ia
python video_analyzer.py
```
Opções úteis do `video_analyzer.py`:
* `--video caminho/do/video.mp4` (ou `--video 0` para webcam)
* `--sintetico` (simula detecções e exibe o HUD OpenCV mesmo sem arquivo `.mp4`)
* `--headless --max-frames 30` (execução em terminal sem abrir janela gráfica)

### Alternativa — Simulador de Cenários (S01–S10):
```powershell
cd eventoai-main-mecanism-ia
python simulator.py
```
