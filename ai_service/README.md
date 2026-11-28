# Venue Intelligence · Mecanismo de IA (`ai_service`)

Serviço FastAPI **stateless** responsável apenas por:
- Cálculo de tempo de espera, densidade e anomalias (`POST /ai/v1/inferencia`)
- Detecção óptica por polígonos YOLOv8n (`POST /ai/v1/yolo-scan`)
- Regressão linear de predição de filas em `+5/+10/+15 min` (`POST /ai/v1/predicoes/calcular`)
- Checagem de saúde (`GET /ai/v1/health`)

## Rodar localmente (porta 8001)
```bash
uvicorn ai_service.main:app --reload --port 8001
```

## Deploy separado no Render (repositório próprio ou Root Directory `ai_service`)
- **Build Command:** `pip install -r requirements.txt`
- **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
- **Variável opcional:** `AI_ENGINE_SECRET` (mesmo valor cadastrado no Backend para proteger as rotas `/ai/v1/*`)
