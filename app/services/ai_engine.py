"""
Motor interno de IA (in-process): densidade, tempo de espera, semáforo e detecção de anomalias de fluxo.

Calibração (PROJECT_CONTEXT.md §2 e §4):
- Cada zona tem `tempo_servico_seg` efetivo por pessoa derivado do seed
  (Z1: 6 pax → 228 s; Corredor de Acesso Norte: 84 pax → 1000 s = 16m 40s).
- PDV desconhecido em `/inferencia` usa a calibração de referência do estande
  (6 pax → 160 s = 2m 40s; área de 35 m²).
- Se o leitor NFC/catraca informar o ritmo real (`taxa_nfc_seg_por_pessoa`), ele prevalece:
  espera = pax × taxa / postos de atendimento. A partir de 45 s/pessoa → anomalia `NFC_LENTO`.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import List, Optional

from app.config import settings
from app.repositories.memory_db import (
    LIMIAR_NFC_LENTO_SEG,
    ZonaRecord,
    calcular_densidade,
    classificar_status_cor,
)

TEMPO_ESPERA_MAX_SEG = 3600
DENSIDADE_SATURACAO_M2 = 1.5
CONFIANCA_TEMPO_REAL = 0.94

ZONA_REFERENCIA = ZonaRecord(
    id=0, codigo_zona="REF", nome="Zona de referência (calibração do estande)", tipo="CATRACA",
    area_m2=35.0, capacidade=40, tempo_servico_seg=160 / 6, postos_atendimento=1, indicadores={},
)


class MotorIAIndisponivelError(Exception):
    """Motor de IA fora do ar (aciona o Circuit Breaker / CONTINGENCIA_503)."""


@dataclass
class ResultadoInferencia:
    pax_count: int
    tempo_espera_seg: int
    densidade_m2: float
    status_cor: str
    confianca_ia: float
    anomalias: List[str] = field(default_factory=list)


def formatar_tempo(segundos: int) -> str:
    minutos, seg = divmod(max(0, int(segundos)), 60)
    return f"{minutos}m {seg:02d}s"


def detectar_anomalias(densidade: float, taxa_nfc: Optional[int]) -> List[str]:
    anomalias: List[str] = []
    if taxa_nfc is not None and taxa_nfc >= LIMIAR_NFC_LENTO_SEG:
        anomalias.append("NFC_LENTO")
    if densidade >= DENSIDADE_SATURACAO_M2:
        anomalias.append("SATURACAO")
    return anomalias


def aplicar_regras(
    zona: ZonaRecord,
    pax: int,
    tempo_espera_seg: int,
    confianca: float,
    taxa_nfc: Optional[int],
) -> ResultadoInferencia:
    """Regras de negócio comuns a TODOS os modos de leitura (tempo real e contingências)."""
    tempo = int(round(min(max(tempo_espera_seg, 0), TEMPO_ESPERA_MAX_SEG)))
    densidade = calcular_densidade(pax, zona.area_m2)
    return ResultadoInferencia(
        pax_count=pax,
        tempo_espera_seg=tempo,
        densidade_m2=densidade,
        status_cor=classificar_status_cor(tempo),
        confianca_ia=round(confianca, 2),
        anomalias=detectar_anomalias(densidade, taxa_nfc),
    )


def calcular_inferencia(zona: ZonaRecord, pax: int, taxa_nfc: Optional[int]) -> ResultadoInferencia:
    if taxa_nfc is not None:
        tempo = pax * taxa_nfc / max(1, zona.postos_atendimento)
    else:
        tempo = pax * zona.tempo_servico_seg
    return aplicar_regras(zona, pax, int(round(tempo)), CONFIANCA_TEMPO_REAL, taxa_nfc)


async def inferir(
    zona: ZonaRecord,
    pax: int,
    taxa_nfc: Optional[int],
    simular_falha: str = "NENHUMA",
) -> ResultadoInferencia:
    """Chamada assíncrona ao motor. `simular_falha` permite reproduzir 504/503 pelo Swagger."""
    if simular_falha == "DOWN_503":
        raise MotorIAIndisponivelError("Motor de IA indisponível (simulação DOWN_503).")
    if simular_falha == "TIMEOUT_504":
        # Excede deliberadamente o orçamento de latência: será cancelado pelo wait_for.
        await asyncio.sleep(settings.ai_timeout_seg + 5)
    await asyncio.sleep(0)  # ponto de cooperação do event loop
    return calcular_inferencia(zona, pax, taxa_nfc)


async def inferir_com_timeout(
    zona: ZonaRecord,
    pax: int,
    taxa_nfc: Optional[int],
    simular_falha: str = "NENHUMA",
) -> ResultadoInferencia:
    """Aplica o orçamento de latência (padrão 2.5 s). Lança `asyncio.TimeoutError` se excedido."""
    return await asyncio.wait_for(
        inferir(zona, pax, taxa_nfc, simular_falha),
        timeout=settings.ai_timeout_seg,
    )
