"""Mapeamento explícito registro interno → contrato Pydantic (seleção campo a campo, sem vazamentos)."""
from __future__ import annotations

from app.contracts import (
    DispatchResponseContract,
    IndicadoresZonaContract,
    InsumoItemContract,
    InsumosStatusResponseContract,
    ReadinessContract,
    ReabastecimentoResponseContract,
    TelemetryReadingContract,
    ZonaStatusContract,
)
from app.repositories.memory_db import (
    LIMIAR_REDIRECIONAMENTO_SEG,
    DispatchRecord,
    LeituraRecord,
    MemoryDB,
    PedidoReabastecimentoRecord,
    ZonaRecord,
    status_insumo,
)
from app.services.ai_engine import formatar_tempo


def leitura_para_contrato(l: LeituraRecord) -> TelemetryReadingContract:
    return TelemetryReadingContract(
        id=l.id,
        pdv_id=l.pdv_id,
        timestamp=l.timestamp,
        pax_count=l.pax_count,
        tempo_espera_seg=l.tempo_espera_seg,
        tempo_espera_fmt=formatar_tempo(l.tempo_espera_seg),
        densidade_m2=l.densidade_m2,
        status_cor=l.status_cor,  # type: ignore[arg-type]
        confianca_ia=l.confianca_ia,
        alerta_ruptura_estoque=l.alerta_ruptura_estoque,
        anomalias=list(l.anomalias),  # type: ignore[arg-type]
        modo_leitura=l.modo_leitura,  # type: ignore[arg-type]
        sensor_status=l.sensor_status,  # type: ignore[arg-type]
        transacoes_pos_ultimos_3m=l.transacoes_pos_ultimos_3m,
        estoque_percentual=l.estoque_percentual,
    )


def zona_para_contrato(z: ZonaRecord, ultima: LeituraRecord | None) -> ZonaStatusContract:
    tempo = ultima.tempo_espera_seg if ultima else z.indicadores.get("tempo_espera_seg")
    return ZonaStatusContract(
        id=z.id,
        codigo_zona=z.codigo_zona,
        nome=z.nome,
        tipo=z.tipo,  # type: ignore[arg-type]
        area_m2=z.area_m2,
        capacidade=z.capacidade,
        indicadores=IndicadoresZonaContract(**z.indicadores),
        ultima_leitura=leitura_para_contrato(ultima) if ultima else None,
        habilitar_redirecionamento_push=tempo is not None and tempo > LIMIAR_REDIRECIONAMENTO_SEG,
    )


def dispatch_para_contrato(d: DispatchRecord, db: MemoryDB) -> DispatchResponseContract:
    zona = db.obter_zona(d.pdv_id)
    return DispatchResponseContract(
        id=d.id,
        pdv_id=d.pdv_id,
        nome_zona=zona.nome if zona else f"PDV {d.pdv_id}",
        nivel_critico=d.nivel_critico,  # type: ignore[arg-type]
        sugestao_acao=d.sugestao_acao,
        status=d.status,  # type: ignore[arg-type]
        criado_em=d.criado_em,
        status_operacional_evento=db.status_operacional,  # type: ignore[arg-type]
    )


def insumos_status(db: MemoryDB) -> InsumosStatusResponseContract:
    itens = [
        InsumoItemContract(
            item_id=i.item_id,
            nome=i.nome,
            localizacao=i.localizacao,
            quantidade_atual=i.quantidade_atual,
            quantidade_minima=i.quantidade_minima,
            status=status_insumo(i.quantidade_atual, i.quantidade_minima),  # type: ignore[arg-type]
            deficit_estimado=max(0, i.quantidade_minima - i.quantidade_atual),
        )
        for i in db.listar_insumos()
    ]
    return InsumosStatusResponseContract(
        total_itens_monitorados=db.TOTAL_ITENS_CATALOGO,
        itens_em_deficit=sum(1 for i in itens if i.status == "DEFICIT_CRITICO"),
        insumos=itens,
    )


def pedido_para_contrato(p: PedidoReabastecimentoRecord, db: MemoryDB) -> ReabastecimentoResponseContract:
    insumo = db.obter_insumo(p.item_id)
    return ReabastecimentoResponseContract(
        protocolo_id=p.protocolo_id,
        item_id=p.item_id,
        nome_item=insumo.nome if insumo else p.item_id,
        localizacao=insumo.localizacao if insumo else "-",
        quantidade_solicitada=p.quantidade_solicitada,
        prioridade=p.prioridade,  # type: ignore[arg-type]
        status_pedido="SOLICITADO",
        solicitado_em=p.solicitado_em,
    )


def readiness_contrato(db: MemoryDB) -> ReadinessContract:
    return ReadinessContract(**db.readiness())  # type: ignore[arg-type]
