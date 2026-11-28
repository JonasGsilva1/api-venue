"""
Módulo A — Telemetria de Câmeras, Motor de IA e Resiliência HTTP.

`POST /api/v1/telemetry/frame-analysis` — códigos possíveis:
- 201 TEMPO_REAL        → inferência do motor de IA dentro do orçamento de 2.5 s.
- 400 CONTRATO_VIOLADO  → payload fora do contrato (exception handler de RequestValidationError).
- 502 FALLBACK_502      → `sensor_status = OFFLINE` (média histórica de 15 min).
- 504 MEDIA_MOVEL_504   → motor de IA excedeu 2.5 s (`simular_falha_ia = TIMEOUT_504`).
- 503 CONTINGENCIA_503  → motor de IA fora do ar (`simular_falha_ia = DOWN_503`) — Circuit Breaker.
Em 502/503/504 a leitura estimada é PERSISTIDA e transmitida em tempo real (graceful degradation).
"""
from __future__ import annotations

import asyncio
from typing import Annotated, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, status

from app.auth import UsuarioAutenticado, exigir_operacao
from app.config import settings
from app.contracts import (
    InferenceRequestContract,
    InferenceResponseContract,
    TelemetryAnalysisRequestContract,
    TelemetryAnalysisResponseContract,
    YoloScanRequestContract,
    YoloScanResponseContract,
)
from app.errors import RESPOSTA_404, RESPOSTAS_PADRAO, ResilienciaHTTPException, sem_query_params
from app.repositories.memory_db import LeituraRecord, agora_utc, memory_db
from app.services import ai_client, ai_engine
from app.services.ai_engine import MotorIAIndisponivelError, ResultadoInferencia, formatar_tempo
from app.services.event_bus import criar_evento, event_bus
from app.services.mappers import leitura_para_contrato
from app.services.resilience import estimar_contingencia_503, estimar_fallback_502, estimar_media_movel_504

router = APIRouter(prefix="/api/v1", responses=RESPOSTAS_PADRAO)

_COORDS_Z1 = [
    {"x": 120.5, "y": 180.2}, {"x": 122.0, "y": 184.7}, {"x": 125.3, "y": 179.9},
    {"x": 118.1, "y": 182.4}, {"x": 121.7, "y": 177.0}, {"x": 124.9, "y": 186.3},
]

EXEMPLOS_FRAME = {
    "tempo_real_201": {
        "summary": "201 · Normal — Z1 com 6 pessoas detectadas",
        "value": {"pdv_id": 1, "sensor_status": "ONLINE", "coordenadas_simuladas": _COORDS_Z1,
                  "transacoes_pos_ultimos_3m": 4, "simular_falha_ia": "NENHUMA"},
    },
    "anomalia_nfc_201": {
        "summary": "201 · Catraca lenta (45 s por pessoa)",
        "value": {"pdv_id": 5, "sensor_status": "ONLINE", "coordenadas_simuladas": _COORDS_Z1,
                  "transacoes_pos_ultimos_3m": 0, "taxa_nfc_seg_por_pessoa": 45,
                  "simular_falha_ia": "NENHUMA"},
    },
    "sensor_offline_502": {
        "summary": "502 · Câmera desligada (usa média de 15 min)",
        "value": {"pdv_id": 5, "sensor_status": "OFFLINE", "coordenadas_simuladas": [],
                  "transacoes_pos_ultimos_3m": 12, "simular_falha_ia": "NENHUMA"},
    },
    "timeout_ia_504": {
        "summary": "504 · IA lenta (usa média dos últimos 3 min)",
        "value": {"pdv_id": 1, "sensor_status": "ONLINE", "coordenadas_simuladas": _COORDS_Z1,
                  "transacoes_pos_ultimos_3m": 4, "simular_falha_ia": "TIMEOUT_504"},
    },
    "ia_fora_do_ar_503": {
        "summary": "503 · IA fora do ar (estima pela catraca)",
        "value": {"pdv_id": 1, "sensor_status": "ONLINE", "coordenadas_simuladas": _COORDS_Z1,
                  "transacoes_pos_ultimos_3m": 6, "simular_falha_ia": "DOWN_503"},
    },
    "contrato_invalido_400": {
        "summary": "400 · Dados inválidos (campo extra e ponto fora do limite)",
        "value": {"pdv_id": 1, "sensor_status": "ONLINE", "coordenadas_simuladas": [{"x": 1500, "y": 10}],
                  "transacoes_pos_ultimos_3m": 4, "rosto_id": "abc-123"},
    },
}

_AVISOS = {
    "FALLBACK_502": "Sensor OFFLINE: leitura estimada pela média histórica da zona ({base}).",
    "MEDIA_MOVEL_504": "Motor de IA excedeu o orçamento de {timeout}s: Graceful Degradation pela {base}.",
    "CONTINGENCIA_503": "Motor de IA indisponível: Circuit Breaker aberto, fila calculada exclusivamente pela catraca/NFC ({base}).",
}
_STATUS_POR_MODO = {"TEMPO_REAL": 201, "FALLBACK_502": 502, "MEDIA_MOVEL_504": 504, "CONTINGENCIA_503": 503}

_resposta_resiliencia = {"model": TelemetryAnalysisResponseContract}
RESPOSTAS_FRAME = {
    **RESPOSTA_404,
    502: {**_resposta_resiliencia, "description": "Câmera desligada — estimativa feita pela média dos últimos 15 minutos."},
    503: {**_resposta_resiliencia, "description": "IA fora do ar — estimativa feita pelas passagens na catraca."},
    504: {**_resposta_resiliencia, "description": "IA lenta (> 2,5 s) — estimativa feita pela média dos últimos 3 minutos."},
}


@router.post(
    "/telemetry/frame-analysis",
    response_model=TelemetryAnalysisResponseContract,
    status_code=status.HTTP_201_CREATED,
    tags=["Mapa & Arena · Telemetria das Câmeras"],
    summary="Analisar vídeo — enviar pessoas detectadas",
    description=(
        "Recebe os pontos anônimos `(x, y)` das pessoas detectadas no vídeo e calcula lotação, densidade, tempo de espera e cor do semáforo.\n\n"
        "O que pode responder:\n"
        "- `201`: leitura normal em tempo real.\n"
        "- `400`: dados enviados com erro (campo a mais ou ponto fora de 0..1000).\n"
        "- `502`: câmera desligada → usa a média dos últimos 15 minutos.\n"
        "- `504`: IA lenta → usa a média dos últimos 3 minutos.\n"
        "- `503`: IA fora do ar → estima a fila pelas passagens na catraca.\n\n"
        "**Onde aparece no site:** aba Mapa & Arena → clicar numa câmera → botão \"Analisar vídeo\" (envia a cada ~1 s enquanto o vídeo toca)."
    ),
    responses=RESPOSTAS_FRAME,
    dependencies=[Depends(sem_query_params)],
)
async def analisar_frame(
    pacote: Annotated[TelemetryAnalysisRequestContract, Body(openapi_examples=EXEMPLOS_FRAME)],
    usuario: UsuarioAutenticado = Depends(exigir_operacao),
) -> TelemetryAnalysisResponseContract:
    zona = memory_db.obter_zona(pacote.pdv_id)
    if zona is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Zona/PDV {pacote.pdv_id} não existe (ver GET /api/v1/pdv/status).")

    pax_bruto = len(pacote.coordenadas_simuladas)
    base: Optional[str] = None
    resultado: ResultadoInferencia

    if pacote.sensor_status == "OFFLINE":
        modo = "FALLBACK_502"
        resultado, base = estimar_fallback_502(
            zona, pacote.transacoes_pos_ultimos_3m, pacote.taxa_nfc_seg_por_pessoa
        )
    else:
        try:
            resultado = await ai_client.inferir_com_timeout(
                zona, pax_bruto, pacote.taxa_nfc_seg_por_pessoa, pacote.simular_falha_ia,
            )
            modo = "TEMPO_REAL"
            memory_db.definir_motor_ia_online(True)  # half-open → fechado após sucesso
        except asyncio.TimeoutError:
            modo = "MEDIA_MOVEL_504"
            resultado, base = estimar_media_movel_504(
                zona, pax_bruto, pacote.transacoes_pos_ultimos_3m, pacote.taxa_nfc_seg_por_pessoa,
            )
        except MotorIAIndisponivelError:
            modo = "CONTINGENCIA_503"
            memory_db.definir_motor_ia_online(False)  # Circuit Breaker aberto
            resultado = estimar_contingencia_503(
                zona, pax_bruto, pacote.transacoes_pos_ultimos_3m, pacote.taxa_nfc_seg_por_pessoa,
            )
            ritmo = round(pacote.transacoes_pos_ultimos_3m / 3, 2)
            base = f"{ritmo} passagens/min na catraca para {pax_bruto} pax"

    anterior = memory_db.ultima_leitura(zona.id)
    registro = memory_db.registrar_leitura(
        LeituraRecord(
            id=0, pdv_id=zona.id, timestamp=agora_utc(), pax_count=resultado.pax_count,
            tempo_espera_seg=resultado.tempo_espera_seg, densidade_m2=resultado.densidade_m2,
            status_cor=resultado.status_cor, confianca_ia=resultado.confianca_ia,
            anomalias=resultado.anomalias,
            modo_leitura=modo, sensor_status=pacote.sensor_status,
            transacoes_pos_ultimos_3m=pacote.transacoes_pos_ultimos_3m,
        )
    )
    leitura = leitura_para_contrato(registro)

    event_bus.publicar(criar_evento("leitura", f"Leitura {modo} na zona {zona.id} ({zona.nome})", leitura=leitura))
    if anterior is not None and anterior.status_cor != registro.status_cor:
        event_bus.publicar(
            criar_evento("mudanca_cor", f"{zona.nome}: {anterior.status_cor} → {registro.status_cor}", leitura=leitura)
        )

    http_status = _STATUS_POR_MODO[modo]
    resposta = TelemetryAnalysisResponseContract(
        sucesso=modo == "TEMPO_REAL",
        http_status=http_status,  # type: ignore[arg-type]
        modo_leitura=modo,  # type: ignore[arg-type]
        aviso_contingencia=None if base is None else _AVISOS[modo].format(base=base, timeout=settings.ai_timeout_seg),
        leitura=leitura,
    )
    if http_status != 201:
        headers = {"X-Modo-Leitura": modo}
        if http_status == 503:
            headers["Retry-After"] = "30"
        raise ResilienciaHTTPException(http_status, resposta, headers)
    return resposta


@router.post(
    "/inferencia",
    response_model=InferenceResponseContract,
    status_code=status.HTTP_200_OK,
    tags=["Predições de Gargalos (IA)"],
    summary="Calcular fila (teste, sem salvar)",
    description=(
        "Faz a conta de pessoas, tempo de espera, densidade e cor do semáforo (VERDE abaixo de 5 min, AMARELO de 5 a 12 min, VERMELHO acima de 12 min) sem gravar no histórico.\n\n"
        "**Onde aparece no site:** aba Predições de Gargalos (IA) → bloco \"Calcular fila (teste, sem salvar)\"."
    ),
    dependencies=[Depends(sem_query_params)],
)
async def processar_inferencia(
    payload: InferenceRequestContract,
    usuario: UsuarioAutenticado = Depends(exigir_operacao),
) -> InferenceResponseContract:
    zona = memory_db.obter_zona(payload.pdv_id) or ai_engine.ZONA_REFERENCIA
    try:
        r = await ai_client.calcular_inferencia(
            zona, len(payload.coordenadas_simuladas), payload.taxa_nfc_seg_por_pessoa,
        )
    except MotorIAIndisponivelError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    return InferenceResponseContract(
        pdv_id=payload.pdv_id,
        pax_count=r.pax_count,
        tempo_espera_seg=r.tempo_espera_seg,
        tempo_espera_fmt=formatar_tempo(r.tempo_espera_seg),
        densidade_m2=r.densidade_m2,
        status_cor=r.status_cor,  # type: ignore[arg-type]
        confianca_ia=r.confianca_ia,
        anomalias=r.anomalias,  # type: ignore[arg-type]
    )


@router.post(
    "/telemetry/yolo-scan",
    response_model=YoloScanResponseContract,
    status_code=status.HTTP_201_CREATED,
    tags=["Mapa & Arena · Telemetria das Câmeras"],
    summary="Analisar vídeo no servidor (teste)",
    description=(
        "Roda a detecção de pessoas em um frame no servidor (ou simulação quando rodando na nuvem), separa quem está na fila e no estande e atualiza as leituras.\n\n"
        "**Onde aparece no site:** aba Mapa & Arena → clicar numa câmera → janela Analisar vídeo → botão \"Testar no servidor\" (e comando `yolo-scan` no Terminal CLI)."
    ),
    responses=RESPOSTA_404,
    dependencies=[Depends(sem_query_params)],
)
async def escanear_frame_yolo(
    payload: YoloScanRequestContract,
    usuario: UsuarioAutenticado = Depends(exigir_operacao),
) -> YoloScanResponseContract:
    zona_fila = memory_db.obter_zona(payload.pdv_fila_id)
    if zona_fila is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Zona de fila {payload.pdv_fila_id} não existe.")
    zona_estande = memory_db.obter_zona(payload.pdv_estande_id)
    if zona_estande is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Zona de estande {payload.pdv_estande_id} não existe.")

    try:
        visao = await ai_client.escanear_frame_yolo(
            video_origem=payload.video_origem,
            frame_indice=payload.frame_indice,
            pessoas_fila_simuladas=payload.pessoas_fila_simuladas,
            pessoas_estande_simuladas=payload.pessoas_estande_simuladas,
        )
    except MotorIAIndisponivelError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc

    pax_fila = len(visao.coordenadas_fila)
    pax_estande = len(visao.coordenadas_estande)

    try:
        inf_fila = await ai_client.calcular_inferencia(zona_fila, pax_fila, None)
        inf_estande = await ai_client.calcular_inferencia(zona_estande, pax_estande, None)
    except MotorIAIndisponivelError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc

    reg_fila = memory_db.registrar_leitura(
        LeituraRecord(
            id=0,
            pdv_id=zona_fila.id,
            timestamp=agora_utc(),
            pax_count=inf_fila.pax_count,
            tempo_espera_seg=inf_fila.tempo_espera_seg,
            densidade_m2=inf_fila.densidade_m2,
            status_cor=inf_fila.status_cor,
            confianca_ia=inf_fila.confianca_ia,
            anomalias=inf_fila.anomalias,
            modo_leitura="TEMPO_REAL",
            sensor_status="ONLINE",
            transacoes_pos_ultimos_3m=max(1, pax_estande * 2),
        )
    )
    reg_estande = memory_db.registrar_leitura(
        LeituraRecord(
            id=0,
            pdv_id=zona_estande.id,
            timestamp=agora_utc(),
            pax_count=inf_estande.pax_count,
            tempo_espera_seg=inf_estande.tempo_espera_seg,
            densidade_m2=inf_estande.densidade_m2,
            status_cor=inf_estande.status_cor,
            confianca_ia=inf_estande.confianca_ia,
            anomalias=inf_estande.anomalias,
            modo_leitura="TEMPO_REAL",
            sensor_status="ONLINE",
            transacoes_pos_ultimos_3m=pax_estande,
        )
    )

    leitura_fila_contrato = leitura_para_contrato(reg_fila)
    leitura_estande_contrato = leitura_para_contrato(reg_estande)

    event_bus.publicar(
        criar_evento(
            "leitura",
            f"Leitura YOLO ({visao.motor_visao}) na zona {zona_fila.id} ({zona_fila.nome})",
            leitura=leitura_fila_contrato,
        )
    )
    event_bus.publicar(
        criar_evento(
            "leitura",
            f"Leitura YOLO ({visao.motor_visao}) na zona {zona_estande.id} ({zona_estande.nome})",
            leitura=leitura_estande_contrato,
        )
    )

    alerta_assistido = pax_fila >= 6 or inf_fila.tempo_espera_seg >= 210

    return YoloScanResponseContract(
        motor_visao=visao.motor_visao,  # type: ignore[arg-type]
        resolucao_frame=visao.resolucao_frame,
        frame_processado=visao.frame_processado,
        pessoas_detectadas_total=pax_fila + pax_estande,
        pessoas_zona_fila=pax_fila,
        pessoas_zona_estande=pax_estande,
        alerta_assistido_ativo=alerta_assistido,
        coordenadas_fila=visao.coordenadas_fila,
        coordenadas_estande=visao.coordenadas_estande,
        leitura_fila=leitura_fila_contrato,
        leitura_estande=leitura_estande_contrato,
    )
