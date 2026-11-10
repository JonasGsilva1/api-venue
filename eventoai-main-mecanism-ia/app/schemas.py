"""
Schemas do módulo `eventoai-main` alinhados às diretrizes do `PROJECT_CONTEXT.md`:
- `ConfigDict(extra="forbid")` em todos os modelos Pydantic v2
- Escopo 100% focado em câmeras ópticas/neurais, filas, gargalos e ativações instagramáveis (zero insumos/estoque)
"""
from datetime import datetime
from typing import List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field


class CoordinatePoint(BaseModel):
    model_config = ConfigDict(extra="forbid")

    x: float = Field(..., ge=0.0, le=1000.0, description="Coordenada X anônima normalizada (0..1000).")
    y: float = Field(..., ge=0.0, le=1000.0, description="Coordenada Y anônima normalizada (0..1000).")


class MetricSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    timestamp: datetime = Field(default_factory=datetime.now)
    cenario_id: str = Field(..., examples=["VIDEO_REAL"])

    # Contagem e Fluxo Anônimo por Câmeras
    pessoas_presentes: int = Field(..., ge=0)
    entradas_acumuladas: int = Field(..., ge=0)
    saidas_acumuladas: int = Field(..., ge=0)
    permanencia_media_segundos: float = Field(..., ge=0.0)

    # Filas e Gargalos de Acesso
    fila_balcao: int = Field(..., ge=0, description="Pessoas aguardando na fila de acesso ao estande (Z1).")
    tempo_espera_balcao_min: float = Field(..., ge=0.0, description="Tempo estimado de espera na fila em minutos.")
    atendimentos_acumulados: int = Field(..., ge=0, description="Passagens validadas na catraca/acesso.")

    # Interações nas Zonas do Estande
    interacoes_instagramavel: int = Field(0, ge=0)
    reunioes_ativas: int = Field(0, ge=0)
    coordenadas_fila: List[CoordinatePoint] = Field(default_factory=list)
    coordenadas_estande: List[CoordinatePoint] = Field(default_factory=list)


class Alert(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    timestamp: datetime = Field(default_factory=datetime.now)
    tipo: Literal["ESPERA_ACIMA_DO_ALVO", "SATURACAO_DENSIDADE", "NFC_LENTO"]
    mensagem: str
    nivel: Literal["NORMAL", "ATENCAO", "CRITICO"]
    zona: str
    resolvido: bool = False
    acao_tomada: Optional[str] = None
