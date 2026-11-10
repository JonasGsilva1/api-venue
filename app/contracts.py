"""
Contratos Pydantic v2 — fonte única de verdade de TODA entrada e saída da API RaizEvento.

Diretriz inegociável (PROJECT_CONTEXT.md §1.2): todos os modelos herdam de `ContratoEstrito`,
que define `model_config = ConfigDict(extra="forbid")`. Campos não mapeados (ex.: `rosto_id`,
`cpf`, `biometria`) são rejeitados com HTTP 400 — o que também materializa o guardrail de
anonimato absoluto (§1.4): não existe campo para identificação individual.
"""
from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Literal, Optional

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
TipoZona = Literal["BAR", "BANHEIRO", "CATRACA", "ESTANDE"]
StatusOperacional = Literal["ESTAVEL", "ACAO_EM_ANDAMENTO"]
NivelPredito = Literal["BAIXO", "MEDIO", "ALTO", "CRITICO"]
NivelCritico = Literal["BAIXO", "MEDIO", "ALTO", "CRITICO", "CRITICO_PCD_CLIMA"]
StatusDispatch = Literal["PENDENTE", "EM_ANDAMENTO", "RESOLVIDO"]
Papel = Literal["visualizador", "operador", "admin"]
TipoAnomalia = Literal["NFC_LENTO", "SATURACAO"]
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


class LoginRequestContract(ContratoEstrito):
    email: str = Field(..., examples=["operador@raizevento.com"])
    password: str = Field(..., examples=["senha123"])


class UserContract(ContratoEstrito):
    id: str = Field(..., examples=["usr-1"])
    name: str = Field(..., examples=["Operador RAIZ"])
    email: str = Field(..., examples=["operador@raizevento.com"])
    role: Literal["admin", "operator", "viewer", "operador", "visualizador"] = Field(..., examples=["admin"])


class LoginResponseContract(ContratoEstrito):
    token: str = Field(..., examples=["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."])
    user: UserContract


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
# Módulo A — Telemetria de Câmeras, Motor de IA e Resiliência
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
                    "taxa_nfc_seg_por_pessoa": None,
                    "simular_falha_ia": "NENHUMA",
                }
            ]
        },
    )

    pdv_id: int = Field(..., gt=0, description="ID da zona monitorada por câmera (ver GET /api/v1/pdv/status).", examples=[1])
    sensor_status: SensorStatus = Field("ONLINE", description="OFFLINE aciona o FALLBACK_502.", examples=["ONLINE"])
    coordenadas_simuladas: List[CoordinateContract] = Field(
        ...,
        max_length=MAX_COORDENADAS_POR_FRAME,
        description="Posições anônimas e agregadas captadas pelas câmeras/LiDAR. Cada ponto = 1 pax.",
        examples=[_EXEMPLO_COORDENADAS],
    )
    transacoes_pos_ultimos_3m: int = Field(
        ..., ge=0, description="Validações de acesso/passagens no leitor NFC/catraca nos últimos 3 min.", examples=[4]
    )
    taxa_nfc_seg_por_pessoa: Optional[int] = Field(
        None, ge=1, le=600, description="Ritmo medido no leitor NFC/catraca (anomalia a partir de 45 s/pessoa).", examples=[45]
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
    anomalias: List[TipoAnomalia] = Field(default_factory=list, examples=[["NFC_LENTO"]])
    modo_leitura: ModoLeitura = Field(..., examples=["TEMPO_REAL"])
    sensor_status: SensorStatus = Field(..., examples=["ONLINE"])
    transacoes_pos_ultimos_3m: int = Field(..., ge=0, examples=[4])
    alerta_ruptura_estoque: bool = Field(
        False,
        description="Mantido como False fixo para compatibilidade com o contrato LeituraV2 do frontend (sem gestão de insumos).",
        examples=[False],
    )
    contagem_pessoas: Optional[int] = Field(None, ge=0, description="Alias para pax_count compatível com frontend.", examples=[6])


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
                    "taxa_nfc_seg_por_pessoa": 45,
                }
            ]
        },
    )

    pdv_id: int = Field(..., gt=0, description="Zona usada para calibrar área e ritmo de atendimento.", examples=[1])
    coordenadas_simuladas: List[CoordinateContract] = Field(..., max_length=MAX_COORDENADAS_POR_FRAME, examples=[_EXEMPLO_COORDENADAS])
    transacoes_pos_ultimos_3m: int = Field(..., ge=0, examples=[0])
    taxa_nfc_seg_por_pessoa: Optional[int] = Field(None, ge=1, le=600, examples=[45])


class InferenceResponseContract(ContratoEstrito):
    pdv_id: int = Field(..., gt=0, examples=[1])
    pax_count: int = Field(..., ge=0, examples=[6])
    tempo_espera_seg: int = Field(..., ge=0, examples=[228])
    tempo_espera_fmt: str = Field(..., examples=["3m 48s"])
    densidade_m2: float = Field(..., ge=0.0, examples=[0.26])
    status_cor: StatusCor = Field(..., description="VERDE < 300s · AMARELO 300..720s · VERMELHO > 720s.", examples=["VERDE"])
    confianca_ia: float = Field(..., ge=0.0, le=1.0, examples=[0.94])
    anomalias: List[TipoAnomalia] = Field(default_factory=list, examples=[["NFC_LENTO", "SATURACAO"]])


class YoloScanRequestContract(ContratoEstrito):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "examples": [
                {
                    "video_origem": "video_teste_04.mp4",
                    "frame_indice": 3,
                    "pdv_fila_id": 1,
                    "pdv_estande_id": 3,
                    "pessoas_fila_simuladas": 6,
                    "pessoas_estande_simuladas": 8,
                }
            ]
        },
    )

    video_origem: str = Field(
        "video_teste_04.mp4",
        min_length=1,
        max_length=120,
        description="Arquivo de vídeo ou fonte óptica analisada pelo motor YOLOv8n.",
        examples=["video_teste_04.mp4"],
    )
    frame_indice: int = Field(
        3,
        ge=1,
        le=100000,
        description="Índice do frame analisado (processamento padrão a cada 3 frames).",
        examples=[3],
    )
    pdv_fila_id: int = Field(
        1,
        gt=0,
        description="ID da zona monitorada para o polígono de fila (padrão: 1 = Z1 | Acesso Estande Principal).",
        examples=[1],
    )
    pdv_estande_id: int = Field(
        3,
        gt=0,
        description="ID da zona monitorada para o polígono do estande/lounge (padrão: 3 = Z3 | Lounge).",
        examples=[3],
    )
    pessoas_fila_simuladas: Optional[int] = Field(
        None,
        ge=0,
        le=500,
        description="Opcional: força contagem na fila para calibração em nuvem (Render) quando o arquivo .mp4 não está no container.",
        examples=[6],
    )
    pessoas_estande_simuladas: Optional[int] = Field(
        None,
        ge=0,
        le=500,
        description="Opcional: força contagem no estande para calibração em nuvem (Render) quando o arquivo .mp4 não está no container.",
        examples=[8],
    )


class YoloScanResponseContract(ContratoEstrito):
    motor_visao: Literal["YOLOv8n_REAL", "SIMULACAO_OPTICA_BORDA"] = Field(
        ...,
        description="Indica se a extração usou o peso local YOLOv8n + OpenCV ou a simulação óptica calibrada para nuvem (Render).",
        examples=["SIMULACAO_OPTICA_BORDA"],
    )
    resolucao_frame: str = Field(..., examples=["640x360"])
    frame_processado: int = Field(..., ge=1, examples=[3])
    pessoas_detectadas_total: int = Field(..., ge=0, examples=[14])
    pessoas_zona_fila: int = Field(..., ge=0, examples=[6])
    pessoas_zona_estande: int = Field(..., ge=0, examples=[8])
    alerta_assistido_ativo: bool = Field(
        ...,
        description="True quando fila >= 6 pax ou tempo de espera >= 3.5 min (210s), conforme regra do VenueEngine.",
        examples=[True],
    )
    coordenadas_fila: List[CoordinateContract]
    coordenadas_estande: List[CoordinateContract]
    leitura_fila: TelemetryReadingContract
    leitura_estande: TelemetryReadingContract


# ════════════════════════════════════════════════════════════════════════════
# Módulo B — Acionamento Preditivo de Gargalos e Despacho Tático
# ════════════════════════════════════════════════════════════════════════════
class PredicaoGargaloResponseContract(ContratoEstrito):
    setor: str = Field(..., examples=["Portão Principal / Entrada Norte"])
    nivel_predito: NivelPredito = Field(..., examples=["CRITICO"])
    motivo: str = Field(..., examples=["Aumento repentino de fluxo detectado por IA nas câmeras"])
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
                    "sugestao_acao": "Remanejar 2 orientadores de fluxo para o Corredor de Acesso Norte e abrir faixa extra",
                }
            ]
        },
    )

    pdv_id: int = Field(..., gt=0, examples=[5])
    nivel_critico: NivelCritico = Field(..., examples=["CRITICO"])
    sugestao_acao: str = Field(
        ..., min_length=5, max_length=500, examples=["Remanejar 2 orientadores de fluxo para o Corredor de Acesso Norte"]
    )


class DispatchResponseContract(ContratoEstrito):
    id: int = Field(..., gt=0, examples=[1])
    pdv_id: int = Field(..., gt=0, examples=[5])
    nome_zona: str = Field(..., examples=["Corredor de Acesso Norte"])
    nivel_critico: NivelCritico = Field(..., examples=["CRITICO"])
    sugestao_acao: str = Field(..., examples=["Remanejar 2 orientadores de fluxo para o Corredor de Acesso Norte"])
    status: StatusDispatch = Field(..., examples=["EM_ANDAMENTO"])
    criado_em: datetime = Field(..., examples=["2026-10-14T20:30:00Z"])
    status_operacional_evento: StatusOperacional = Field(..., examples=["ACAO_EM_ANDAMENTO"])


class DispatchListResponseContract(ContratoEstrito):
    total_ordens: int = Field(..., ge=0, examples=[1])
    status_operacional_evento: StatusOperacional = Field(..., examples=["ACAO_EM_ANDAMENTO"])
    ordens: List[DispatchResponseContract]


# ════════════════════════════════════════════════════════════════════════════
# Módulo C — Painel de Câmeras, Mapa de Calor e Analytics (S01–S10)
# ════════════════════════════════════════════════════════════════════════════
class IndicadoresZonaContract(ContratoEstrito):
    fila_pax: Optional[int] = Field(None, ge=0, examples=[6])
    tempo_espera_seg: Optional[int] = Field(None, ge=0, examples=[228])
    variacao_pct: Optional[int] = Field(None, examples=[12])
    permanencia_media_seg: Optional[int] = Field(None, ge=0, examples=[204])
    reunioes_ativas: Optional[int] = Field(None, ge=0, examples=[1])
    interacoes: Optional[int] = Field(None, ge=0, examples=[14])


class ZonaStatusContract(ContratoEstrito):
    id: int = Field(..., gt=0, examples=[1])
    codigo_zona: str = Field(..., examples=["Z1"])
    nome: str = Field(..., examples=["Z1 | Acesso Estande Principal"])
    tipo: TipoZona = Field(..., examples=["CATRACA"])
    area_m2: float = Field(..., gt=0, examples=[23.0])
    capacidade: int = Field(..., gt=0, examples=[40])
    indicadores: IndicadoresZonaContract
    ultima_leitura: Optional[TelemetryReadingContract] = None
    habilitar_redirecionamento_push: bool = Field(..., description="true SOMENTE quando tempo_espera_seg > 180.", examples=[True])
    localizacao_geo: Optional[str] = Field(None, description="Coordenadas para planta isométrica do frontend.", examples=["RAIZ | Frente | planta(x:570,y:440)"])


class PdvStatusResponseContract(ContratoEstrito):
    total_zonas: int = Field(..., ge=0, examples=[5])
    status_operacional_evento: StatusOperacional = Field(..., examples=["ESTAVEL"])
    atualizado_em: datetime = Field(..., examples=["2026-10-14T20:30:00Z"])
    zonas: List[ZonaStatusContract]


class ReadinessContract(ContratoEstrito):
    sensores_ativos: int = Field(..., ge=0, examples=[7])
    fontes_online_str: str = Field(..., examples=["7/7"])
    cameras_neurais_ativas: int = Field(..., ge=0, examples=[7])
    lidar_fps: int = Field(..., ge=0, examples=[60])
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
    pontos_criticos: Optional[int] = Field(None, ge=0, description="Alias para hotspots_criticos compatível com frontend.", examples=[0])
    estado_operacional: StatusOperacional = Field(..., examples=["ESTAVEL"])


class ReadinessHeatmapResponseContract(ContratoEstrito):
    readiness: ReadinessContract
    heatmap_global: HeatmapGlobalContract
    gerado_em: datetime = Field(..., examples=["2026-10-14T20:30:00Z"])
    prontidao: Optional[ReadinessContract] = None
    mapa_calor_global: Optional[HeatmapGlobalContract] = None


class PublicoPorDiaContract(ContratoEstrito):
    D1: int = Field(..., ge=0, examples=[240])
    D2: int = Field(..., ge=0, examples=[320])
    D3: int = Field(..., ge=0, examples=[400])


class AcumuladoEventoContract(ContratoEstrito):
    publico_acumulado: int = Field(..., ge=0, examples=[960])
    publico_por_dia: PublicoPorDiaContract
    atendimentos_cortesia: int = Field(..., ge=0, examples=[720])
    engajamento_interacoes: int = Field(..., ge=0, examples=[360])


class AnalyticsDropoffResponseContract(ContratoEstrito):
    window_time_min: int = Field(..., gt=0, description="Janela de tempo útil do visitante.", examples=[30])
    queue_time_medio_min: float = Field(..., ge=0, description="Média das filas das zonas de acesso/circulação.", examples=[7.08])
    density_point_atingido: bool = Field(..., description="Alguma zona em VERMELHO.", examples=[True])
    dropoff_rate_estimado_pct: float = Field(..., ge=0, le=100, examples=[28.9])
    ces_score: float = Field(..., ge=1, le=5, description="Customer Effort Score (1 = baixo esforço, 5 = alto).", examples=[3.0])
    acumulado_evento: AcumuladoEventoContract
    janela_tempo_min: Optional[int] = Field(None, description="Alias em português.", examples=[30])
    tempo_medio_fila_min: Optional[float] = Field(None, description="Alias em português.", examples=[7.08])
    ponto_densidade_atingido: Optional[bool] = Field(None, description="Alias em português.", examples=[True])
    taxa_abandono_estimada_pct: Optional[float] = Field(None, description="Alias em português.", examples=[28.9])
    pontuacao_esforco_ces: Optional[float] = Field(None, description="Alias em português.", examples=[3.0])


# ════════════════════════════════════════════════════════════════════════════
# Módulo D — Tempo Real (WebSocket e SSE)
# ════════════════════════════════════════════════════════════════════════════
class EventoTempoRealContract(ContratoEstrito):
    tipo: TipoEvento = Field(..., examples=["leitura"])
    emitido_em: datetime = Field(..., examples=["2026-10-14T20:30:00Z"])
    status_operacional_evento: StatusOperacional = Field(..., examples=["ESTAVEL"])
    mensagem: Optional[str] = Field(None, examples=["Nova leitura TEMPO_REAL no PDV 1"])
    leitura: Optional[TelemetryReadingContract] = None
    dispatch: Optional[DispatchResponseContract] = None
    acionamento: Optional[AcionarFluxoResponseContract] = None
    readiness: Optional[ReadinessContract] = None


# ════════════════════════════════════════════════════════════════════════════
# Venue Tactical Suite UI — Câmeras, Atrações Instagramáveis & Síntese
# ════════════════════════════════════════════════════════════════════════════
StatusInstagramavel = Literal["ativo", "alta_procura", "limpeza", "pausado"]
ModoIluminacao = Literal["Neon Pulsar", "Cyber Glow", "Golden Hour", "Studio Spotlight"]


class IluminacaoCenicaContract(ContratoEstrito):
    modo: ModoIluminacao = Field(..., examples=["Neon Pulsar"])
    corPrincipal: str = Field(..., examples=["#10b981"])
    intensidadePct: int = Field(..., ge=0, le=100, examples=[92])


class FotoRecenteContract(ContratoEstrito):
    id: str = Field(..., examples=["f-1"])
    timestamp: str = Field(..., examples=["22:48"])
    autor: str = Field(..., examples=["@mariana.sound"])
    likes: int = Field(..., ge=0, examples=[342])


class InstagramavelItemContract(ContratoEstrito):
    id: str = Field(..., examples=["inst-01"])
    codigo: str = Field(..., examples=["INSTA-NEON-01"])
    nome: str = Field(..., examples=["Túnel Neon Cyber Sound"])
    patrocinador: str = Field(..., examples=["Heineken 0.0"])
    categoriaCenario: str = Field(..., examples=["Túnel Imersivo de LED 360°"])
    setor: str = Field(..., examples=["Arena Principal"])
    status: StatusInstagramavel = Field(..., examples=["alta_procura"])
    capturasTotais: int = Field(..., ge=0, examples=[1420])
    compartilhamentosSociaisEstimados: int = Field(..., ge=0, examples=[1180])
    alcanceEstimadoRedes: int = Field(..., ge=0, examples=[185000])
    tempoPermanenciaMedioSegundos: int = Field(..., ge=0, examples=[85])
    avaliacaoMedia: float = Field(..., ge=0.0, le=5.0, examples=[4.92])
    npsScore: int = Field(..., ge=0, le=100, examples=[94])
    pessoasNaFila: int = Field(..., ge=0, examples=[18])
    tempoEsperaMin: float = Field(..., ge=0.0, examples=[9.5])
    iluminacaoCenica: IluminacaoCenicaContract
    posicao3D: List[float] = Field(..., examples=[[-2.0, 0.0, 7.0]])
    hashtagsPrincipais: List[str] = Field(default_factory=list, examples=[["#HeinekenLive", "#ArenaCyber"]])
    fotosRecentes: List[FotoRecenteContract] = Field(default_factory=list)


class FluxoSetorContract(ContratoEstrito):
    setor: str = Field(..., examples=["Arena Principal"])
    volume: int = Field(..., ge=0, examples=[1800])
    pct: float = Field(..., ge=0.0, le=100.0, examples=[35.2])


class FluxoHorarioContract(ContratoEstrito):
    hora: str = Field(..., examples=["18h"])
    acessosCameras: int = Field(..., ge=0, examples=[410])
    instagramavel: int = Field(..., ge=0, examples=[320])


class PrincipalAlertaContract(ContratoEstrito):
    id: str = Field(..., examples=["al-1"])
    tipo: Literal["aviso", "urgente", "info"] = Field(..., examples=["urgente"])
    mensagem: str = Field(..., examples=["Concentração elevada captada pela câmera CAM-FLUXO-01 no Corredor de Acesso Norte (84 pessoas)."])
    hora: str = Field(..., examples=["22:45"])
    atracao: str = Field(..., examples=["Controlo de Acesso & Densidade Oeste (CAM-FLUXO-01)"])
    atracaoId: Optional[str] = Field(None, examples=["cam-fluxo-01"])
    direcionamento: str = Field(..., examples=["Acionar 2 faixas adicionais de escoamento e redirecionar fluxo pelo Perímetro Leste."])
    impactoEstimado: Optional[str] = Field(None, examples=["Reduz o tempo estimado de retenção em 40% nos próximos 10 minutos."])
    acaoRapidaLabel: Optional[str] = Field(None, examples=["Abrir Faixas Extras"])


class SinteseAcumuladaContract(ContratoEstrito):
    eventoNome: str = Field(..., examples=["Festival Som & Luz Arena 2026"])
    dataEvento: str = Field(..., examples=["19 de Outubro de 2026"])
    tempoDecorridoHoras: float = Field(..., ge=0.0, examples=[4.8])
    publicoTotalEstimadoVenue: int = Field(..., ge=0, examples=[18500])
    totalAtendimentosGerais: int = Field(..., ge=0, examples=[6180])
    camerasMonitoradasAtivas: int = Field(..., ge=0, examples=[7])
    totalCapturasInstagramavel: int = Field(..., ge=0, examples=[3860])
    alcanceTotalRedes: int = Field(..., ge=0, examples=[519000])
    vazaoMediaAtendimentosPorMin: float = Field(..., ge=0.0, examples=[20.6])
    tempoMedioEsperaGlobalMin: float = Field(..., ge=0.0, examples=[4.2])
    satisfacaoGeralScore: float = Field(..., ge=0.0, le=5.0, examples=[4.91])
    camerasPorStatus: Dict[str, int] = Field(..., examples=[{"operacional": 7, "atencao": 0, "critico": 0}])
    instagramavelPorStatus: Dict[str, int] = Field(..., examples=[{"ativo": 3, "alta_procura": 1, "limpeza": 0, "pausado": 0}])
    fluxoPorSetor: List[FluxoSetorContract] = Field(default_factory=list)
    fluxoHorario: List[FluxoHorarioContract] = Field(default_factory=list)
    principaisAlertas: List[PrincipalAlertaContract] = Field(default_factory=list)


class ModoLuzRequestContract(ContratoEstrito):
    modo: ModoIluminacao = Field(..., examples=["Neon Pulsar"])


class CriarAtracaoRequestContract(ContratoEstrito):
    tipo: Literal["instagramavel"] = Field("instagramavel", examples=["instagramavel"])
    nome: str = Field(..., min_length=2, max_length=100, examples=["Portal Holográfico Arena"])
    setor: str = Field("Arena Principal", examples=["Arena Principal"])
    patrocinador: Optional[str] = Field(None, examples=["Marca Parceira"])


TipoCameraHardware = Literal["entrada_perimetro", "fluxo_interno", "fb_liquid"]
StatusCameraHardware = Literal["operacional", "atencao", "critico"]


class CameraMetricaContract(ContratoEstrito):
    rotulo: str = Field(..., examples=["Fluxo Acesso"])
    valor: str = Field(..., examples=["380 pess/h"])
    detalhe: Optional[str] = Field(None, examples=["Tempo fila: 1.5 min"])


class CameraTelemetryItemContract(ContratoEstrito):
    id: str = Field(..., examples=["cam-ent-01"])
    codigo: str = Field(..., examples=["CAM-ENT-01"])
    nome: str = Field(..., examples=["Entrada Portão A (Perímetro Norte)"])
    tipo: TipoCameraHardware = Field(..., examples=["entrada_perimetro"])
    setor: str = Field(..., examples=["Acesso / Perímetro Norte"])
    posicao: List[float] = Field(..., examples=[[-4.0, 4.2, 12.0]])
    alvo: List[float] = Field(..., examples=[[-4.0, 0.0, 12.0]])
    status: StatusCameraHardware = Field(..., examples=["operacional"])
    fps: int = Field(..., gt=0, examples=[30])
    metricas: CameraMetricaContract
    zona: ZonaStatusContract


class CamerasResponseContract(ContratoEstrito):
    total_cameras: int = Field(..., ge=0, examples=[7])
    cameras_online: int = Field(..., ge=0, examples=[7])
    atualizado_em: datetime = Field(..., examples=["2026-10-14T20:30:00Z"])
    cameras: List[CameraTelemetryItemContract]
