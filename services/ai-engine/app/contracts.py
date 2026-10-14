"""
Contratos Estritos Pydantic v2 da Suíte RaizEvento (services/ai-engine).
Diretriz Inegociável: model_config = ConfigDict(extra="forbid") em TODOS os modelos.
"""
from typing import List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field


# ── Inferência Espacial (§5.1) ──────────────────────────────────────────────

class CoordinateContract(BaseModel):
    model_config = ConfigDict(extra="forbid")

    x: float = Field(..., ge=0.0, le=1000.0, description="Coordenada X anônima na planta (0..1000).")
    y: float = Field(..., ge=0.0, le=1000.0, description="Coordenada Y anônima na planta (0..1000).")


class InferenceRequestContract(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pdv_id: int = Field(..., gt=0, description="ID da zona/PDV monitorado.")
    coordenadas_simuladas: List[CoordinateContract] = Field(..., description="Posições anônimas agregadas.")
    transacoes_pos_ultimos_3m: int = Field(..., ge=0, description="Vendas/retiradas no POS nos últimos 3 min.")
    estoque_percentual: int = Field(100, ge=0, le=100, description="Nível de estoque da zona (0..100).")


class InferenceResponseContract(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pdv_id: int
    contagem_pessoas: int = Field(..., ge=0)
    tempo_espera_seg: int = Field(..., ge=0)
    densidade_m2: float = Field(..., ge=0.0)
    status_cor: Literal['VERDE', 'AMARELO', 'VERMELHO']
    confianca_ia: float = Field(..., ge=0.0, le=1.0)
    alerta_ruptura_estoque: bool
    tempo_estimado_reposicao_min: Optional[int] = Field(None, ge=0)


# ── Produto 1: Métrica de Insumos (§8.3) ────────────────────────────────────

class InsumoItemContract(BaseModel):
    model_config = ConfigDict(extra="forbid")

    item_id: str = Field(..., example="BAR-83-IPA")
    nome: str = Field(..., example="Chopp IPA (Barril 50L)")
    localizacao: str = Field(..., example="Bar Principal Norte")
    quantidade_atual: int = Field(..., ge=0, example=6)
    quantidade_minima: int = Field(..., ge=0, example=20)
    status: Literal['NORMAL', 'ATENCAO', 'DEFICIT_CRITICO'] = Field(..., example="DEFICIT_CRITICO")
    deficit_estimado: int = Field(..., ge=0, example=14)


class InsumosStatusResponseContract(BaseModel):
    model_config = ConfigDict(extra="forbid")

    total_itens_monitorados: int = Field(..., ge=0, example=150)
    itens_em_deficit: int = Field(..., ge=0, example=3)
    insumos: List[InsumoItemContract]


class ReabastecimentoRequestContract(BaseModel):
    model_config = ConfigDict(extra="forbid")

    item_id: str = Field(..., example="BAR-83-IPA")
    quantidade_solicitada: int = Field(..., gt=0, example=14)
    prioridade: Literal['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'] = Field(..., example="ALTA")


class ReabastecimentoResponseContract(BaseModel):
    model_config = ConfigDict(extra="forbid")

    protocolo_id: str = Field(..., example="REAB-2026-0042")
    item_id: str = Field(..., example="BAR-83-IPA")
    quantidade_solicitada: int = Field(..., gt=0, example=14)
    prioridade: str = Field(..., example="ALTA")
    status_pedido: Literal['SOLICITADO'] = Field("SOLICITADO", example="SOLICITADO")
    timestamp: str = Field(..., example="2026-10-13T23:00:00.000Z")


# ── Produto 2: Acionamento Preditivo (§8.3) ─────────────────────────────────

class PredicaoGargaloResponseContract(BaseModel):
    model_config = ConfigDict(extra="forbid")

    setor: str = Field(..., example="Portão Principal / Entrada Norte")
    nivel_predito: Literal['BAIXO', 'MEDIO', 'ALTO', 'CRITICO'] = Field(..., example="CRITICO")
    motivo: str = Field(..., example="Aumento repentino de fluxo detectado por IA")
    acao_recomendada: str = Field(..., example="Acionar 2 filas adicionais")
    tempo_estimado_formacao_fila: str = Field(..., example="03m 30s")


class AcionarFluxoRequestContract(BaseModel):
    model_config = ConfigDict(extra="forbid")

    alerta_id: str = Field(..., example="PRED-9921")
    acao_executada: str = Field(..., example="ACIONAR_DUAS_FILAS_ADICIONAIS")
    setor: str = Field(..., example="Portão Principal")


class AcionarFluxoResponseContract(BaseModel):
    model_config = ConfigDict(extra="forbid")

    alerta_id: str = Field(..., example="PRED-9921")
    acao_executada: str = Field(..., example="ACIONAR_DUAS_FILAS_ADICIONAIS")
    setor: str = Field(..., example="Portão Principal")
    status_operacional_evento: Literal['ACAO_EM_ANDAMENTO'] = Field("ACAO_EM_ANDAMENTO", example="ACAO_EM_ANDAMENTO")
    timestamp: str = Field(..., example="2026-10-13T23:00:00.000Z")
