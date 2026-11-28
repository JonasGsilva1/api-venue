"""
Repositório PostgreSQL (Supabase) com a mesma interface pública do `MemoryDB`.

Mantém 100% de compatibilidade com os contratos Pydantic, seeds iniciais e regras
de negócio existentes, usando `ThreadedConnectionPool` (psycopg2) com `DATABASE_URL`.
"""
from __future__ import annotations

import logging
import math
import time
from contextlib import contextmanager
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any, Dict, Iterator, List, Optional

import psycopg2
from psycopg2.extras import Json, RealDictCursor
from psycopg2.pool import ThreadedConnectionPool

from app.repositories.memory_db import (
    HISTORICO_MINUTOS,
    LIMIAR_REDIRECIONAMENTO_SEG,
    _SEED_LEITURAS,
    AcionamentoRecord,
    AcumuladoRecord,
    CameraHardwareRecord,
    DispatchRecord,
    FotoRecenteRecord,
    IluminacaoCenicaRecord,
    InstagramavelRecord,
    LeituraRecord,
    PredicaoRecord,
    ZonaRecord,
    _seed_cameras,
    _seed_instagramavel,
    _seed_zonas,
    agora_utc,
    calcular_densidade,
    classificar_status_cor,
)
from app.services.ai_engine import formatar_tempo

logger = logging.getLogger(__name__)

_LOCALIZACOES_SEED = {
    1: "RAIZ | Acesso Estande Principal | planta(x:570,y:440)",
    2: "RAIZ | Passarela Lateral Leste | planta(x:230,y:470)",
    3: "RAIZ | Lounge & Circulação | planta(x:860,y:330)",
    4: "RAIZ | Espaço Instagramável | planta(x:1080,y:480)",
    5: "Arena | Corredor de Acesso Norte | planta(x:700,y:200)",
}

_CAMERA_ALIASES = {
    "cam-int-01": "cam-fluxo-01",
    "cam-int-02": "cam-fluxo-02",
    "cam-int-03": "cam-fluxo-03",
    "cam-fb-01": "cam-fluxo-01",
    "cam-fb-02": "cam-fluxo-02",
    "cam-fb-03": "cam-fluxo-03",
}


def _to_float(valor: Any, padrao: float = 0.0) -> float:
    if valor is None:
        return padrao
    if isinstance(valor, Decimal):
        return float(valor)
    return float(valor)


def _row_para_zona(row: Dict[str, Any]) -> ZonaRecord:
    indicadores_raw = row.get("indicadores") or {}
    indicadores = {
        str(k): (None if v is None else int(v))
        for k, v in indicadores_raw.items()
    }
    return ZonaRecord(
        id=int(row["id"]),
        codigo_zona=str(row["codigo_zona"]),
        nome=str(row["nome"]),
        tipo=str(row["tipo"]),
        area_m2=_to_float(row["area_m2"]),
        capacidade=int(row["capacidade"]),
        tempo_servico_seg=_to_float(row.get("tempo_servico_seg"), 0.0),
        postos_atendimento=int(row.get("postos_atendimento") or 1),
        indicadores=indicadores,
    )


def _row_para_leitura(row: Dict[str, Any]) -> LeituraRecord:
    return LeituraRecord(
        id=int(row["id"]),
        pdv_id=int(row["pdv_id"]),
        timestamp=row["timestamp"],
        pax_count=int(row["pax_count"]),
        tempo_espera_seg=int(row["tempo_espera_seg"]),
        densidade_m2=_to_float(row["densidade_m2"]),
        status_cor=str(row["status_cor"]),
        confianca_ia=_to_float(row["confianca_ia"]),
        anomalias=list(row.get("anomalias") or []),
        modo_leitura=str(row["modo_leitura"]),
        sensor_status=str(row["sensor_status"]),
        transacoes_pos_ultimos_3m=int(row.get("transacoes_pos_ultimos_3m") or 0),
    )


def _row_para_instagramavel(row: Dict[str, Any]) -> InstagramavelRecord:
    luz = row.get("iluminacao_cenica") or {}
    fotos = row.get("fotos_recentes") or []
    return InstagramavelRecord(
        id=str(row["id"]),
        codigo=str(row["codigo"]),
        nome=str(row["nome"]),
        patrocinador=str(row["patrocinador"]),
        categoriaCenario=str(row["categoria_cenario"]),
        setor=str(row["setor"]),
        status=str(row["status"]),
        capturasTotais=int(row.get("capturas_totais") or 0),
        compartilhamentosSociaisEstimados=int(row.get("compartilhamentos_sociais_estimados") or 0),
        alcanceEstimadoRedes=int(row.get("alcance_estimado_redes") or 0),
        tempoPermanenciaMedioSegundos=int(row.get("tempo_permanencia_medio_segundos") or 0),
        avaliacaoMedia=_to_float(row.get("avaliacao_media"), 5.0),
        npsScore=int(row.get("nps_score") or 0),
        pessoasNaFila=int(row.get("pessoas_na_fila") or 0),
        tempoEsperaMin=_to_float(row.get("tempo_espera_min"), 0.0),
        iluminacaoCenica=IluminacaoCenicaRecord(
            modo=str(luz.get("modo", "Neon Pulsar")),
            corPrincipal=str(luz.get("corPrincipal", "#10b981")),
            intensidadePct=int(luz.get("intensidadePct", 90)),
        ),
        posicao3D=[_to_float(v) for v in (row.get("posicao_3d") or [0.0, 0.0, 0.0])],
        hashtagsPrincipais=list(row.get("hashtags_principais") or []),
        fotosRecentes=[
            FotoRecenteRecord(
                id=str(f.get("id", "")),
                timestamp=str(f.get("timestamp", "")),
                autor=str(f.get("autor", "")),
                likes=int(f.get("likes", 0)),
            )
            for f in fotos
        ],
    )


def _row_para_camera(
    row: Dict[str, Any],
    zona_dedicada: Optional[ZonaRecord] = None,
    leitura_dedicada: Optional[LeituraRecord] = None,
) -> CameraHardwareRecord:
    return CameraHardwareRecord(
        id=str(row["id"]),
        codigo=str(row["codigo"]),
        nome=str(row["nome"]),
        tipo=str(row["tipo"]),
        setor=str(row["setor"]),
        posicao=[_to_float(v) for v in (row.get("posicao") or [0.0, 0.0, 0.0])],
        alvo=[_to_float(v) for v in (row.get("alvo") or [0.0, 0.0, 0.0])],
        status=str(row["status"]),
        fps=int(row.get("fps") or 30),
        rotulo_metrica=str(row["rotulo_metrica"]),
        valor_metrica=str(row["valor_metrica"]),
        detalhe_metrica=row.get("detalhe_metrica"),
        pdv_id_vinculado=row.get("pdv_id_vinculado"),
        zona_dedicada=zona_dedicada,
        leitura_dedicada=leitura_dedicada,
    )


class PostgresDB:
    """Repositório persistente conectado ao PostgreSQL / Supabase via `DATABASE_URL`."""

    backend_name = "postgresql"

    def __init__(
        self,
        database_url: str,
        min_conn: int = 1,
        max_conn: int = 10,
        connect_timeout: int = 10,
    ) -> None:
        self._database_url = database_url
        self._pool = ThreadedConnectionPool(
            minconn=min_conn,
            maxconn=max_conn,
            dsn=database_url,
            connect_timeout=connect_timeout,
        )
        self.ensure_seeded()

    @contextmanager
    def _cursor(self, commit: bool = False) -> Iterator[RealDictCursor]:
        conn = self._pool.getconn()
        descartar = False
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                yield cur
            if commit:
                conn.commit()
        except psycopg2.OperationalError:
            descartar = True
            try:
                conn.rollback()
            except Exception:
                pass
            raise
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass
            raise
        finally:
            self._pool.putconn(conn, close=descartar)

    def close(self) -> None:
        if getattr(self, "_pool", None) is not None:
            self._pool.closeall()

    def ping(self) -> tuple[bool, float, int, Optional[str]]:
        inicio = time.perf_counter()
        try:
            with self._cursor() as cur:
                cur.execute(
                    "SELECT COUNT(*) AS total FROM public.zonas_pdv WHERE eh_zona_dedicada_camera = false"
                )
                row = cur.fetchone()
                total = int(row["total"]) if row else 0
            latencia_ms = round((time.perf_counter() - inicio) * 1000.0, 2)
            return True, latencia_ms, total, None
        except Exception as exc:
            latencia_ms = round((time.perf_counter() - inicio) * 1000.0, 2)
            return False, latencia_ms, 0, str(exc)

    def reset(self) -> None:
        """Em produção no PostgreSQL não apaga dados; apenas garante seeds obrigatórios."""
        self.ensure_seeded()

    def ensure_seeded(self) -> None:
        """Popula dados iniciais de forma idempotente caso as tabelas ainda estejam vazias."""
        agora = agora_utc()
        with self._cursor(commit=True) as cur:
            cur.execute(
                """
                INSERT INTO public.evento_estado (
                    id, servico, versao, status_operacional_evento, motor_ia_online, conexoes_tempo_real
                )
                VALUES (1, 'venue-intelligence-core', '2.0.0', 'ESTAVEL', true, 0)
                ON CONFLICT (id) DO NOTHING
                """
            )
            cur.execute(
                """
                INSERT INTO public.acumulado_evento (
                    id, publico_por_dia, atendimentos_cortesia, engajamento_interacoes
                )
                VALUES (1, %s, 720, 360)
                ON CONFLICT (id) DO NOTHING
                """,
                (Json({"D1": 240, "D2": 320, "D3": 400}),),
            )
            cur.execute(
                """
                INSERT INTO public.predicoes_gargalo (
                    alerta_id, pdv_id, setor, nivel_predito, motivo, acao_recomendada,
                    tempo_estimado_formacao_fila, espera_atual_min, projecao_5m, projecao_10m,
                    projecao_15m, velocidade_min_por_min, confianca_pct, minutos_ate_limite, ativa
                )
                VALUES (
                    'PRED-9921', NULL, 'Portão Principal / Entrada Norte', 'CRITICO',
                    'Aumento repentino de fluxo detectado por IA', 'Acionar 2 filas adicionais',
                    '03m 30s', 3.80, 4.50, 5.20, 6.00, 0.14, 88.50, 30, true
                )
                ON CONFLICT (alerta_id) DO NOTHING
                """
            )

            cur.execute("SELECT COUNT(*) AS total FROM public.zonas_pdv")
            total_zonas = int(cur.fetchone()["total"])
            if total_zonas == 0:
                zonas_principais = _seed_zonas()
                cameras_seed = _seed_cameras(agora)

                for z in zonas_principais:
                    cur.execute(
                        """
                        INSERT INTO public.zonas_pdv (
                            id, codigo_zona, nome, tipo, area_m2, capacidade,
                            tempo_servico_seg, postos_atendimento, sensor_status,
                            eh_zona_dedicada_camera, localizacao_geo, indicadores,
                            habilitar_redirecionamento_push
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'ONLINE', false, %s, %s, %s)
                        ON CONFLICT (id) DO NOTHING
                        """,
                        (
                            z.id,
                            z.codigo_zona,
                            z.nome,
                            z.tipo,
                            z.area_m2,
                            z.capacidade,
                            z.tempo_servico_seg,
                            z.postos_atendimento,
                            _LOCALIZACOES_SEED.get(z.id, f"Arena | Zona {z.id} | planta(x:500,y:400)"),
                            Json(z.indicadores),
                            (z.indicadores.get("tempo_espera_seg") or 0) > LIMIAR_REDIRECIONAMENTO_SEG,
                        ),
                    )

                for cam in cameras_seed:
                    if cam.zona_dedicada is None:
                        continue
                    zd = cam.zona_dedicada
                    cur.execute(
                        """
                        INSERT INTO public.zonas_pdv (
                            id, codigo_zona, nome, tipo, area_m2, capacidade,
                            tempo_servico_seg, postos_atendimento, sensor_status,
                            eh_zona_dedicada_camera, localizacao_geo, indicadores,
                            habilitar_redirecionamento_push
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'ONLINE', true, %s, %s, %s)
                        ON CONFLICT (id) DO NOTHING
                        """,
                        (
                            zd.id,
                            zd.codigo_zona,
                            zd.nome,
                            zd.tipo,
                            zd.area_m2,
                            zd.capacidade,
                            zd.tempo_servico_seg,
                            zd.postos_atendimento,
                            f"Arena | Zona {zd.id} | planta(x:500,y:400)",
                            Json(zd.indicadores),
                            (zd.indicadores.get("tempo_espera_seg") or 0) > LIMIAR_REDIRECIONAMENTO_SEG,
                        ),
                    )

                cur.execute(
                    "SELECT setval(pg_get_serial_sequence('public.zonas_pdv', 'id'), COALESCE((SELECT MAX(id) FROM public.zonas_pdv), 1))"
                )

                zonas_por_id = {z.id: z for z in zonas_principais}
                for pdv_id, base in _SEED_LEITURAS.items():
                    zona = zonas_por_id[pdv_id]
                    ultimo_id: Optional[int] = None
                    ultimo_tempo = 0
                    for i in range(HISTORICO_MINUTOS - 1, -1, -1):
                        onda = 0.0 if i == 0 else 0.15 * math.sin(i * 0.6)
                        pax = max(0, round(base["pax"] * (1 + onda)))
                        tempo = max(0, round(base["tempo"] * (1 + onda)))
                        tx = max(0, base["tx"] + (0 if i == 0 else round(2 * math.sin(i * 0.9))))
                        densidade = calcular_densidade(pax, zona.area_m2)
                        status_cor = classificar_status_cor(tempo)
                        ts = agora - timedelta(minutes=i, seconds=15)
                        cur.execute(
                            """
                            INSERT INTO public.leituras_telemetria (
                                pdv_id, "timestamp", pax_count, tempo_espera_seg, tempo_espera_fmt,
                                densidade_m2, status_cor, confianca_ia, anomalias, modo_leitura,
                                sensor_status, transacoes_pos_ultimos_3m, coordenadas_anonimizadas
                            )
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::text[], 'TEMPO_REAL', 'ONLINE', %s, '[]'::jsonb)
                            RETURNING id
                            """,
                            (
                                pdv_id,
                                ts,
                                pax,
                                tempo,
                                formatar_tempo(tempo),
                                densidade,
                                status_cor,
                                base["conf"],
                                [],
                                tx,
                            ),
                        )
                        ultimo_id = int(cur.fetchone()["id"])
                        ultimo_tempo = tempo

                    if ultimo_id is not None:
                        cur.execute(
                            """
                            UPDATE public.zonas_pdv
                            SET ultima_leitura_id = %s,
                                habilitar_redirecionamento_push = %s
                            WHERE id = %s
                            """,
                            (ultimo_id, ultimo_tempo > LIMIAR_REDIRECIONAMENTO_SEG, pdv_id),
                        )

                leitura_dedicada_ids: Dict[int, int] = {}
                for cam in cameras_seed:
                    if cam.zona_dedicada is None or cam.leitura_dedicada is None:
                        continue
                    ld = cam.leitura_dedicada
                    cur.execute(
                        """
                        INSERT INTO public.leituras_telemetria (
                            pdv_id, "timestamp", pax_count, tempo_espera_seg, tempo_espera_fmt,
                            densidade_m2, status_cor, confianca_ia, anomalias, modo_leitura,
                            sensor_status, transacoes_pos_ultimos_3m, coordenadas_anonimizadas
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::text[], %s, %s, %s, '[]'::jsonb)
                        RETURNING id
                        """,
                        (
                            cam.zona_dedicada.id,
                            ld.timestamp,
                            ld.pax_count,
                            ld.tempo_espera_seg,
                            formatar_tempo(ld.tempo_espera_seg),
                            ld.densidade_m2,
                            ld.status_cor,
                            ld.confianca_ia,
                            list(ld.anomalias),
                            ld.modo_leitura,
                            ld.sensor_status,
                            ld.transacoes_pos_ultimos_3m,
                        ),
                    )
                    ld_id = int(cur.fetchone()["id"])
                    leitura_dedicada_ids[cam.zona_dedicada.id] = ld_id
                    cur.execute(
                        "UPDATE public.zonas_pdv SET ultima_leitura_id = %s WHERE id = %s",
                        (ld_id, cam.zona_dedicada.id),
                    )

                for cam in cameras_seed:
                    zd_id = cam.zona_dedicada.id if cam.zona_dedicada is not None else None
                    ld_id = leitura_dedicada_ids.get(zd_id) if zd_id is not None else None
                    cur.execute(
                        """
                        INSERT INTO public.cameras_hardware (
                            id, codigo, nome, tipo, setor, posicao, alvo, status, fps,
                            rotulo_metrica, valor_metrica, detalhe_metrica,
                            pdv_id_vinculado, zona_dedicada_id, leitura_dedicada_id
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (id) DO NOTHING
                        """,
                        (
                            cam.id,
                            cam.codigo,
                            cam.nome,
                            cam.tipo,
                            cam.setor,
                            Json(cam.posicao),
                            Json(cam.alvo),
                            cam.status,
                            cam.fps,
                            cam.rotulo_metrica,
                            cam.valor_metrica,
                            cam.detalhe_metrica,
                            cam.pdv_id_vinculado,
                            zd_id,
                            ld_id,
                        ),
                    )

            cur.execute("SELECT COUNT(*) AS total FROM public.ativacoes_instagramaveis")
            if int(cur.fetchone()["total"]) == 0:
                for insta in _seed_instagramavel():
                    cur.execute(
                        """
                        INSERT INTO public.ativacoes_instagramaveis (
                            id, codigo, nome, patrocinador, categoria_cenario, setor, status,
                            capturas_totais, compartilhamentos_sociais_estimados, alcance_estimado_redes,
                            tempo_permanencia_medio_segundos, avaliacao_media, nps_score,
                            pessoas_na_fila, tempo_espera_min, iluminacao_cenica, posicao_3d,
                            hashtags_principais, fotos_recentes
                        )
                        VALUES (
                            %s, %s, %s, %s, %s, %s, %s,
                            %s, %s, %s,
                            %s, %s, %s,
                            %s, %s, %s, %s,
                            %s::text[], %s
                        )
                        ON CONFLICT (id) DO NOTHING
                        """,
                        (
                            insta.id,
                            insta.codigo,
                            insta.nome,
                            insta.patrocinador,
                            insta.categoriaCenario,
                            insta.setor,
                            insta.status,
                            insta.capturasTotais,
                            insta.compartilhamentosSociaisEstimados,
                            insta.alcanceEstimadoRedes,
                            insta.tempoPermanenciaMedioSegundos,
                            insta.avaliacaoMedia,
                            insta.npsScore,
                            insta.pessoasNaFila,
                            insta.tempoEsperaMin,
                            Json(
                                {
                                    "modo": insta.iluminacaoCenica.modo,
                                    "corPrincipal": insta.iluminacaoCenica.corPrincipal,
                                    "intensidadePct": insta.iluminacaoCenica.intensidadePct,
                                }
                            ),
                            Json(insta.posicao3D),
                            list(insta.hashtagsPrincipais),
                            Json(
                                [
                                    {
                                        "id": f.id,
                                        "timestamp": f.timestamp,
                                        "autor": f.autor,
                                        "likes": f.likes,
                                    }
                                    for f in insta.fotosRecentes
                                ]
                            ),
                        ),
                    )

            cur.execute("SELECT COUNT(*) AS total FROM public.snapshots_heatmap_readiness")
            if int(cur.fetchone()["total"]) == 0:
                cur.execute(
                    """
                    INSERT INTO public.snapshots_heatmap_readiness (
                        sensores_ativos, fontes_total, cameras_neurais_ativas, lidar_fps,
                        rota_livre_ok, motor_ia_online, pessoas_presentes, ocupacao_estimada_pct,
                        permanencia_media_seg, densidade_maxima_m2, velocidade_media_ms,
                        zonas_atracao, hotspots_criticos, estado_operacional
                    )
                    VALUES (7, 7, 7, 60, true, true, 24, 46, 318, 0.78, 0.68, 3, 0, 'ESTAVEL')
                    """
                )

    # ── Zonas / leituras ─────────────────────────────────────────────────────
    def listar_zonas(self) -> List[ZonaRecord]:
        with self._cursor() as cur:
            cur.execute(
                """
                SELECT id, codigo_zona, nome, tipo, area_m2, capacidade,
                       tempo_servico_seg, postos_atendimento, indicadores
                FROM public.zonas_pdv
                WHERE eh_zona_dedicada_camera = false
                ORDER BY id ASC
                """
            )
            return [_row_para_zona(row) for row in cur.fetchall()]

    def obter_zona(self, pdv_id: int) -> Optional[ZonaRecord]:
        with self._cursor() as cur:
            cur.execute(
                """
                SELECT id, codigo_zona, nome, tipo, area_m2, capacidade,
                       tempo_servico_seg, postos_atendimento, indicadores
                FROM public.zonas_pdv
                WHERE id = %s
                """,
                (pdv_id,),
            )
            row = cur.fetchone()
            return _row_para_zona(row) if row else None

    def ultima_leitura(self, pdv_id: int) -> Optional[LeituraRecord]:
        with self._cursor() as cur:
            cur.execute(
                """
                SELECT id, pdv_id, "timestamp", pax_count, tempo_espera_seg,
                       densidade_m2, status_cor, confianca_ia, anomalias,
                       modo_leitura, sensor_status, transacoes_pos_ultimos_3m
                FROM public.leituras_telemetria
                WHERE pdv_id = %s
                ORDER BY "timestamp" DESC, id DESC
                LIMIT 1
                """,
                (pdv_id,),
            )
            row = cur.fetchone()
            return _row_para_leitura(row) if row else None

    def historico(self, pdv_id: int, janela: timedelta) -> List[LeituraRecord]:
        limite = agora_utc() - janela
        with self._cursor() as cur:
            cur.execute(
                """
                SELECT id, pdv_id, "timestamp", pax_count, tempo_espera_seg,
                       densidade_m2, status_cor, confianca_ia, anomalias,
                       modo_leitura, sensor_status, transacoes_pos_ultimos_3m
                FROM public.leituras_telemetria
                WHERE pdv_id = %s
                  AND modo_leitura = 'TEMPO_REAL'
                  AND "timestamp" >= %s
                ORDER BY "timestamp" ASC, id ASC
                """,
                (pdv_id, limite),
            )
            return [_row_para_leitura(row) for row in cur.fetchall()]

    def registrar_leitura(
        self,
        leitura: LeituraRecord,
        coordenadas: Optional[List[Dict[str, float]]] = None,
        aviso_contingencia: Optional[str] = None,
        taxa_nfc_seg_por_pessoa: Optional[int] = None,
    ) -> LeituraRecord:
        coords_json = Json(coordenadas or [])
        with self._cursor(commit=True) as cur:
            cur.execute(
                """
                INSERT INTO public.leituras_telemetria (
                    pdv_id, "timestamp", pax_count, tempo_espera_seg, tempo_espera_fmt,
                    densidade_m2, status_cor, confianca_ia, anomalias, modo_leitura,
                    sensor_status, transacoes_pos_ultimos_3m, taxa_nfc_seg_por_pessoa,
                    aviso_contingencia, coordenadas_anonimizadas
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::text[], %s, %s, %s, %s, %s, %s)
                RETURNING id, pdv_id, "timestamp", pax_count, tempo_espera_seg,
                          densidade_m2, status_cor, confianca_ia, anomalias,
                          modo_leitura, sensor_status, transacoes_pos_ultimos_3m
                """,
                (
                    leitura.pdv_id,
                    leitura.timestamp,
                    leitura.pax_count,
                    leitura.tempo_espera_seg,
                    formatar_tempo(leitura.tempo_espera_seg),
                    leitura.densidade_m2,
                    leitura.status_cor,
                    leitura.confianca_ia,
                    list(leitura.anomalias),
                    leitura.modo_leitura,
                    leitura.sensor_status,
                    leitura.transacoes_pos_ultimos_3m,
                    taxa_nfc_seg_por_pessoa,
                    aviso_contingencia,
                    coords_json,
                ),
            )
            registro = _row_para_leitura(cur.fetchone())

            cur.execute("SELECT indicadores FROM public.zonas_pdv WHERE id = %s", (registro.pdv_id,))
            zona_row = cur.fetchone()
            if zona_row is not None:
                ind = dict(zona_row.get("indicadores") or {})
                if "fila_pax" in ind:
                    ind["fila_pax"] = registro.pax_count
                if "tempo_espera_seg" in ind:
                    ind["tempo_espera_seg"] = registro.tempo_espera_seg
                cur.execute(
                    """
                    UPDATE public.zonas_pdv
                    SET ultima_leitura_id = %s,
                        sensor_status = %s,
                        habilitar_redirecionamento_push = %s,
                        indicadores = %s
                    WHERE id = %s
                    """,
                    (
                        registro.id,
                        registro.sensor_status,
                        registro.tempo_espera_seg > LIMIAR_REDIRECIONAMENTO_SEG,
                        Json(ind),
                        registro.pdv_id,
                    ),
                )

            if registro.status_cor == "VERMELHO" or "SATURACAO" in registro.anomalias:
                novo_status = "critico"
            elif registro.status_cor == "AMARELO" or registro.tempo_espera_seg >= 210:
                novo_status = "atencao"
            else:
                novo_status = "operacional"

            espera_min = round(registro.tempo_espera_seg / 60.0, 1)
            valor_metrica = f"{registro.pax_count} pessoas / {registro.densidade_m2:.2f} p/m²"
            detalhe_metrica = f"Tempo fila: {espera_min} min"

            cur.execute(
                """
                UPDATE public.cameras_hardware
                SET status = %s,
                    valor_metrica = %s,
                    detalhe_metrica = %s,
                    leitura_dedicada_id = CASE
                        WHEN zona_dedicada_id = %s THEN %s
                        ELSE leitura_dedicada_id
                    END
                WHERE pdv_id_vinculado = %s OR zona_dedicada_id = %s
                """,
                (
                    novo_status,
                    valor_metrica,
                    detalhe_metrica,
                    registro.pdv_id,
                    registro.id,
                    registro.pdv_id,
                    registro.pdv_id,
                ),
            )

            self._inserir_snapshot_heatmap(cur)

            cur.execute(
                """
                INSERT INTO public.eventos_stream (tipo_evento, pdv_id, payload)
                VALUES ('leitura', %s, %s)
                """,
                (
                    registro.pdv_id,
                    Json(
                        {
                            "leitura_id": registro.id,
                            "modo_leitura": registro.modo_leitura,
                            "status_cor": registro.status_cor,
                            "pax_count": registro.pax_count,
                            "tempo_espera_seg": registro.tempo_espera_seg,
                        }
                    ),
                ),
            )
            return registro

    def _inserir_snapshot_heatmap(self, cur: RealDictCursor) -> None:
        cur.execute(
            """
            SELECT z.id,
                   z.sensor_status,
                   l.pax_count,
                   l.densidade_m2,
                   l.status_cor,
                   l.anomalias
            FROM public.zonas_pdv z
            LEFT JOIN public.leituras_telemetria l ON l.id = z.ultima_leitura_id
            WHERE z.eh_zona_dedicada_camera = false
            """
        )
        rows = cur.fetchall()
        pax_estande = sum(
            int(r["pax_count"] or 0)
            for r in rows
            if int(r["id"]) in (1, 2, 3, 4) and r["pax_count"] is not None
        )
        ocupacao = min(100, max(0, round(pax_estande * 46 / 24)))
        densidades = [_to_float(r["densidade_m2"]) for r in rows if r["densidade_m2"] is not None]
        dens_max = round(max([0.78] + densidades), 2)
        hotspots = sum(
            1
            for r in rows
            if int(r["id"]) in (1, 2, 3, 4)
            and r["status_cor"] is not None
            and (r["status_cor"] == "VERMELHO" or "SATURACAO" in (r["anomalias"] or []))
        )

        cur.execute(
            "SELECT COUNT(*) AS offline FROM public.zonas_pdv WHERE sensor_status = 'OFFLINE'"
        )
        offline = int(cur.fetchone()["offline"])
        cur.execute(
            """
            SELECT COUNT(*) AS pendentes
            FROM public.ordens_dispatch
            WHERE nivel_critico = 'CRITICO_PCD_CLIMA' AND status <> 'RESOLVIDO'
            """
        )
        pcd_pendente = int(cur.fetchone()["pendentes"]) > 0
        cur.execute(
            "SELECT status_operacional_evento, motor_ia_online FROM public.evento_estado WHERE id = 1"
        )
        estado = cur.fetchone() or {"status_operacional_evento": "ESTAVEL", "motor_ia_online": True}

        cur.execute(
            """
            INSERT INTO public.snapshots_heatmap_readiness (
                sensores_ativos, fontes_total, cameras_neurais_ativas, lidar_fps,
                rota_livre_ok, motor_ia_online, pessoas_presentes, ocupacao_estimada_pct,
                permanencia_media_seg, densidade_maxima_m2, velocidade_media_ms,
                zonas_atracao, hotspots_criticos, estado_operacional
            )
            VALUES (%s, 7, 7, 60, %s, %s, %s, %s, 318, %s, 0.68, 3, %s, %s)
            """,
            (
                max(0, 7 - offline),
                not pcd_pendente,
                bool(estado["motor_ia_online"]),
                pax_estande,
                ocupacao,
                dens_max,
                hotspots,
                estado["status_operacional_evento"],
            ),
        )

    def registrar_yolo_scan(
        self,
        video_origem: str,
        frame_indice: int,
        motor_visao: str,
        resolucao_frame: str,
        pdv_fila_id: int,
        pdv_estande_id: int,
        pessoas_detectadas_total: int,
        pessoas_zona_fila: int,
        pessoas_zona_estande: int,
        alerta_assistido_ativo: bool,
        coordenadas_fila: List[Dict[str, float]],
        coordenadas_estande: List[Dict[str, float]],
        leitura_fila_id: Optional[int],
        leitura_estande_id: Optional[int],
    ) -> None:
        with self._cursor(commit=True) as cur:
            cur.execute(
                """
                INSERT INTO public.yolo_scans (
                    video_origem, frame_indice, motor_visao, resolucao_frame,
                    pdv_fila_id, pdv_estande_id, pessoas_detectadas_total,
                    pessoas_zona_fila, pessoas_zona_estande, alerta_assistido_ativo,
                    coordenadas_fila, coordenadas_estande, leitura_fila_id, leitura_estande_id
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    video_origem,
                    frame_indice,
                    motor_visao,
                    resolucao_frame,
                    pdv_fila_id,
                    pdv_estande_id,
                    pessoas_detectadas_total,
                    pessoas_zona_fila,
                    pessoas_zona_estande,
                    alerta_assistido_ativo,
                    Json(coordenadas_fila),
                    Json(coordenadas_estande),
                    leitura_fila_id,
                    leitura_estande_id,
                ),
            )

    # ── Estado operacional / motor de IA ─────────────────────────────────────
    @property
    def status_operacional(self) -> str:
        with self._cursor() as cur:
            cur.execute("SELECT status_operacional_evento FROM public.evento_estado WHERE id = 1")
            row = cur.fetchone()
            return str(row["status_operacional_evento"]) if row else "ESTAVEL"

    def marcar_acao_em_andamento(self) -> str:
        with self._cursor(commit=True) as cur:
            cur.execute("SELECT status_operacional_evento FROM public.evento_estado WHERE id = 1 FOR UPDATE")
            row = cur.fetchone()
            anterior = str(row["status_operacional_evento"]) if row else "ESTAVEL"
            cur.execute(
                """
                UPDATE public.evento_estado
                SET status_operacional_evento = 'ACAO_EM_ANDAMENTO',
                    atualizado_em = now()
                WHERE id = 1
                """
            )
            return anterior

    @property
    def motor_ia_online(self) -> bool:
        with self._cursor() as cur:
            cur.execute("SELECT motor_ia_online FROM public.evento_estado WHERE id = 1")
            row = cur.fetchone()
            return bool(row["motor_ia_online"]) if row else True

    def definir_motor_ia_online(self, online: bool) -> None:
        with self._cursor(commit=True) as cur:
            cur.execute(
                """
                UPDATE public.evento_estado
                SET motor_ia_online = %s,
                    atualizado_em = now()
                WHERE id = 1
                """,
                (online,),
            )

    # ── Predições / acionamentos ─────────────────────────────────────────────
    def obter_predicao(self) -> PredicaoRecord:
        with self._cursor() as cur:
            cur.execute(
                """
                SELECT alerta_id, setor, nivel_predito, motivo,
                       acao_recomendada, tempo_estimado_formacao_fila
                FROM public.predicoes_gargalo
                WHERE ativa = true
                ORDER BY criado_em DESC, id DESC
                LIMIT 1
                """
            )
            row = cur.fetchone()
            if not row:
                return PredicaoRecord(
                    alerta_id="PRED-9921",
                    setor="Portão Principal / Entrada Norte",
                    nivel_predito="CRITICO",
                    motivo="Aumento repentino de fluxo detectado por IA",
                    acao_recomendada="Acionar 2 filas adicionais",
                    tempo_estimado_formacao_fila="03m 30s",
                )
            return PredicaoRecord(
                alerta_id=str(row["alerta_id"]),
                setor=str(row["setor"]),
                nivel_predito=str(row["nivel_predito"]),
                motivo=str(row["motivo"]),
                acao_recomendada=str(row["acao_recomendada"]),
                tempo_estimado_formacao_fila=str(row["tempo_estimado_formacao_fila"]),
            )

    def registrar_acionamento(self, alerta_id: str, acao: str, setor: str) -> AcionamentoRecord:
        with self._cursor(commit=True) as cur:
            cur.execute("SELECT status_operacional_evento FROM public.evento_estado WHERE id = 1 FOR UPDATE")
            row = cur.fetchone()
            anterior = str(row["status_operacional_evento"]) if row else "ESTAVEL"
            cur.execute(
                """
                UPDATE public.evento_estado
                SET status_operacional_evento = 'ACAO_EM_ANDAMENTO',
                    atualizado_em = now()
                WHERE id = 1
                """
            )
            cur.execute(
                """
                INSERT INTO public.acionamentos_preditivos (
                    alerta_id, acao_executada, setor, status_operacional_anterior, acionado_por
                )
                VALUES (%s, %s, %s, %s, NULL)
                RETURNING alerta_id, acao_executada, setor, status_operacional_anterior, registrado_em
                """,
                (alerta_id, acao, setor, anterior),
            )
            inserted = cur.fetchone()
            cur.execute(
                """
                INSERT INTO public.eventos_stream (tipo_evento, pdv_id, payload)
                VALUES ('acionamento_preditivo', NULL, %s)
                """,
                (Json({"alerta_id": alerta_id, "acao_executada": acao, "setor": setor}),),
            )
            return AcionamentoRecord(
                alerta_id=str(inserted["alerta_id"]),
                acao_executada=str(inserted["acao_executada"]),
                setor=str(inserted["setor"]),
                status_operacional_anterior=str(inserted["status_operacional_anterior"]),
                registrado_em=inserted["registrado_em"],
            )

    # ── Despachos táticos ────────────────────────────────────────────────────
    def criar_dispatch(self, pdv_id: int, nivel_critico: str, sugestao_acao: str) -> DispatchRecord:
        with self._cursor(commit=True) as cur:
            cur.execute("SELECT nome FROM public.zonas_pdv WHERE id = %s", (pdv_id,))
            zona_row = cur.fetchone()
            nome_zona = str(zona_row["nome"]) if zona_row else f"Zona {pdv_id}"

            cur.execute(
                """
                UPDATE public.evento_estado
                SET status_operacional_evento = 'ACAO_EM_ANDAMENTO',
                    atualizado_em = now()
                WHERE id = 1
                """
            )
            cur.execute(
                """
                INSERT INTO public.ordens_dispatch (
                    pdv_id, nome_zona, nivel_critico, sugestao_acao,
                    status, status_operacional_evento, criado_por
                )
                VALUES (%s, %s, %s, %s, 'EM_ANDAMENTO', 'ACAO_EM_ANDAMENTO', NULL)
                RETURNING id, pdv_id, nivel_critico, sugestao_acao, status, criado_em
                """,
                (pdv_id, nome_zona, nivel_critico, sugestao_acao),
            )
            row = cur.fetchone()
            cur.execute(
                """
                INSERT INTO public.eventos_stream (tipo_evento, pdv_id, payload)
                VALUES ('dispatch', %s, %s)
                """,
                (
                    pdv_id,
                    Json(
                        {
                            "dispatch_id": int(row["id"]),
                            "nivel_critico": nivel_critico,
                            "sugestao_acao": sugestao_acao,
                        }
                    ),
                ),
            )
            return DispatchRecord(
                id=int(row["id"]),
                pdv_id=int(row["pdv_id"]),
                nivel_critico=str(row["nivel_critico"]),
                sugestao_acao=str(row["sugestao_acao"]),
                status=str(row["status"]),
                criado_em=row["criado_em"],
            )

    def listar_dispatches(self) -> List[DispatchRecord]:
        with self._cursor() as cur:
            cur.execute(
                """
                SELECT id, pdv_id, nivel_critico, sugestao_acao, status, criado_em
                FROM public.ordens_dispatch
                ORDER BY criado_em ASC, id ASC
                """
            )
            return [
                DispatchRecord(
                    id=int(r["id"]),
                    pdv_id=int(r["pdv_id"]),
                    nivel_critico=str(r["nivel_critico"]),
                    sugestao_acao=str(r["sugestao_acao"]),
                    status=str(r["status"]),
                    criado_em=r["criado_em"],
                )
                for r in cur.fetchall()
            ]

    # ── Readiness / Heatmap / Acumulado ──────────────────────────────────────
    def readiness(self) -> Dict[str, object]:
        with self._cursor() as cur:
            cur.execute("SELECT COUNT(*) AS offline FROM public.zonas_pdv WHERE sensor_status = 'OFFLINE'")
            offline = int(cur.fetchone()["offline"])
            cur.execute(
                """
                SELECT COUNT(*) AS pendentes
                FROM public.ordens_dispatch
                WHERE nivel_critico = 'CRITICO_PCD_CLIMA' AND status <> 'RESOLVIDO'
                """
            )
            pcd_pendente = int(cur.fetchone()["pendentes"]) > 0
            cur.execute("SELECT motor_ia_online FROM public.evento_estado WHERE id = 1")
            estado = cur.fetchone()
            motor_online = bool(estado["motor_ia_online"]) if estado else True
            return {
                "sensores_ativos": max(0, 7 - offline),
                "fontes_online_str": f"{max(0, 7 - offline)}/7",
                "cameras_neurais_ativas": 7,
                "lidar_fps": 60,
                "rota_livre_ok": not pcd_pendente,
                "motor_ia_online": motor_online,
            }

    def heatmap(self) -> Dict[str, object]:
        with self._cursor() as cur:
            cur.execute(
                """
                SELECT pessoas_presentes, ocupacao_estimada_pct, permanencia_media_seg,
                       densidade_maxima_m2, velocidade_media_ms, zonas_atracao, hotspots_criticos
                FROM public.snapshots_heatmap_readiness
                ORDER BY registrado_em DESC, id DESC
                LIMIT 1
                """
            )
            snap = cur.fetchone()
            cur.execute("SELECT status_operacional_evento FROM public.evento_estado WHERE id = 1")
            estado = cur.fetchone()
            estado_op = str(estado["status_operacional_evento"]) if estado else "ESTAVEL"
            if not snap:
                return {
                    "pessoas_presentes": 24,
                    "ocupacao_estimada_pct": 46,
                    "permanencia_media_seg": 318,
                    "densidade_maxima_m2": 0.78,
                    "velocidade_media_ms": 0.68,
                    "zonas_atracao": 3,
                    "hotspots_criticos": 0,
                    "pontos_criticos": 0,
                    "estado_operacional": estado_op,
                }
            hotspots = int(snap["hotspots_criticos"])
            return {
                "pessoas_presentes": int(snap["pessoas_presentes"]),
                "ocupacao_estimada_pct": int(snap["ocupacao_estimada_pct"]),
                "permanencia_media_seg": int(snap["permanencia_media_seg"]),
                "densidade_maxima_m2": _to_float(snap["densidade_maxima_m2"]),
                "velocidade_media_ms": _to_float(snap["velocidade_media_ms"]),
                "zonas_atracao": int(snap["zonas_atracao"]),
                "hotspots_criticos": hotspots,
                "pontos_criticos": hotspots,
                "estado_operacional": estado_op,
            }

    def acumulado(self) -> AcumuladoRecord:
        with self._cursor() as cur:
            cur.execute(
                """
                SELECT publico_por_dia, atendimentos_cortesia, engajamento_interacoes
                FROM public.acumulado_evento
                WHERE id = 1
                """
            )
            row = cur.fetchone()
            if not row:
                return AcumuladoRecord(
                    publico_por_dia={"D1": 240, "D2": 320, "D3": 400},
                    atendimentos_cortesia=720,
                    engajamento_interacoes=360,
                )
            por_dia = {str(k): int(v) for k, v in (row["publico_por_dia"] or {}).items()}
            return AcumuladoRecord(
                publico_por_dia=por_dia,
                atendimentos_cortesia=int(row["atendimentos_cortesia"]),
                engajamento_interacoes=int(row["engajamento_interacoes"]),
            )

    # ── Instagramáveis ───────────────────────────────────────────────────────
    def listar_instagramavel(self) -> List[InstagramavelRecord]:
        with self._cursor() as cur:
            cur.execute("SELECT * FROM public.ativacoes_instagramaveis ORDER BY id ASC")
            return [_row_para_instagramavel(r) for r in cur.fetchall()]

    def obter_instagramavel(self, id: str) -> Optional[InstagramavelRecord]:
        with self._cursor() as cur:
            cur.execute("SELECT * FROM public.ativacoes_instagramaveis WHERE id = %s", (id,))
            row = cur.fetchone()
            return _row_para_instagramavel(row) if row else None

    def captura_instagramavel(self, id: str) -> Optional[InstagramavelRecord]:
        with self._cursor(commit=True) as cur:
            cur.execute(
                """
                UPDATE public.ativacoes_instagramaveis
                SET capturas_totais = capturas_totais + 1,
                    compartilhamentos_sociais_estimados = compartilhamentos_sociais_estimados + 1,
                    alcance_estimado_redes = alcance_estimado_redes + 120,
                    status = CASE WHEN pessoas_na_fila > 12 THEN 'alta_procura' ELSE status END
                WHERE id = %s
                RETURNING *
                """,
                (id,),
            )
            row = cur.fetchone()
            return _row_para_instagramavel(row) if row else None

    def mudar_modo_luz_instagramavel(self, id: str, modo: str) -> Optional[InstagramavelRecord]:
        cores = {
            "Neon Pulsar": "#10b981",
            "Cyber Glow": "#ef4444",
            "Golden Hour": "#f59e0b",
            "Studio Spotlight": "#a855f7",
        }
        with self._cursor(commit=True) as cur:
            cur.execute(
                "SELECT iluminacao_cenica FROM public.ativacoes_instagramaveis WHERE id = %s FOR UPDATE",
                (id,),
            )
            row = cur.fetchone()
            if not row:
                return None
            luz_atual = dict(row.get("iluminacao_cenica") or {})
            nova_luz = {
                "modo": modo,
                "corPrincipal": cores.get(modo, luz_atual.get("corPrincipal", "#10b981")),
                "intensidadePct": int(luz_atual.get("intensidadePct", 90)),
            }
            cur.execute(
                """
                UPDATE public.ativacoes_instagramaveis
                SET iluminacao_cenica = %s
                WHERE id = %s
                RETURNING *
                """,
                (Json(nova_luz), id),
            )
            return _row_para_instagramavel(cur.fetchone())

    def toggle_status_instagramavel(self, id: str) -> Optional[InstagramavelRecord]:
        with self._cursor(commit=True) as cur:
            cur.execute(
                """
                UPDATE public.ativacoes_instagramaveis
                SET status = CASE WHEN status = 'pausado' THEN 'ativo' ELSE 'pausado' END
                WHERE id = %s
                RETURNING *
                """,
                (id,),
            )
            row = cur.fetchone()
            return _row_para_instagramavel(row) if row else None

    def criar_atracao(self, nome: str, setor: str, patrocinador: Optional[str] = None) -> InstagramavelRecord:
        with self._cursor(commit=True) as cur:
            cur.execute("SELECT COUNT(*) AS total FROM public.ativacoes_instagramaveis")
            total = int(cur.fetchone()["total"])
            timestamp_id = int(agora_utc().timestamp() * 1000)
            novo_id = f"inst-{timestamp_id}"
            codigo = f"INSTA-{total + 1}"
            posicao_3d = [float(total * 2 - 3), 0.0, float(-(total * 2 - 2))]
            hashtags = ["#Festival2026", f"#{nome.replace(' ', '')}"]
            luz = {"modo": "Neon Pulsar", "corPrincipal": "#ec4899", "intensidadePct": 90}

            cur.execute(
                """
                INSERT INTO public.ativacoes_instagramaveis (
                    id, codigo, nome, patrocinador, categoria_cenario, setor, status,
                    capturas_totais, compartilhamentos_sociais_estimados, alcance_estimado_redes,
                    tempo_permanencia_medio_segundos, avaliacao_media, nps_score,
                    pessoas_na_fila, tempo_espera_min, iluminacao_cenica, posicao_3d,
                    hashtags_principais, fotos_recentes
                )
                VALUES (
                    %s, %s, %s, %s, 'Instalação Visual Iluminada', %s, 'ativo',
                    0, 0, 0,
                    75, 5.0, 92,
                    0, 0.0, %s, %s,
                    %s::text[], '[]'::jsonb
                )
                RETURNING *
                """,
                (
                    novo_id,
                    codigo,
                    nome,
                    patrocinador or "Marca Parceira",
                    setor,
                    Json(luz),
                    Json(posicao_3d),
                    hashtags,
                ),
            )
            return _row_para_instagramavel(cur.fetchone())

    def simular_pico_fluxo(self) -> None:
        with self._cursor(commit=True) as cur:
            cur.execute(
                """
                UPDATE public.evento_estado
                SET status_operacional_evento = 'ACAO_EM_ANDAMENTO',
                    atualizado_em = now()
                WHERE id = 1
                """
            )
            cur.execute(
                """
                UPDATE public.ativacoes_instagramaveis
                SET capturas_totais = capturas_totais + 40,
                    compartilhamentos_sociais_estimados = compartilhamentos_sociais_estimados + 32,
                    alcance_estimado_redes = alcance_estimado_redes + 5400,
                    pessoas_na_fila = pessoas_na_fila + 5,
                    status = 'alta_procura'
                """
            )

    def calcular_sintese(self) -> Dict[str, object]:
        instas = self.listar_instagramavel()
        cameras = self.listar_cameras()

        capturas_instas = sum(i.capturasTotais for i in instas)
        alcance_redes = sum(i.alcanceEstimadoRedes for i in instas)
        acessos_cameras = 2320
        total_atendimentos = acessos_cameras + capturas_instas

        esperas_cameras: List[float] = []
        for cam in cameras:
            ultima = (
                self.ultima_leitura(cam.pdv_id_vinculado)
                if cam.pdv_id_vinculado is not None
                else cam.leitura_dedicada
            )
            if ultima is not None:
                esperas_cameras.append(ultima.tempo_espera_seg / 60.0)

        todas_esperas = esperas_cameras + [i.tempoEsperaMin for i in instas]
        tempo_espera_global = (sum(todas_esperas) / len(todas_esperas)) if todas_esperas else 0.0
        vazao = round(total_atendimentos / 300.0, 1)

        cameras_status: Dict[str, int] = {"operacional": 0, "atencao": 0, "critico": 0}
        for c in cameras:
            cameras_status[c.status] = cameras_status.get(c.status, 0) + 1

        instas_status: Dict[str, int] = {"ativo": 0, "alta_procura": 0, "limpeza": 0, "pausado": 0}
        for i in instas:
            instas_status[i.status] = instas_status.get(i.status, 0) + 1

        setor_map: Dict[str, int] = {}
        for i in instas:
            setor_map[i.setor] = setor_map.get(i.setor, 0) + i.capturasTotais
        for c in cameras:
            ultima = (
                self.ultima_leitura(c.pdv_id_vinculado)
                if c.pdv_id_vinculado is not None
                else c.leitura_dedicada
            )
            pax_cam = (ultima.pax_count * 12) if ultima else 120
            setor_map[c.setor] = setor_map.get(c.setor, 0) + pax_cam

        soma_volumes = sum(setor_map.values()) or 1
        fluxo_por_setor = [
            {
                "setor": setor,
                "volume": volume,
                "pct": round((volume / soma_volumes) * 100, 1),
            }
            for setor, volume in setor_map.items()
        ]

        fluxo_horario = [
            {"hora": "18h", "acessosCameras": 310, "instagramavel": 320},
            {"hora": "19h", "acessosCameras": 480, "instagramavel": 680},
            {"hora": "20h", "acessosCameras": 640, "instagramavel": 1100},
            {"hora": "21h", "acessosCameras": 510, "instagramavel": 950},
            {"hora": "22h", "acessosCameras": 380, "instagramavel": 810},
        ]

        alertas = [
            {
                "id": "al-1",
                "tipo": "urgente",
                "mensagem": "Concentração de 84 pessoas detectada pela câmera CAM-FLUXO-01 no Corredor de Acesso Norte (espera estimada de 16m 40s).",
                "hora": "22:45",
                "atracao": "Controlo de Acesso & Densidade Oeste (CAM-FLUXO-01)",
                "atracaoId": "cam-fluxo-01",
                "direcionamento": "Abrir 2 faixas extras de escoamento e redirecionar parte do fluxo pela Entrada Perímetro Leste (CAM-ENT-04).",
                "impactoEstimado": "Redução projetada de 40% na densidade do corredor em até 10 minutos.",
                "acaoRapidaLabel": "Abrir Faixas Extras & Redirecionar",
            },
            {
                "id": "al-2",
                "tipo": "urgente",
                "mensagem": "Fila de 18 pessoas no Túnel Neon Cyber Sound (Tempo de espera médio elevado para 9.5 min).",
                "hora": "22:38",
                "atracao": "Túnel Neon Cyber Sound",
                "atracaoId": "inst-01",
                "direcionamento": "Ativar modo de disparo fotográfico rápido (redução de pose de 85s para 50s) e sinalizar o Balanço Flutuante (Setor Sunset), que possui fila de apenas 5 min.",
                "impactoEstimado": "Redução estimada de 45% no tempo de espera da fila e alívio de gargalo na circulação da Arena.",
                "acaoRapidaLabel": "Ativar Modo Ágil & Rebalancear Fila",
            },
        ]

        return {
            "eventoNome": "Festival Som & Luz Arena 2026",
            "dataEvento": "19 de Outubro de 2026",
            "tempoDecorridoHoras": 4.8,
            "publicoTotalEstimadoVenue": 18500,
            "totalAtendimentosGerais": total_atendimentos,
            "camerasMonitoradasAtivas": len(cameras),
            "totalCapturasInstagramavel": capturas_instas,
            "alcanceTotalRedes": alcance_redes,
            "vazaoMediaAtendimentosPorMin": vazao,
            "tempoMedioEsperaGlobalMin": round(tempo_espera_global, 1),
            "satisfacaoGeralScore": 4.91,
            "camerasPorStatus": cameras_status,
            "instagramavelPorStatus": instas_status,
            "fluxoPorSetor": fluxo_por_setor,
            "fluxoHorario": fluxo_horario,
            "principaisAlertas": alertas,
        }

    # ── Câmeras de Hardware ──────────────────────────────────────────────────
    def listar_cameras(self) -> List[CameraHardwareRecord]:
        with self._cursor() as cur:
            cur.execute("SELECT * FROM public.cameras_hardware ORDER BY id ASC")
            rows = cur.fetchall()

        cameras: List[CameraHardwareRecord] = []
        for row in rows:
            zd = self.obter_zona(row["zona_dedicada_id"]) if row.get("zona_dedicada_id") else None
            ld = self.ultima_leitura(zd.id) if zd is not None else None
            cameras.append(_row_para_camera(row, zona_dedicada=zd, leitura_dedicada=ld))
        return cameras

    def obter_camera(self, camera_id: str) -> Optional[CameraHardwareRecord]:
        resolved_id = _CAMERA_ALIASES.get(camera_id, camera_id)
        with self._cursor() as cur:
            cur.execute("SELECT * FROM public.cameras_hardware WHERE id = %s", (resolved_id,))
            row = cur.fetchone()
        if not row:
            return None
        zd = self.obter_zona(row["zona_dedicada_id"]) if row.get("zona_dedicada_id") else None
        ld = self.ultima_leitura(zd.id) if zd is not None else None
        return _row_para_camera(row, zona_dedicada=zd, leitura_dedicada=ld)
