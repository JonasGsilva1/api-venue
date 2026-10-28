#!/bin/sh
set -e

# Portas configuráveis
BACK_PORT=${PORT:-8000}
FRONT_PORT=${PORT_FRONTEND:-3000}

echo "======================================================================"
echo " [VENUE INTELLIGENCE CORE] INICIANDO SERVIÇO UNIFICADO NA MESMA URL"
echo " -> Porta Principal ($BACK_PORT):"
echo "    • Front-End Web: http://0.0.0.0:$BACK_PORT/"
echo "    • Documentação Swagger: http://0.0.0.0:$BACK_PORT/docs"
echo "    • API Gateway: http://0.0.0.0:$BACK_PORT/api/v1/..."
if [ "$FRONT_PORT" != "$BACK_PORT" ]; then
    echo " -> Porta Local Front-End Secundária: http://0.0.0.0:$FRONT_PORT"
fi
echo "======================================================================"

# Inicia servidor estático auxiliar na porta secundária se configurada
if [ "$FRONT_PORT" != "$BACK_PORT" ]; then
    python3 serve_front.py $FRONT_PORT &
    FRONT_PID=$!
    trap "kill -TERM $FRONT_PID 2>/dev/null || true; exit 0" SIGINT SIGTERM
fi

# Inicia o FastAPI Uvicorn na porta principal
exec uvicorn app.main:app --host 0.0.0.0 --port $BACK_PORT
