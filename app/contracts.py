"""
Contratos Pydantic v2 — fonte única de verdade de TODA entrada e saída da API RaizEvento.

Diretriz inegociável (PROJECT_CONTEXT.md §1.2): todos os modelos herdam de `ContratoEstrito`,
que define `model_config = ConfigDict(extra="forbid")`. Campos não mapeados (ex.: `rosto_id`,
`cpf`, `biometria`) são rejeitados com HTTP 400 — o que também materializa o guardrail de
anonimato absoluto (§1.4): não existe campo para identificação individual.
"""
from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class ContratoEstrito(BaseModel):
    """Base de todos os contratos: rejeita qualquer campo extra (contract-first)."""

    model_config = ConfigDict(extra="forbid")


# ════════════════════════════════════════════════════════════════════════════
# Enumerações (Literal) compartilhadas
# ════════════════════════════════════════════════════════════════════════════
StatusCor = Literal["VERDE", "AMARELO", "VERMELHO"]
ModoLeitura = Literal["TEMPO_REAL", "FALLBACK_502", "MEDIA_MOVEL_504", "CONTINGENCIA_503"]
SensorStatus = Literal["ONLINE", "OFFLINE"]
SimularFalhaIA = Literal["NENHUMA", "TIMEOUT_504", "DOWN_503"]
TipoZona = Literal["BAR", "ESTANDE"]
StatusOperacional = Literal["ESTAVEL", "ACAO_EM_ANDAMENTO"]
StatusInsumo = Literal["ESTAVEL", "ATENCAO", "DEFICIT_CRITICO"]
Prioridade = Literal["BAIXA", "MEDIA", "ALTA", "URGENTE"]
NivelPredito = Literal["BAIXO", "MEDIO", "ALTO", "CRITICO"]
NivelCritico = Literal["BAIXO", "MEDIO", "ALTO", "CRITICO", "CRITICO_PCD_CLIMA"]
StatusDispatch = Literal["PENDENTE", "EM_ANDAMENTO", "RESOLVIDO"]
Papel = Literal["visualizador", "operador", "admin"]
TipoAnomalia = Literal["NFC_LENTO", "RUPTURA_MASCARADA", "ESTOQUE_CRITICO", "SATURACAO"]
CodigoErro = Literal[
    "CONTRATO_VIOLADO",
    "NAO_AUTENTICADO",
    "ACESSO_NEGADO",
    "RECURSO_NAO_ENCONTRADO",
    "METODO_NAO_PERMITIDO",
    "ERRO_HTTP",
    "ERRO_INTERNO",
]
TipoEvento = Literal[
    "snapshot",
    "leitura",
    "mudanca_cor",
    "dispatch",
    "reabastecimento",
    "acionamento_preditivo",
    "heartbeat",
]

MAX_COORDENADAS_POR_FRAME = 5000


# ════════════════════════════════════════════════════════════════════════════
# Erros padronizados
# ════════════════════════════════════════════════════════════════════════════
class ErroCampoContract(ContratoEstrito):
    campo: str = Field(..., description="Caminho do campo inválido.", examples=["body.coordenadas_simuladas.0.x"])
    mensagem: str = Field(..., description="Motivo da rejeição.", examples=["Input should be less than or equal to 1000"])
    tipo: str = Field(..., description="Código técnico do erro de validação.", examples=["less_than_equal"])


class ErrorResponseContract(ContratoEstrito):
    erro: CodigoErro = Field(..., examples=["CONTRATO_VIOLADO"])
    mensagem: str = Field(..., examples=["Pacote descartado com segurança: o payload viola o contrato estrito."])
    status_code: int = Field(..., ge=400, le=599, examples=[400])
    detalhes: List[ErroCampoContract] = Field(default_factory=list)
    timestamp: datetime = Field(..., examples=["2026-10-14T20:30:00Z"])


# ════════════════════════════════════════════════════════════════════════════
# Autenticação JWT (RBAC)
# ════════════════════════════════════════════════════════════════════════════
class TokenRequestContract(ContratoEstrito):
    usuario: str = Field(
        ...,
        min_length=3,
        max_length=60,
        pattern=r"^[a-z0-9._-]+$",
        description="Identificador técnico do operador (sem dados pessoais).",
        examples=["central.controle"],
    )
    papel: Papel = Field(..., description="Papel RBAC solicitado.", examples=["operador"])


class TokenResponseContract(ContratoEstrito):
    access_token: str = Field(..., examples=["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."])
    token_type: Literal["bearer"] = Field("bearer", examples=["bearer"])
    expira_em_seg: int = Field(..., gt=0, examples=[28800])
    papel: Papel = Field(..., examples=["operador"])


# ════════════════════════════════════════════════════════════════════════════
# Infraestrutura
# ════════════════════════════════════════════════════════════════════════════
class HealthResponseContract(ContratoEstrito):
    status: Literal["ok"] = Field("ok", examples=["ok"])
    servico: str = Field(..., examples=["venue-intelligence-core"])
    versao: str = Field(..., examples=["2.0.0"])
    timestamp: datetime = Field(..., examples=["2026-10-14T20:30:00Z"])
    status_operacional_evento: StatusOperacional = Field(..., examples=["ESTAVEL"])
    motor_ia_online: bool = Field(..., examples=[True])
    conexoes_tempo_real: int = Field(..., ge=0, description="Clientes WS + SSE conectados.", examples=[2])


# ════════════════════════════════════════════════════════════════════════════
# Módulo A — Telemetria, Motor de IA e Resiliência
# ════════════════════════════════════════════════════════════════════════════
class CoordinateContract(ContratoEstrito):
    x: float = Field(..., ge=0.0, le=1000.0, description="Coordenada X anônima na planta (0..1000).", examples=[120.5])
    y: float = Field(..., ge=0.0, le=1000.0, description="Coordenada Y anônima na planta (0..1000).", examples=[180.2])


_EXEMPLO_COORDENADAS = [
    {"x": 120.5, "y": 180.2},
    {"x": 122.0, "y": 184.7},
    {"x": 125.3, "y": 179.9},
    {"x": 118.1, "y": 182.4},
    {"x": 121.7, "y": 177.0},
    {"x": 124.9, "y": 186.3},
]


class TelemetryAnalysisRequestContract(ContratoEstrito):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "examples": [
                {
                    "pdv_id": 1,
                    "sensor_status": "ONLINE",
                    "coordenadas_simuladas": _EXEMPLO_COORDENADAS,
                    "transacoes_pos_ultimos_3m": 4,
                    "estoque_percentual": 42,
                    "taxa_nfc_seg_por_pessoa": None,
                    "simular_falha_ia": "NENHUMA",
                }
            ]
        },
    )

    pdv_id: int = Field(..., gt=0, description="ID da zona/PDV monitorado (ver GET /api/v1/pdv/status).", examples=[1])
    sensor_status: SensorStatus = Field("ONLINE", description="OFFLINE aciona o FALLBACK_502.", examples=["ONLINE"])
    coordenadas_simuladas: List[CoordinateContract] = Field(
        ...,
        max_length=MAX_COORDENADAS_POR_FRAME,
        description="Posições anônimas e agregadas (LiDAR/câmeras). Cada ponto = 1 pax.",
        examples=[_EXEMPLO_COORDENADAS],
    )
    transacoes_pos_ultimos_3m: int = Field(..., ge=0, description="Vendas/retiradas no POS nos últimos 3 min.", examples=[4])
    estoque_percentual: int = Field(100, ge=0, le=100, description="Nível do estoque/barril da zona (0..100).", examples=[42])
    taxa_nfc_seg_por_pessoa: Optional[int] = Field(
        None, ge=1, le=600, description="Ritmo medido no leitor NFC/POS (anomalia a partir de 45 s/pessoa).", examples=[45]
    )
    simular_falha_ia: SimularFalhaIA = Field(
        "NENHUMA", description="Injeção de falha no motor de IA: TIMEOUT_504 ou DOWN_503.", examples=["NENHUMA"]
    )


class TelemetryReadingContract(ContratoEstrito):
    id: int = Field(..., gt=0, examples=[91])
    pdv_id: int = Field(..., gt=0, examples=[1])
    timestamp: datetime = Field(..., examples=["2026-10-14T20:30:00Z"])
    pax_count: int = Field(..., ge=0, description="Contagem anônima agregada de pessoas.", examples=[6])
    tempo_espera_seg: int = Field(..., ge=0, examples=[228])
    tempo_espera_fmt: str = Field(..., description="Tempo de espera legível.", examples=["3m 48s"])
    densidade_m2: float = Field(..., ge=0.0, examples=[0.26])
    status_cor: StatusCor = Field(..., examples=["VERDE"])
    confianca_ia: float = Field(..., ge=0.0, le=1.0, examples=[0.94])
    alerta_ruptura_estoque: bool = Field(..., examples=[False])
    anomalias: List[TipoAnomalia] = Field(default_factory=list, examples=[["NFC_LENTO"]])
    modo_leitura: ModoLeitura = Field(..., examples=["TEMPO_REAL"])
    sensor_status: SensorStatus = Field(..., examples=["ONLINE"])
    transacoes_pos_ultimos_3m: int = Field(..., ge=0, examples=[4])
    estoque_percentual: int = Field(..., ge=0, le=100, examples=[42])


class TelemetryAnalysisResponseContract(ContratoEstrito):
    sucesso: bool = Field(..., description="true em TEMPO_REAL; false quando um plano de contingência foi aplicado.", examples=[True])
    http_status: Literal[201, 502, 503, 504] = Field(..., description="Código HTTP devolvido.", examples=[201])
    modo_leitura: ModoLeitura = Field(..., examples=["TEMPO_REAL"])
    aviso_contingencia: Optional[str] = Field(None, description="Explicação da contingência (null em TEMPO_REAL).", examples=[None])
    leitura: TelemetryReadingContract


class InferenceRequestContract(ContratoEstrito):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "examples": [
                {
                    "pdv_id": 1,
                    "coordenadas_simuladas": _EXEMPLO_COORDENADAS,
                    "transacoes_pos_ultimos_3m": 0,
                    "estoque_percentual": 12,
                    "taxa_nfc_seg_por_pessoa": 45,
                }
            ]
        },
    )

    pdv_id: int = Field(..., gt=0, description="Zona usada para calibrar área e ritmo de atendimento.", examples=[1])
    coordenadas_simuladas: List[CoordinateContract] = Field(..., max_length=MAX_COORDENADAS_POR_FRAME, examples=[_EXEMPLO_COORDENADAS])
    transacoes_pos_ultimos_3m: int = Field(..., ge=0, examples=[0])
    estoque_percentual: int = Field(100, ge=0, le=100, examples=[12])
    taxa_nfc_seg_por_pessoa: Optional[int] = Field(None, ge=1, le=600, examples=[45])


class InferenceResponseContract(ContratoEstrito):
    pdv_id: int = Field(..., gt=0, examples=[1])
    pax_count: int = Field(..., ge=0, examples=[6])
    tempo_espera_seg: int = Field(..., ge=0, examples=[228])
    tempo_espera_fmt: str = Field(..., examples=["3m 48s"])
    densidade_m2: float = Field(..., ge=0.0, examples=[0.26])
    status_cor: StatusCor = Field(..., description="VERDE < 300s · AMARELO 300..720s · VERMELHO > 720s.", examples=["VERDE"])
    confianca_ia: float = Field(..., ge=0.0, le=1.0, examples=[0.94])
    alerta_ruptura_estoque: bool = Field(..., description="pax >= 6 com 0 vendas no POS, ou barril <= 12%.", examples=[True])
    anomalias: List[TipoAnomalia] = Field(default_factory=list, examples=[["NFC_LENTO", "RUPTURA_MASCARADA"]])
    tempo_estimado_reposicao_min: Optional[int] = Field(None, ge=0, examples=[18])


# ════════════════════════════════════════════════════════════════════════════
# Módulo B — Produto 1: Métrica de Insumos
# ════════════════════════════════════════════════════════════════════════════
class InsumoItemContract(ContratoEstrito):
    item_id: str = Field(..., examples=["BAR-83-IPA"])
    nome: str = Field(..., examples=["Chopp IPA (Barril 50L)"])
    localizacao: str = Field(..., examples=["Bar Principal Norte"])
    quantidade_atual: int = Field(..., ge=0, examples=[6])
    quantidade_minima: int = Field(..., ge=0, examples=[20])
    status: StatusInsumo = Field(..., examples=["DEFICIT_CRITICO"])
    deficit_estimado: int = Field(..., ge=0, examples=[14])


class InsumosStatusResponseContract(ContratoEstrito):
    """Objeto raiz `{ ... }` — NUNCA uma lista `[ { ... } ]` (PROJECT_CONTEXT.md §5, Módulo B)."""

    total_itens_monitorados: int = Field(..., ge=0, examples=[150])
    itens_em_deficit: int = Field(..., ge=0, examples=[2])
    insumos: List[InsumoItemContract]


class ReabastecimentoRequestContract(ContratoEstrito):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={"examples": [{"item_id": "BAR-83-IPA", "quantidade_solicitada": 14, "prioridade": "ALTA"}]},
    )

    item_id: str = Field(..., pattern=r"^[A-Z0-9]+(-[A-Z0-9]+)+$", examples=["BAR-83-IPA"])
    quantidade_solicitada: int = Field(..., gt=0, le=10000, examples=[14])
    prioridade: Prioridade = Field(..., examples=["ALTA"])


class ReabastecimentoResponseContract(ContratoEstrito):
    protocolo_id: str = Field(..., examples=["REAB-2026-0042"])
    item_id: str = Field(..., examples=["BAR-83-IPA"])
    nome_item: str = Field(..., examples=["Chopp IPA (Barril 50L)"])
    localizacao: str = Field(..., examples=["Bar Principal Norte"])
    quantidade_solicitada: int = Field(..., gt=0, examples=[14])
    prioridade: Prioridade = Field(..., examples=["ALTA"])
    status_pedido: Literal["SOLICITADO"] = Field("SOLICITADO", examples=["SOLICITADO"])
    solicitado_em: datetime = Field(..., examples=["2026-10-14T20:30:00Z"])


# ════════════════════════════════════════════════════════════════════════════
# Módulo C — Produto 2: Acionamento Preditivo e Despacho Tático
# ════════════════════════════════════════════════════════════════════════════
class PredicaoGargaloResponseContract(ContratoEstrito):
    setor: str = Field(..., examples=["Portão Principal / Entrada Norte"])
    nivel_predito: NivelPredito = Field(..., examples=["CRITICO"])
    motivo: str = Field(..., examples=["Aumento repentino de fluxo detectado por IA"])
    acao_recomendada: str = Field(..., examples=["Acionar 2 filas adicionais"])
    tempo_estimado_formacao_fila: str = Field(..., examples=["03m 30s"])


class AcionarFluxoRequestContract(ContratoEstrito):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "examples": [
                {"alerta_id": "PRED-9921", "acao_executada": "ACIONAR_DUAS_FILAS_ADICIONAIS", "setor": "Portão Principal"}
            ]
        },
    )

    alerta_id: str = Field(..., pattern=r"^PRED-\d{1,10}$", examples=["PRED-9921"])
    acao_executada: str = Field(..., pattern=r"^[A-Z0-9_]{3,80}$", examples=["ACIONAR_DUAS_FILAS_ADICIONAIS"])
    setor: str = Field(..., min_length=2, max_length=120, examples=["Portão Principal"])


class AcionarFluxoResponseContract(ContratoEstrito):
    alerta_id: str = Field(..., examples=["PRED-9921"])
    acao_executada: str = Field(..., examples=["ACIONAR_DUAS_FILAS_ADICIONAIS"])
    setor: str = Field(..., examples=["Portão Principal"])
    status_operacional_anterior: StatusOperacional = Field(..., examples=["ESTAVEL"])
    status_operacional_evento: Literal["ACAO_EM_ANDAMENTO"] = Field("ACAO_EM_ANDAMENTO", examples=["ACAO_EM_ANDAMENTO"])
    registrado_em: datetime = Field(..., examples=["2026-10-14T20:30:00Z"])


class DispatchRequestContract(ContratoEstrito):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "examples": [
                {
                    "pdv_id": 5,
                    "nivel_critico": "CRITICO",
                    "sugestao_acao": "Remanejar 2 bartenders do Z2 para o Bar Principal Norte e abrir caixa extra",
                }
            ]
        },
    )

    pdv_id: int = Field(..., gt=0, examples=[5])
    nivel_critico: NivelCritico = Field(..., examples=["CRITICO"])
    sugestao_acao: str = Field(..., min_length=5, max_length=500, examples=["Remanejar 2 bartenders para o Bar Principal Norte"])


class DispatchResponseContract(ContratoEstrito):
    id: int = Field(..., gt=0, examples=[1])
    pdv_id: int = Field(..., gt=0, examples=[5])
    nome_zona: str = Field(..., examples=["Bar Principal Norte"])
    nivel_critico: NivelCritico = Field(..., examples=["CRITICO"])
    sugestao_acao: str = Field(..., examples=["Remanejar 2 bartenders para o Bar Principal Norte"])
    status: StatusDispatch = Field(..., examples=["EM_ANDAMENTO"])
    criado_em: datetime = Field(..., examples=["2026-10-14T20:30:00Z"])
    status_operacional_evento: StatusOperacional = Field(..., examples=["ACAO_EM_ANDAMENTO"])


class DispatchListResponseContract(ContratoEstrito):
    total_ordens: int = Field(..., ge=0, examples=[1])
    status_operacional_evento: StatusOperacional = Field(..., examples=["ACAO_EM_ANDAMENTO"])
    ordens: List[DispatchResponseContract]


# ════════════════════════════════════════════════════════════════════════════
# Módulo D — Painel do Estande, Mapa de Calor e Analytics (S01–S10)
# ════════════════════════════════════════════════════════════════════════════
class IndicadoresZonaContract(ContratoEstrito):
    fila_pax: Optional[int] = Field(None, ge=0, examples=[6])
    tempo_espera_seg: Optional[int] = Field(None, ge=0, examples=[228])
    estoque_pct: Optional[int] = Field(None, ge=0, le=100, examples=[42])
    reposicao_min: Optional[int] = Field(None, ge=0, examples=[18])
    retiradas: Optional[int] = Field(None, ge=0, examples=[48])
    variacao_pct: Optional[int] = Field(None, examples=[12])
    permanencia_media_seg: Optional[int] = Field(None, ge=0, examples=[204])
    reunioes_ativas: Optional[int] = Field(None, ge=0, examples=[1])
    interacoes: Optional[int] = Field(None, ge=0, examples=[14])


class ZonaStatusContract(ContratoEstrito):
    id: int = Field(..., gt=0, examples=[1])
    codigo_zona: str = Field(..., examples=["Z1"])
    nome: str = Field(..., examples=["Z1 | Balcão Principal de Drinks"])
    tipo: TipoZona = Field(..., examples=["BAR"])
    area_m2: float = Field(..., gt=0, examples=[23.0])
    capacidade: int = Field(..., gt=0, examples=[40])
    indicadores: IndicadoresZonaContract
    ultima_leitura: Optional[TelemetryReadingContract] = None
    habilitar_redirecionamento_push: bool = Field(..., description="true SOMENTE quando tempo_espera_seg > 180.", examples=[True])


class PdvStatusResponseContract(ContratoEstrito):
    total_zonas: int = Field(..., ge=0, examples=[5])
    status_operacional_evento: StatusOperacional = Field(..., examples=["ESTAVEL"])
    atualizado_em: datetime = Field(..., examples=["2026-10-14T20:30:00Z"])
    zonas: List[ZonaStatusContract]


class ReadinessContract(ContratoEstrito):
    sensores_ativos: int = Field(..., ge=0, examples=[5])
    fontes_online_str: str = Field(..., examples=["6/6"])
    cameras_neurais_ativas: int = Field(..., ge=0, examples=[12])
    sensores_iot_barris: int = Field(..., ge=0, examples=[54])
    lidar_fps: int = Field(..., ge=0, examples=[60])
    estoque_inicial_ok: bool = Field(..., examples=[True])
    rota_livre_ok: bool = Field(..., examples=[True])
    motor_ia_online: bool = Field(..., examples=[True])


class HeatmapGlobalContract(ContratoEstrito):
    pessoas_presentes: int = Field(..., ge=0, examples=[24])
    ocupacao_estimada_pct: int = Field(..., ge=0, le=100, examples=[46])
    permanencia_media_seg: int = Field(..., ge=0, examples=[318])
    densidade_maxima_m2: float = Field(..., ge=0, examples=[0.78])
    velocidade_media_ms: float = Field(..., ge=0, examples=[0.68])
    zonas_atracao: int = Field(..., ge=0, examples=[3])
    hotspots_criticos: int = Field(..., ge=0, examples=[0])
    estado_operacional: StatusOperacional = Field(..., examples=["ESTAVEL"])


class ReadinessHeatmapResponseContract(ContratoEstrito):
    readiness: ReadinessContract
    heatmap_global: HeatmapGlobalContract
    gerado_em: datetime = Field(..., examples=["2026-10-14T20:30:00Z"])


class PublicoPorDiaContract(ContratoEstrito):
    D1: int = Field(..., ge=0, examples=[240])
    D2: int = Field(..., ge=0, examples=[320])
    D3: int = Field(..., ge=0, examples=[400])


class AcumuladoEventoContract(ContratoEstrito):
    publico_acumulado: int = Field(..., ge=0, examples=[960])
    publico_por_dia: PublicoPorDiaContract
    atendimentos_cortesia: int = Field(..., ge=0, examples=[720])
    bebidas_unidades: int = Field(..., ge=0, examples=[840])
    autosservico_retiradas: int = Field(..., ge=0, examples=[660])
    engajamento_interacoes: int = Field(..., ge=0, examples=[360])


class AnalyticsDropoffResponseContract(ContratoEstrito):
    window_time_min: int = Field(..., gt=0, description="Janela de tempo útil do visitante.", examples=[30])
    queue_time_medio_min: float = Field(..., ge=0, description="Média das filas das zonas BAR.", examples=[7.08])
    density_point_atingido: bool = Field(..., description="Alguma zona em VERMELHO.", examples=[True])
    dropoff_rate_estimado_pct: float = Field(..., ge=0, le=100, examples=[28.9])
    ces_score: float = Field(..., ge=1, le=5, description="Customer Effort Score (1 = baixo esforço, 5 = alto).", examples=[3.0])
    acumulado_evento: AcumuladoEventoContract


# ════════════════════════════════════════════════════════════════════════════
# Módulo E — Tempo Real (WebSocket e SSE)
# ════════════════════════════════════════════════════════════════════════════
class EventoTempoRealContract(ContratoEstrito):
    tipo: TipoEvento = Field(..., examples=["leitura"])
    emitido_em: datetime = Field(..., examples=["2026-10-14T20:30:00Z"])
    status_operacional_evento: StatusOperacional = Field(..., examples=["ESTAVEL"])
    mensagem: Optional[str] = Field(None, examples=["Nova leitura TEMPO_REAL no PDV 1"])
    leitura: Optional[TelemetryReadingContract] = None
    dispatch: Optional[DispatchResponseContract] = None
    reabastecimento: Optional[ReabastecimentoResponseContract] = None
    acionamento: Optional[AcionarFluxoResponseContract] = None
    insumos: Optional[InsumosStatusResponseContract] = None
    readiness: Optional[ReadinessContract] = None
