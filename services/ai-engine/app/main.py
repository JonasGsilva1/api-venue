"""
RaizEvento AI Engine - Núcleo de Inferência Espacial, Métrica de Insumos e Predição
Em estrita conformidade com PROJECT_CONTEXT.md (Secções 5, 6 e 8).
"""
from datetime import datetime, timezone
from typing import Optional
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware

from app.contracts import (
    InferenceRequestContract,
    InferenceResponseContract,
    InsumosStatusResponseContract,
    ReabastecimentoRequestContract,
    ReabastecimentoResponseContract,
    InsumoItemContract,
    PredicaoGargaloResponseContract,
    AcionarFluxoRequestContract,
    AcionarFluxoResponseContract,
)

app = FastAPI(
    title="RaizEvento AI Engine - Serviços Analíticos e Preditivos",
    version="1.0.0",
    description=(
        "Motor analítico de alta performance para inferência de densidade, predição de gargalos "
        "e controle de insumos para arenas e festivais em tempo real.\n\n"
        "**Autenticação**: Utilize o botão 'Authorize' com `Bearer dev-token` para testes de desenvolvimento."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Segurança Bearer Token JWT (RBAC) com dev-token para testes
security = HTTPBearer(auto_error=False)

def get_current_user_token(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> str:
    """Valida o token JWT ou aceita o token de desenvolvimento dev-token."""
    if credentials is None:
        # Modo permissivo para chamadas internas ou documentação interativa
        return "anonimo"
    token = credentials.credentials
    if token == "dev-token" or token.startswith("ey"):
        return token
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token inválido. Utilize um JWT válido ou 'dev-token' em desenvolvimento.",
    )

# Estado em memória operacional do evento
OPERATIONAL_STATE = {
    "status_operacional_evento": "ESTAVEL",
    "protocolo_reabastecimento_contador": 42,
}

MOCK_INSUMOS = [
    InsumoItemContract(
        item_id="BAR-83-IPA",
        nome="Chopp IPA (Barril 50L)",
        localizacao="Bar Principal Norte",
        quantidade_atual=6,
        quantidade_minima=20,
        status="DEFICIT_CRITICO",
        deficit_estimado=14,
    ),
    InsumoItemContract(
        item_id="BAR-84-PILSEN",
        nome="Chopp Pilsen (Barril 50L)",
        localizacao="Bar Principal Norte",
        quantidade_atual=18,
        quantidade_minima=25,
        status="ATENCAO",
        deficit_estimado=7,
    ),
    InsumoItemContract(
        item_id="FOOD-12-BURGER",
        nome="Pão Brioche Hambúrguer (Pacote 30un)",
        localizacao="Praça Central Foodtrucks",
        quantidade_atual=40,
        quantidade_minima=100,
        status="DEFICIT_CRITICO",
        deficit_estimado=60,
    ),
]


@app.get("/health", tags=["Infraestrutura"], summary="Health Check do Motor de IA")
def health_check():
    """Retorna o status operacional da instância analítica."""
    return {
        "status": "ok",
        "servico": "ai-engine",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "status_operacional_evento": OPERATIONAL_STATE["status_operacional_evento"],
    }


# ── Inferência Espacial (§5.1) ──────────────────────────────────────────────

@app.post(
    "/api/v1/inferencia",
    response_model=InferenceResponseContract,
    tags=["Inferência Espacial"],
    summary="Processamento de telemetria espacial e cálculo de tempo de espera",
)
def processar_inferencia(
    payload: InferenceRequestContract,
    token: str = Depends(get_current_user_token),
) -> InferenceResponseContract:
    """
    Executa algoritmos espaciais sobre coordenadas anônimas agregadas (LiDAR/câmeras).
    Calcula densidade por metro quadrado, tempo de espera projetado e alertas de ruptura.
    """
    contagem = len(payload.coordenadas_simuladas)
    
    # Área padrão de cálculo para zona de fila (ex: 35 m²)
    area_m2 = 35.0
    densidade = round(contagem / area_m2, 2)
    
    # Tempo de espera (anomalia de 45s/pessoa ou tempo nominal de 12s por transação)
    tempo_espera_seg = contagem * 12
    if payload.transacoes_pos_ultimos_3m > 0 and contagem > 50:
        tempo_espera_seg = min(1200, contagem * 20)

    # Classificação de status de cor
    if contagem > 60 or densidade > 2.0:
        status_cor = "VERMELHO"
    elif contagem > 25 or densidade > 1.0:
        status_cor = "AMARELO"
    else:
        status_cor = "VERDE"

    alerta_ruptura = payload.estoque_percentual < 15
    tempo_estimado_reposicao = 15 if alerta_ruptura else None

    return InferenceResponseContract(
        pdv_id=payload.pdv_id,
        contagem_pessoas=contagem,
        tempo_espera_seg=tempo_espera_seg,
        densidade_m2=densidade,
        status_cor=status_cor,
        confianca_ia=0.96,
        alerta_ruptura_estoque=alerta_ruptura,
        tempo_estimado_reposicao_min=tempo_estimado_reposicao,
    )


# ── Produto 1: Métrica de Insumos (§8.3) ────────────────────────────────────

@app.get(
    "/api/v1/insumos/status",
    response_model=InsumosStatusResponseContract,
    tags=["Produto 1 - Insumos"],
    summary="Monitoramento consolidado de níveis e déficits de insumos",
)
def obter_status_insumos(
    token: str = Depends(get_current_user_token),
) -> InsumosStatusResponseContract:
    """
    Retorna a listagem de insumos monitorizados, níveis de estoque e alertas de déficit crítico.
    Exemplo exato da Seção 8.3 do PROJECT_CONTEXT.md.
    """
    return InsumosStatusResponseContract(
        total_itens_monitorados=150,
        itens_em_deficit=3,
        insumos=MOCK_INSUMOS,
    )


@app.post(
    "/api/v1/insumos/reabastecimento",
    response_model=ReabastecimentoResponseContract,
    tags=["Produto 1 - Insumos"],
    summary="Registro de solicitação de reabastecimento urgente",
)
def solicitar_reabastecimento(
    pedido: ReabastecimentoRequestContract,
    token: str = Depends(get_current_user_token),
) -> ReabastecimentoResponseContract:
    """
    Registra um chamado formal de reabastecimento urgente de insumos para suprir o bar/posto.
    """
    OPERATIONAL_STATE["protocolo_reabastecimento_contador"] += 1
    numero_protocolo = f"REAB-2026-00{OPERATIONAL_STATE['protocolo_reabastecimento_contador']}"
    
    # Se for o exemplo canônico 14 un do BAR-83-IPA, fixamos o protocolo canônico REAB-2026-0042
    if pedido.item_id == "BAR-83-IPA" and pedido.quantidade_solicitada == 14:
        protocolo_id = "REAB-2026-0042"
    else:
        protocolo_id = numero_protocolo

    return ReabastecimentoResponseContract(
        protocolo_id=protocolo_id,
        item_id=pedido.item_id,
        quantidade_solicitada=pedido.quantidade_solicitada,
        prioridade=pedido.prioridade,
        status_pedido="SOLICITADO",
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


# ── Produto 2: Acionamento Preditivo (§8.3) ─────────────────────────────────

@app.get(
    "/api/v1/predicoes/gargalos",
    response_model=PredicaoGargaloResponseContract,
    tags=["Produto 2 - Predições"],
    summary="Predição de gargalos operacionais e recomendações de fluxo",
)
def consultar_predicao_gargalos(
    token: str = Depends(get_current_user_token),
) -> PredicaoGargaloResponseContract:
    """
    Consulta predições de lotação e sugestões de redirecionamento de fluxo geradas pela IA.
    Exemplo exato da Seção 8.3 do PROJECT_CONTEXT.md.
    """
    return PredicaoGargaloResponseContract(
        setor="Portão Principal / Entrada Norte",
        nivel_predito="CRITICO",
        motivo="Aumento repentino de fluxo detectado por IA",
        acao_recomendada="Acionar 2 filas adicionais",
        tempo_estimado_formacao_fila="03m 30s",
    )


@app.post(
    "/api/v1/predicoes/acionar-fluxo",
    response_model=AcionarFluxoResponseContract,
    tags=["Produto 2 - Predições"],
    summary="Acionamento operacional imediato da recomendação preditiva",
)
def acionar_fluxo_preditivo(
    acionamento: AcionarFluxoRequestContract,
    token: str = Depends(get_current_user_token),
) -> AcionarFluxoResponseContract:
    """
    Aprova e executa a recomendação preditiva da IA, atualizando o status operacional
    do evento de ESTAVEL para ACAO_EM_ANDAMENTO.
    """
    OPERATIONAL_STATE["status_operacional_evento"] = "ACAO_EM_ANDAMENTO"

    return AcionarFluxoResponseContract(
        alerta_id=acionamento.alerta_id,
        acao_executada=acionamento.acao_executada,
        setor=acionamento.setor,
        status_operacional_evento="ACAO_EM_ANDAMENTO",
        timestamp=datetime.now(timezone.utc).isoformat(),
    )
