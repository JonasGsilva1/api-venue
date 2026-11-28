"""Motor puro de inferência de fila, densidade, semáforo e anomalias."""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import List, Optional

LIMIAR_VERDE_MAX_SEG = 300
LIMIAR_AMARELO_MAX_SEG = 720
LIMIAR_NFC_LENTO_SEG = 45
DENSIDADE_SATURACAO_M2 = 1.5
TEMPO_ESPERA_MAX_SEG = 3600
CONFIANCA_TEMPO_REAL = 0.94


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


def classificar_status_cor(tempo_espera_seg: int) -> str:
    if tempo_espera_seg < LIMIAR_VERDE_MAX_SEG:
        return "VERDE"
    if tempo_espera_seg <= LIMIAR_AMARELO_MAX_SEG:
        return "AMARELO"
    return "VERMELHO"


def calcular_densidade(pax: int, area_m2: float) -> float:
    return round(pax / area_m2, 2) if area_m2 > 0 else 0.0


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


def aplicar_regras_valores(
    area_m2: float,
    pax: int,
    tempo_espera_seg: int,
    confianca: float,
    taxa_nfc: Optional[int],
) -> ResultadoInferencia:
    """Regras de negócio comuns a todos os modos de leitura (tempo real e contingências)."""
    tempo = int(round(min(max(tempo_espera_seg, 0), TEMPO_ESPERA_MAX_SEG)))
    densidade = calcular_densidade(pax, area_m2)
    return ResultadoInferencia(
        pax_count=pax,
        tempo_espera_seg=tempo,
        densidade_m2=densidade,
        status_cor=classificar_status_cor(tempo),
        confianca_ia=round(confianca, 2),
        anomalias=detectar_anomalias(densidade, taxa_nfc),
    )


def calcular_inferencia_valores(
    area_m2: float,
    tempo_servico_seg: float,
    postos_atendimento: int,
    pax: int,
    taxa_nfc: Optional[int],
) -> ResultadoInferencia:
    if taxa_nfc is not None:
        tempo = pax * taxa_nfc / max(1, postos_atendimento)
    else:
        tempo = pax * tempo_servico_seg
    return aplicar_regras_valores(area_m2, pax, int(round(tempo)), CONFIANCA_TEMPO_REAL, taxa_nfc)


async def executar_inferencia(
    area_m2: float,
    tempo_servico_seg: float,
    postos_atendimento: int,
    pax: int,
    taxa_nfc: Optional[int],
    simular_falha: str = "NENHUMA",
    timeout_seg: float = 2.5,
) -> ResultadoInferencia:
    """Executa inferência assíncrona com suporte a simulação de falhas 503/504."""
    if simular_falha == "DOWN_503":
        raise MotorIAIndisponivelError("Motor de IA indisponível (simulação DOWN_503).")
    if simular_falha == "TIMEOUT_504":
        await asyncio.sleep(timeout_seg + 5)
    await asyncio.sleep(0)
    return calcular_inferencia_valores(area_m2, tempo_servico_seg, postos_atendimento, pax, taxa_nfc)
