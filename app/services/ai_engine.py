"""
Motor interno de IA (in-process): densidade, tempo de espera, semáforo e detecção de anomalias.

Calibração (PROJECT_CONTEXT.md §2 e §4):
- Cada zona tem `tempo_servico_seg` efetivo por pessoa derivado do seed
  (Z1: 6 pax → 228 s; Bar Principal Norte: 84 pax → 1000 s = 16m 40s).
- PDV desconhecido em `/inferencia` usa a calibração de referência do estande
  (6 pax → 160 s = 2m 40s; área de 35 m²).
- Se o leitor NFC/POS informar o ritmo real (`taxa_nfc_seg_por_pessoa`), ele prevalece:
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
    detectar_ruptura,
    LIMIAR_BARRIL_CRITICO_PCT,
    LIMIAR_FILA_RUPTURA_PAX,
)

TEMPO_ESPERA_MAX_SEG = 3600
DENSIDADE_SATURACAO_M2 = 1.5
CONFIANCA_TEMPO_REAL = 0.94
REPOSICAO_PADRAO_MIN = 18

ZONA_REFERENCIA = ZonaRecord(
    id=0, codigo_zona="REF", nome="Zona de referência (calibração do estande)", tipo="BAR",
    area_m2=35.0, capacidade=40, tempo_servico_seg=160 / 6, postos_atendimento=1,
    reposicao_min=REPOSICAO_PADRAO_MIN, indicadores={},
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
    alerta_ruptura_estoque: bool
    anomalias: List[str] = field(default_factory=list)
    tempo_estimado_reposicao_min: Optional[int] = None


def formatar_tempo(segundos: int) -> str:
    minutos, seg = divmod(max(0, int(segundos)), 60)
    return f"{minutos}m {seg:02d}s"


def detectar_anomalias(zona: ZonaRecord, pax: int, transacoes_pos_3m: int, estoque_pct: int,
                       densidade: float, taxa_nfc: Optional[int]) -> List[str]:
    anomalias: List[str] = []
    if taxa_nfc is not None and taxa_nfc >= LIMIAR_NFC_LENTO_SEG:
        anomalias.append("NFC_LENTO")
    if zona.tipo == "BAR" and pax >= LIMIAR_FILA_RUPTURA_PAX and transacoes_pos_3m == 0:
        anomalias.append("RUPTURA_MASCARADA")
    if estoque_pct <= LIMIAR_BARRIL_CRITICO_PCT:
        anomalias.append("ESTOQUE_CRITICO")
    if densidade >= DENSIDADE_SATURACAO_M2:
        anomalias.append("SATURACAO")
    return anomalias


def aplicar_regras(zona: ZonaRecord, pax: int, tempo_espera_seg: int, confianca: float,
                   transacoes_pos_3m: int, estoque_pct: int, taxa_nfc: Optional[int]) -> ResultadoInferencia:
    """Regras de negócio comuns a TODOS os modos de leitura (tempo real e contingências)."""
    tempo = int(round(min(max(tempo_espera_seg, 0), TEMPO_ESPERA_MAX_SEG)))
    densidade = calcular_densidade(pax, zona.area_m2)
    ruptura = detectar_ruptura(zona.tipo, pax, transacoes_pos_3m, estoque_pct)
    return ResultadoInferencia(
        pax_count=pax,
        tempo_espera_seg=tempo,
        densidade_m2=densidade,
        status_cor=classificar_status_cor(tempo),
        confianca_ia=round(confianca, 2),
        alerta_ruptura_estoque=ruptura,
        anomalias=detectar_anomalias(zona, pax, transacoes_pos_3m, estoque_pct, densidade, taxa_nfc),
        tempo_estimado_reposicao_min=(zona.reposicao_min or REPOSICAO_PADRAO_MIN) if ruptura else None,
    )


def calcular_inferencia(zona: ZonaRecord, pax: int, transacoes_pos_3m: int, estoque_pct: int,
                        taxa_nfc: Optional[int]) -> ResultadoInferencia:
    if taxa_nfc is not None:
        tempo = pax * taxa_nfc / max(1, zona.postos_atendimento)
    else:
        tempo = pax * zona.tempo_servico_seg
    return aplicar_regras(zona, pax, int(round(tempo)), CONFIANCA_TEMPO_REAL, transacoes_pos_3m, estoque_pct, taxa_nfc)


async def inferir(zona: ZonaRecord, pax: int, transacoes_pos_3m: int, estoque_pct: int,
                  taxa_nfc: Optional[int], simular_falha: str = "NENHUMA") -> ResultadoInferencia:
    """Chamada assíncrona ao motor. `simular_falha` permite reproduzir 504/503 pelo Swagger."""
    if simular_falha == "DOWN_503":
        raise MotorIAIndisponivelError("Motor de IA indisponível (simulação DOWN_503).")
    if simular_falha == "TIMEOUT_504":
        # Excede deliberadamente o orçamento de latência: será cancelado pelo wait_for.
        await asyncio.sleep(settings.ai_timeout_seg + 5)
    await asyncio.sleep(0)  # ponto de cooperação do event loop
    return calcular_inferencia(zona, pax, transacoes_pos_3m, estoque_pct, taxa_nfc)


async def inferir_com_timeout(zona: ZonaRecord, pax: int, transacoes_pos_3m: int, estoque_pct: int,
                              taxa_nfc: Optional[int], simular_falha: str = "NENHUMA") -> ResultadoInferencia:
    """Aplica o orçamento de latência (padrão 2.5 s). Lança `asyncio.TimeoutError` se excedido."""
    return await asyncio.wait_for(
        inferir(zona, pax, transacoes_pos_3m, estoque_pct, taxa_nfc, simular_falha),
        timeout=settings.ai_timeout_seg,
    )
