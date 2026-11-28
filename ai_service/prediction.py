"""Algoritmo preditivo de formação de filas (+5/+10/+15 min) por regressão linear."""
from __future__ import annotations

from typing import List, Sequence

try:
    from .contracts import AiPredicaoItem, AiPredicaoResponse, AmostraEspera, ZonaHistoricoPredicao
except ImportError:  # pragma: no cover - quando rodado de dentro de ai_service/
    from contracts import AiPredicaoItem, AiPredicaoResponse, AmostraEspera, ZonaHistoricoPredicao

MIN_AMOSTRAS = 5
CONFIANCA_MINIMA = 0.4
LIMITE_URGENTE_MIN = 5.0
LIMITE_AVISO_MIN = 15.0


def prever_gargalo_zona(zona: ZonaHistoricoPredicao, limite_espera_min: float = 8.0) -> AiPredicaoItem:
    amostras: Sequence[AmostraEspera] = sorted(zona.amostras, key=lambda a: a.timestamp_ms)
    n = len(amostras)
    atual = round(amostras[-1].espera_min, 2) if n > 0 else 0.0

    if n < MIN_AMOSTRAS:
        return AiPredicaoItem(
            zona_id=zona.zona_id,
            nome=zona.nome,
            setor=zona.setor,
            amostras_usadas=n,
            suficiente=False,
            espera_atual_min=atual,
            confianca_pct=0.0,
            nivel_alerta="COLETANDO",
        )

    t0 = amostras[0].timestamp_ms
    xs = [(a.timestamp_ms - t0) / 60000.0 for a in amostras]
    ys = [a.espera_min for a in amostras]
    mx = sum(xs) / n
    my = sum(ys) / n

    sxx = sum((xs[i] - mx) ** 2 for i in range(n))
    if sxx == 0:
        return AiPredicaoItem(
            zona_id=zona.zona_id,
            nome=zona.nome,
            setor=zona.setor,
            amostras_usadas=n,
            suficiente=False,
            espera_atual_min=atual,
            confianca_pct=0.0,
            nivel_alerta="COLETANDO",
        )

    sxy = sum((xs[i] - mx) * (ys[i] - my) for i in range(n))
    syy = sum((ys[i] - my) ** 2 for i in range(n))

    inclinacao = sxy / sxx
    intercepto = my - inclinacao * mx
    r2 = 0.0 if syy == 0 else (sxy * sxy) / (sxx * syy)
    agora = xs[-1]

    proj_5 = round(max(0.0, intercepto + inclinacao * (agora + 5.0)), 2)
    proj_10 = round(max(0.0, intercepto + inclinacao * (agora + 10.0)), 2)
    proj_15 = round(max(0.0, intercepto + inclinacao * (agora + 15.0)), 2)

    if atual >= limite_espera_min:
        minutos_ate_limite = 0.0
    elif inclinacao > 0.05:
        minutos_ate_limite = round((limite_espera_min - atual) / inclinacao, 1)
    else:
        minutos_ate_limite = None

    confianca = max(0.0, min(1.0, r2 * min(1.0, n / 12.0)))
    confianca_pct = round(confianca * 100.0, 1)

    if atual >= limite_espera_min:
        nivel_alerta = "ESTOUROU"
    elif minutos_ate_limite is not None and confianca >= CONFIANCA_MINIMA:
        if minutos_ate_limite <= LIMITE_URGENTE_MIN:
            nivel_alerta = "URGENTE"
        elif minutos_ate_limite <= LIMITE_AVISO_MIN:
            nivel_alerta = "AVISO"
        else:
            nivel_alerta = "ESTAVEL"
    else:
        nivel_alerta = "ESTAVEL"

    return AiPredicaoItem(
        zona_id=zona.zona_id,
        nome=zona.nome,
        setor=zona.setor,
        amostras_usadas=n,
        suficiente=True,
        espera_atual_min=atual,
        projecao_5m=proj_5,
        projecao_10m=proj_10,
        projecao_15m=proj_15,
        velocidade_min_por_min=round(inclinacao, 3),
        minutos_ate_limite=minutos_ate_limite,
        confianca_pct=confianca_pct,
        nivel_alerta=nivel_alerta,
    )


def calcular_predicoes_lote(
    zonas: Sequence[ZonaHistoricoPredicao],
    limite_espera_min: float = 8.0,
) -> AiPredicaoResponse:
    previsoes: List[AiPredicaoItem] = [prever_gargalo_zona(z, limite_espera_min) for z in zonas]
    alertas_ativos = sum(1 for p in previsoes if p.nivel_alerta in ("ESTOUROU", "URGENTE", "AVISO"))
    return AiPredicaoResponse(
        limite_espera_min=limite_espera_min,
        total_zonas=len(previsoes),
        alertas_ativos=alertas_ativos,
        previsoes=previsoes,
    )
