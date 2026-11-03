"""Mapeamento explícito registro interno → contrato Pydantic (seleção campo a campo, sem vazamentos)."""
from __future__ import annotations

from app.contracts import (
    CameraMetricaContract,
    CameraTelemetryItemContract,
    DispatchResponseContract,
    FotoRecenteContract,
    IluminacaoCenicaContract,
    IndicadoresZonaContract,
    InstagramavelItemContract,
    ReadinessContract,
    TelemetryReadingContract,
    ZonaStatusContract,
)
from app.repositories.memory_db import (
    LIMIAR_REDIRECIONAMENTO_SEG,
    CameraHardwareRecord,
    DispatchRecord,
    InstagramavelRecord,
    LeituraRecord,
    MemoryDB,
    ZonaRecord,
)
from app.services.ai_engine import formatar_tempo


_LOCALIZACOES_ZONAS = {
    1: "RAIZ | Acesso Estande Principal | planta(x:570,y:440)",
    2: "RAIZ | Passarela Lateral Leste | planta(x:230,y:470)",
    3: "RAIZ | Lounge & Circulação | planta(x:860,y:330)",
    4: "RAIZ | Espaço Instagramável | planta(x:1080,y:480)",
    5: "Arena | Corredor de Acesso Norte | planta(x:700,y:200)",
}


def leitura_para_contrato(l: LeituraRecord) -> TelemetryReadingContract:
    return TelemetryReadingContract(
        id=l.id,
        pdv_id=l.pdv_id,
        timestamp=l.timestamp,
        pax_count=l.pax_count,
        contagem_pessoas=l.pax_count,
        tempo_espera_seg=l.tempo_espera_seg,
        tempo_espera_fmt=formatar_tempo(l.tempo_espera_seg),
        densidade_m2=l.densidade_m2,
        status_cor=l.status_cor,  # type: ignore[arg-type]
        confianca_ia=l.confianca_ia,
        anomalias=list(l.anomalias),  # type: ignore[arg-type]
        modo_leitura=l.modo_leitura,  # type: ignore[arg-type]
        sensor_status=l.sensor_status,  # type: ignore[arg-type]
        transacoes_pos_ultimos_3m=l.transacoes_pos_ultimos_3m,
        alerta_ruptura_estoque=False,
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
        localizacao_geo=_LOCALIZACOES_ZONAS.get(z.id, f"Arena | Zona {z.id} | planta(x:500,y:400)"),
    )


def dispatch_para_contrato(d: DispatchRecord, db: MemoryDB) -> DispatchResponseContract:
    zona = db.obter_zona(d.pdv_id)
    return DispatchResponseContract(
        id=d.id,
        pdv_id=d.pdv_id,
        nome_zona=zona.nome if zona else f"Zona {d.pdv_id}",
        nivel_critico=d.nivel_critico,  # type: ignore[arg-type]
        sugestao_acao=d.sugestao_acao,
        status=d.status,  # type: ignore[arg-type]
        criado_em=d.criado_em,
        status_operacional_evento=db.status_operacional,  # type: ignore[arg-type]
    )


def readiness_contrato(db: MemoryDB) -> ReadinessContract:
    return ReadinessContract(**db.readiness())  # type: ignore[arg-type]


def instagramavel_para_contrato(i: InstagramavelRecord) -> InstagramavelItemContract:
    return InstagramavelItemContract(
        id=i.id,
        codigo=i.codigo,
        nome=i.nome,
        patrocinador=i.patrocinador,
        categoriaCenario=i.categoriaCenario,
        setor=i.setor,
        status=i.status,  # type: ignore[arg-type]
        capturasTotais=i.capturasTotais,
        compartilhamentosSociaisEstimados=i.compartilhamentosSociaisEstimados,
        alcanceEstimadoRedes=i.alcanceEstimadoRedes,
        tempoPermanenciaMedioSegundos=i.tempoPermanenciaMedioSegundos,
        avaliacaoMedia=i.avaliacaoMedia,
        npsScore=i.npsScore,
        pessoasNaFila=i.pessoasNaFila,
        tempoEsperaMin=i.tempoEsperaMin,
        iluminacaoCenica=IluminacaoCenicaContract(
            modo=i.iluminacaoCenica.modo,  # type: ignore[arg-type]
            corPrincipal=i.iluminacaoCenica.corPrincipal,
            intensidadePct=i.iluminacaoCenica.intensidadePct,
        ),
        posicao3D=i.posicao3D,
        hashtagsPrincipais=list(i.hashtagsPrincipais),
        fotosRecentes=[
            FotoRecenteContract(id=f.id, timestamp=f.timestamp, autor=f.autor, likes=f.likes)
            for f in i.fotosRecentes
        ],
    )


def camera_para_contrato(c: CameraHardwareRecord, db: MemoryDB) -> CameraTelemetryItemContract:
    if c.pdv_id_vinculado is not None:
        zona = db.obter_zona(c.pdv_id_vinculado)
        ultima = db.ultima_leitura(c.pdv_id_vinculado)
    else:
        zona = c.zona_dedicada
        ultima = c.leitura_dedicada

    if zona is None:
        raise ValueError(f"Câmera '{c.id}' sem zona configurada.")

    return CameraTelemetryItemContract(
        id=c.id,
        codigo=c.codigo,
        nome=c.nome,
        tipo=c.tipo,  # type: ignore[arg-type]
        setor=c.setor,
        posicao=list(c.posicao),
        alvo=list(c.alvo),
        status=c.status,  # type: ignore[arg-type]
        fps=c.fps,
        metricas=CameraMetricaContract(
            rotulo=c.rotulo_metrica,
            valor=c.valor_metrica,
            detalhe=c.detalhe_metrica,
        ),
        zona=zona_para_contrato(zona, ultima),
    )
