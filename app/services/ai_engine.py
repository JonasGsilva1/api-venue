"""
Motor interno de IA (fallback local in-process quando `AI_ENGINE_URL` não está configurada).

Toda a matemática pura reside no serviço independente `ai_service.inference`; este módulo
adapta `ZonaRecord` do repositório local e preserva a interface interna do backend.
"""
from __future__ import annotations

import asyncio
from typing import Optional

from ai_service.inference import (
    CONFIANCA_TEMPO_REAL,
    DENSIDADE_SATURACAO_M2,
    TEMPO_ESPERA_MAX_SEG,
    MotorIAIndisponivelError,
    ResultadoInferencia,
    aplicar_regras_valores,
    calcular_inferencia_valores,
    detectar_anomalias,
    executar_inferencia,
    formatar_tempo,
)
from app.config import settings
from app.repositories.memory_db import ZonaRecord

ZONA_REFERENCIA = ZonaRecord(
    id=0,
    codigo_zona="REF",
    nome="Zona de referência (calibração do estande)",
    tipo="CATRACA",
    area_m2=35.0,
    capacidade=40,
    tempo_servico_seg=160 / 6,
    postos_atendimento=1,
    indicadores={},
)


def aplicar_regras(
    zona: ZonaRecord,
    pax: int,
    tempo_espera_seg: int,
    confianca: float,
    taxa_nfc: Optional[int],
) -> ResultadoInferencia:
    """Regras de negócio comuns a TODOS os modos de leitura (tempo real e contingências)."""
    return aplicar_regras_valores(zona.area_m2, pax, tempo_espera_seg, confianca, taxa_nfc)


def calcular_inferencia(zona: ZonaRecord, pax: int, taxa_nfc: Optional[int]) -> ResultadoInferencia:
    return calcular_inferencia_valores(
        area_m2=zona.area_m2,
        tempo_servico_seg=zona.tempo_servico_seg,
        postos_atendimento=zona.postos_atendimento,
        pax=pax,
        taxa_nfc=taxa_nfc,
    )


async def inferir(
    zona: ZonaRecord,
    pax: int,
    taxa_nfc: Optional[int],
    simular_falha: str = "NENHUMA",
) -> ResultadoInferencia:
    """Chamada assíncrona local ao motor. `simular_falha` permite reproduzir 504/503 pelo Swagger."""
    return await executar_inferencia(
        area_m2=zona.area_m2,
        tempo_servico_seg=zona.tempo_servico_seg,
        postos_atendimento=zona.postos_atendimento,
        pax=pax,
        taxa_nfc=taxa_nfc,
        simular_falha=simular_falha,
        timeout_seg=settings.ai_timeout_seg,
    )


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
