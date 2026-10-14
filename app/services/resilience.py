"""
Planos de contingência da Matriz de Resiliência (PROJECT_CONTEXT.md §5, Módulo A).

- FALLBACK_502     → sensor OFFLINE: média histórica dos últimos 15 min do PDV.
- MEDIA_MOVEL_504  → motor de IA excedeu 2.5 s: média móvel dos últimos 3 min.
- CONTINGENCIA_503 → motor de IA fora do ar: fila calculada exclusivamente pelo ritmo do POS.

Todas as estimativas passam pelas mesmas regras de negócio (`aplicar_regras`).
"""
from __future__ import annotations

from datetime import timedelta
from statistics import mean
from typing import Optional

from app.repositories.memory_db import ZonaRecord, memory_db
from app.services.ai_engine import ResultadoInferencia, aplicar_regras

JANELA_FALLBACK_502 = timedelta(minutes=15)
JANELA_MEDIA_MOVEL_504 = timedelta(minutes=3)
TEMPO_SERVICO_PADRAO_SEG = 46  # ref. autosserviço Z2 quando não há ritmo de POS


def estimar_contingencia_503(zona: ZonaRecord, pax_bruto: int, transacoes_pos_3m: int, estoque_pct: int,
                             taxa_nfc: Optional[int], confianca: float = 0.35) -> ResultadoInferencia:
    ritmo_por_min = transacoes_pos_3m / 3
    if ritmo_por_min > 0:
        tempo = pax_bruto / ritmo_por_min * 60
    else:
        tempo = pax_bruto * (zona.tempo_servico_seg or TEMPO_SERVICO_PADRAO_SEG)
    return aplicar_regras(zona, pax_bruto, int(round(tempo)), confianca, transacoes_pos_3m, estoque_pct, taxa_nfc)


def estimar_fallback_502(zona: ZonaRecord, transacoes_pos_3m: int, estoque_pct: int,
                         taxa_nfc: Optional[int]) -> tuple[ResultadoInferencia, str]:
    historico = memory_db.historico(zona.id, JANELA_FALLBACK_502)
    if not historico:
        r = estimar_contingencia_503(zona, 0, transacoes_pos_3m, estoque_pct, taxa_nfc, confianca=0.2)
        return r, "sem histórico nos últimos 15 min; estimativa mínima pelo POS"
    pax = round(mean(l.pax_count for l in historico))
    tempo = round(mean(l.tempo_espera_seg for l in historico))
    confianca = min(0.65, 0.35 + 0.02 * len(historico))
    r = aplicar_regras(zona, pax, tempo, confianca, transacoes_pos_3m, estoque_pct, taxa_nfc)
    return r, f"média histórica de {len(historico)} leituras dos últimos 15 min"


def estimar_media_movel_504(zona: ZonaRecord, pax_atual: int, transacoes_pos_3m: int, estoque_pct: int,
                            taxa_nfc: Optional[int]) -> tuple[ResultadoInferencia, str]:
    historico = memory_db.historico(zona.id, JANELA_MEDIA_MOVEL_504)
    if not historico:
        r = estimar_contingencia_503(zona, pax_atual, transacoes_pos_3m, estoque_pct, taxa_nfc, confianca=0.3)
        return r, "sem leituras nos últimos 3 min; heurística POS + contagem bruta"
    pax = round(mean(l.pax_count for l in historico))
    tempo = round(mean(l.tempo_espera_seg for l in historico))
    r = aplicar_regras(zona, pax, tempo, 0.6, transacoes_pos_3m, estoque_pct, taxa_nfc)
    return r, f"média móvel de {len(historico)} leituras dos últimos 3 min"
