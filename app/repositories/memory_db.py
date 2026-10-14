"""
Repositório In-Memory Singleton unificado (Fase 1).

Simula, num único processo, o papel do PostgreSQL/TimescaleDB (histórico de leituras,
pedidos, despachos) e do Redis (estado instantâneo: status operacional, sensores, motor de IA).
Por ser o ÚNICO estado da aplicação, elimina o risco de split-brain entre serviços.

Todos os seeds seguem PROJECT_CONTEXT.md §4 (estande RAIZ S01–S10 + arena RaizEvento Partes 5/6).
Nenhum dado pessoal é armazenado: apenas contagens agregadas, POS e estoque.
"""
from __future__ import annotations

import math
import threading
from dataclasses import dataclass, replace
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Set


def agora_utc() -> datetime:
    return datetime.now(timezone.utc)


# ════════════════════════════════════════════════════════════════════════════
# Registros internos (nunca expostos diretamente: os routers mapeiam para contratos)
# ════════════════════════════════════════════════════════════════════════════
@dataclass
class ZonaRecord:
    id: int
    codigo_zona: str
    nome: str
    tipo: str  # "BAR" | "ESTANDE"
    area_m2: float
    capacidade: int
    tempo_servico_seg: float  # tempo efetivo por pessoa na fila (calibrado pelo seed)
    postos_atendimento: int
    reposicao_min: int
    indicadores: Dict[str, Optional[int]]


@dataclass
class LeituraRecord:
    id: int
    pdv_id: int
    timestamp: datetime
    pax_count: int
    tempo_espera_seg: int
    densidade_m2: float
    status_cor: str
    confianca_ia: float
    alerta_ruptura_estoque: bool
    anomalias: List[str]
    modo_leitura: str
    sensor_status: str
    transacoes_pos_ultimos_3m: int
    estoque_percentual: int


@dataclass
class InsumoRecord:
    item_id: str
    nome: str
    localizacao: str
    quantidade_atual: int
    quantidade_minima: int


@dataclass
class PedidoReabastecimentoRecord:
    protocolo_id: str
    item_id: str
    quantidade_solicitada: int
    prioridade: str
    status_pedido: str
    solicitado_em: datetime


@dataclass
class DispatchRecord:
    id: int
    pdv_id: int
    nivel_critico: str
    sugestao_acao: str
    status: str
    criado_em: datetime


@dataclass
class AcionamentoRecord:
    alerta_id: str
    acao_executada: str
    setor: str
    status_operacional_anterior: str
    registrado_em: datetime


@dataclass
class PredicaoRecord:
    alerta_id: str
    setor: str
    nivel_predito: str
    motivo: str
    acao_recomendada: str
    tempo_estimado_formacao_fila: str


@dataclass
class ReadinessBase:
    sensores_ativos: int
    fontes_total: int
    cameras_neurais_ativas: int
    sensores_iot_barris: int
    lidar_fps: int
    estoque_inicial_ok: bool


@dataclass
class HeatmapBase:
    pessoas_presentes: int
    ocupacao_estimada_pct: int
    permanencia_media_seg: int
    densidade_maxima_m2: float
    velocidade_media_ms: float
    zonas_atracao: int
    hotspots_criticos: int


@dataclass
class AcumuladoRecord:
    publico_por_dia: Dict[str, int]
    atendimentos_cortesia: int
    bebidas_unidades: int
    autosservico_retiradas: int
    engajamento_interacoes: int

    @property
    def publico_acumulado(self) -> int:
        return sum(self.publico_por_dia.values())


# ════════════════════════════════════════════════════════════════════════════
# SEEDS OBRIGATÓRIOS (PROJECT_CONTEXT.md §4)
# ════════════════════════════════════════════════════════════════════════════
def _seed_zonas() -> List[ZonaRecord]:
    return [
        ZonaRecord(
            id=1, codigo_zona="Z1", nome="Z1 | Balcão Principal de Drinks", tipo="BAR",
            area_m2=23.0, capacidade=40, tempo_servico_seg=38.0, postos_atendimento=1, reposicao_min=18,
            indicadores={"fila_pax": 6, "tempo_espera_seg": 228, "estoque_pct": 42, "reposicao_min": 18},
        ),
        ZonaRecord(
            id=2, codigo_zona="Z2", nome="Z2 | Autosserviço Lateral (Água e Café)", tipo="BAR",
            area_m2=12.0, capacidade=15, tempo_servico_seg=23.0, postos_atendimento=1, reposicao_min=10,
            indicadores={"fila_pax": 2, "tempo_espera_seg": 46, "retiradas": 48, "variacao_pct": 12},
        ),
        ZonaRecord(
            id=3, codigo_zona="Z3", nome="Z3 | Lounge e Mesas de Reunião", tipo="ESTANDE",
            area_m2=36.0, capacidade=24, tempo_servico_seg=0.0, postos_atendimento=1, reposicao_min=0,
            indicadores={"permanencia_media_seg": 204, "reunioes_ativas": 1},
        ),
        ZonaRecord(
            id=4, codigo_zona="Z5", nome="Z5 | Espaço Instagramável", tipo="ESTANDE",
            area_m2=16.0, capacidade=12, tempo_servico_seg=30.0, postos_atendimento=1, reposicao_min=0,
            indicadores={"interacoes": 14, "variacao_pct": 27, "tempo_espera_seg": 120},
        ),
        ZonaRecord(
            id=5, codigo_zona="BPN", nome="Bar Principal Norte", tipo="BAR",
            area_m2=120.0, capacidade=300, tempo_servico_seg=1000 / 84, postos_atendimento=4, reposicao_min=18,
            indicadores={"fila_pax": 84, "tempo_espera_seg": 1000},
        ),
    ]


# Perfil da última leitura de cada zona (valor exato do seed) usado para gerar o histórico.
# pax de Z1+Z2+Z3+Z5 = 24 = pessoas_presentes do heatmap S06.
_SEED_LEITURAS = {
    1: {"pax": 6, "tempo": 228, "tx": 4, "estoque": 42, "conf": 0.94},
    2: {"pax": 2, "tempo": 46, "tx": 6, "estoque": 85, "conf": 0.92},
    3: {"pax": 12, "tempo": 0, "tx": 0, "estoque": 100, "conf": 0.90},
    4: {"pax": 4, "tempo": 120, "tx": 0, "estoque": 100, "conf": 0.89},
    5: {"pax": 84, "tempo": 1000, "tx": 18, "estoque": 12, "conf": 0.93},  # Chopp IPA Barril #83 a 12%
}
HISTORICO_MINUTOS = 15


def _seed_insumos() -> List[InsumoRecord]:
    return [
        InsumoRecord("BAR-83-IPA", "Chopp IPA (Barril 50L)", "Bar Principal Norte", 6, 20),
        InsumoRecord("BAR-01-AGUA", "Água Mineral 500ml", "Principal", 4, 15),
        InsumoRecord("BAR-02-CAFE", "Café Expresso (Grãos kg)", "Autosserviço Lateral", 18, 10),
    ]


# ════════════════════════════════════════════════════════════════════════════
# Regras puras compartilhadas (mesmos limiares em TEMPO_REAL e contingências)
# ════════════════════════════════════════════════════════════════════════════
LIMIAR_VERDE_MAX_SEG = 300
LIMIAR_AMARELO_MAX_SEG = 720
LIMIAR_REDIRECIONAMENTO_SEG = 180
LIMIAR_FILA_RUPTURA_PAX = 6
LIMIAR_BARRIL_CRITICO_PCT = 12
LIMIAR_NFC_LENTO_SEG = 45


def classificar_status_cor(tempo_espera_seg: int) -> str:
    if tempo_espera_seg < LIMIAR_VERDE_MAX_SEG:
        return "VERDE"
    if tempo_espera_seg <= LIMIAR_AMARELO_MAX_SEG:
        return "AMARELO"
    return "VERMELHO"


def detectar_ruptura(tipo_zona: str, pax: int, transacoes_pos_3m: int, estoque_pct: int) -> bool:
    """Ruptura mascarada (pax >= 6 e 0 vendas no POS) só faz sentido em zonas BAR; barril <= 12% em qualquer zona."""
    mascarada = tipo_zona == "BAR" and pax >= LIMIAR_FILA_RUPTURA_PAX and transacoes_pos_3m == 0
    return mascarada or estoque_pct <= LIMIAR_BARRIL_CRITICO_PCT


def calcular_densidade(pax: int, area_m2: float) -> float:
    return 0.0 if area_m2 <= 0 else round(pax / area_m2, 2)


def status_insumo(atual: int, minima: int) -> str:
    if atual >= minima:
        return "ESTAVEL"
    if atual * 2 >= minima:
        return "ATENCAO"
    return "DEFICIT_CRITICO"


# ════════════════════════════════════════════════════════════════════════════
# Repositório
# ════════════════════════════════════════════════════════════════════════════
class MemoryDB:
    """Singleton thread-safe com todo o estado da aplicação."""

    TOTAL_ITENS_CATALOGO = 150  # catálogo completo monitorado (detalhe em memória apenas dos itens seedados)

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self.reset()

    # ── ciclo de vida ────────────────────────────────────────────────────────
    def reset(self) -> None:
        """Restaura o estado inicial (seeds). Usado no boot e pelos testes."""
        with self._lock:
            agora = agora_utc()
            self._zonas: Dict[int, ZonaRecord] = {z.id: z for z in _seed_zonas()}
            self._leituras: Dict[int, List[LeituraRecord]] = {z: [] for z in self._zonas}
            self._seq_leitura = 0
            self._insumos: Dict[str, InsumoRecord] = {i.item_id: i for i in _seed_insumos()}
            self._pedidos: List[PedidoReabastecimentoRecord] = []
            self._seq_protocolo = 42  # primeiro protocolo emitido = REAB-2026-0042
            self._dispatches: List[DispatchRecord] = []
            self._acionamentos: List[AcionamentoRecord] = []
            self._predicao = PredicaoRecord(
                alerta_id="PRED-9921",
                setor="Portão Principal / Entrada Norte",
                nivel_predito="CRITICO",
                motivo="Aumento repentino de fluxo detectado por IA",
                acao_recomendada="Acionar 2 filas adicionais",
                tempo_estimado_formacao_fila="03m 30s",
            )
            self._status_operacional = "ESTAVEL"
            self._motor_ia_online = True
            self._sensores_offline: Set[int] = set()
            self._readiness = ReadinessBase(
                sensores_ativos=5, fontes_total=6, cameras_neurais_ativas=12,
                sensores_iot_barris=54, lidar_fps=60, estoque_inicial_ok=True,
            )
            self._heatmap = HeatmapBase(
                pessoas_presentes=24, ocupacao_estimada_pct=46, permanencia_media_seg=318,
                densidade_maxima_m2=0.78, velocidade_media_ms=0.68, zonas_atracao=3, hotspots_criticos=0,
            )
            self._acumulado = AcumuladoRecord(
                publico_por_dia={"D1": 240, "D2": 320, "D3": 400},
                atendimentos_cortesia=720, bebidas_unidades=840,
                autosservico_retiradas=660, engajamento_interacoes=360,
            )
            self._seed_historico(agora)

    def _seed_historico(self, agora: datetime) -> None:
        """1 leitura/min nos últimos 15 min; a mais recente (há 15 s) é exatamente o valor do seed."""
        for pdv_id, base in _SEED_LEITURAS.items():
            zona = self._zonas[pdv_id]
            for i in range(HISTORICO_MINUTOS - 1, -1, -1):
                onda = 0.0 if i == 0 else 0.15 * math.sin(i * 0.6)
                pax = max(0, round(base["pax"] * (1 + onda)))
                tempo = max(0, round(base["tempo"] * (1 + onda)))
                tx = max(0, base["tx"] + (0 if i == 0 else round(2 * math.sin(i * 0.9))))
                self._append_leitura(
                    LeituraRecord(
                        id=0, pdv_id=pdv_id, timestamp=agora - timedelta(minutes=i, seconds=15),
                        pax_count=pax, tempo_espera_seg=tempo, densidade_m2=calcular_densidade(pax, zona.area_m2),
                        status_cor=classificar_status_cor(tempo), confianca_ia=base["conf"],
                        alerta_ruptura_estoque=detectar_ruptura(zona.tipo, pax, tx, base["estoque"]),
                        anomalias=[], modo_leitura="TEMPO_REAL", sensor_status="ONLINE",
                        transacoes_pos_ultimos_3m=tx, estoque_percentual=base["estoque"],
                    )
                )

    def _append_leitura(self, leitura: LeituraRecord) -> LeituraRecord:
        self._seq_leitura += 1
        registro = replace(leitura, id=self._seq_leitura)
        self._leituras[registro.pdv_id].append(registro)
        return registro

    # ── Zonas / leituras ─────────────────────────────────────────────────────
    def listar_zonas(self) -> List[ZonaRecord]:
        with self._lock:
            return list(self._zonas.values())

    def obter_zona(self, pdv_id: int) -> Optional[ZonaRecord]:
        with self._lock:
            return self._zonas.get(pdv_id)

    def ultima_leitura(self, pdv_id: int) -> Optional[LeituraRecord]:
        with self._lock:
            historico = self._leituras.get(pdv_id) or []
            return historico[-1] if historico else None

    def historico(self, pdv_id: int, janela: timedelta) -> List[LeituraRecord]:
        """Leituras do PDV dentro da janela, desconsiderando estimativas de contingência (evita retroalimentação)."""
        with self._lock:
            limite = agora_utc() - janela
            return [
                l for l in self._leituras.get(pdv_id, [])
                if l.timestamp >= limite and l.modo_leitura == "TEMPO_REAL"
            ]

    def registrar_leitura(self, leitura: LeituraRecord) -> LeituraRecord:
        with self._lock:
            registro = self._append_leitura(leitura)
            zona = self._zonas[registro.pdv_id]
            ind = zona.indicadores
            if "fila_pax" in ind:
                ind["fila_pax"] = registro.pax_count
            if "tempo_espera_seg" in ind:
                ind["tempo_espera_seg"] = registro.tempo_espera_seg
            if "estoque_pct" in ind:
                ind["estoque_pct"] = registro.estoque_percentual
            if registro.sensor_status == "OFFLINE":
                self._sensores_offline.add(registro.pdv_id)
            else:
                self._sensores_offline.discard(registro.pdv_id)
            return registro

    # ── Estado operacional / motor de IA ─────────────────────────────────────
    @property
    def status_operacional(self) -> str:
        return self._status_operacional

    def marcar_acao_em_andamento(self) -> str:
        """Transição ESTAVEL → ACAO_EM_ANDAMENTO. Retorna o status anterior."""
        with self._lock:
            anterior = self._status_operacional
            self._status_operacional = "ACAO_EM_ANDAMENTO"
            return anterior

    @property
    def motor_ia_online(self) -> bool:
        return self._motor_ia_online

    def definir_motor_ia_online(self, online: bool) -> None:
        with self._lock:
            self._motor_ia_online = online

    # ── Insumos ──────────────────────────────────────────────────────────────
    def listar_insumos(self) -> List[InsumoRecord]:
        with self._lock:
            return list(self._insumos.values())

    def obter_insumo(self, item_id: str) -> Optional[InsumoRecord]:
        with self._lock:
            return self._insumos.get(item_id)

    def registrar_reabastecimento(self, item_id: str, quantidade: int, prioridade: str) -> PedidoReabastecimentoRecord:
        with self._lock:
            pedido = PedidoReabastecimentoRecord(
                protocolo_id=f"REAB-2026-{self._seq_protocolo:04d}",
                item_id=item_id, quantidade_solicitada=quantidade, prioridade=prioridade,
                status_pedido="SOLICITADO", solicitado_em=agora_utc(),
            )
            self._seq_protocolo += 1
            self._pedidos.append(pedido)
            return pedido

    def listar_pedidos(self) -> List[PedidoReabastecimentoRecord]:
        with self._lock:
            return list(self._pedidos)

    # ── Predições / acionamentos ─────────────────────────────────────────────
    def obter_predicao(self) -> PredicaoRecord:
        return self._predicao

    def registrar_acionamento(self, alerta_id: str, acao: str, setor: str) -> AcionamentoRecord:
        with self._lock:
            anterior = self.marcar_acao_em_andamento()
            registro = AcionamentoRecord(alerta_id, acao, setor, anterior, agora_utc())
            self._acionamentos.append(registro)
            return registro

    # ── Despachos táticos ────────────────────────────────────────────────────
    def criar_dispatch(self, pdv_id: int, nivel_critico: str, sugestao_acao: str) -> DispatchRecord:
        with self._lock:
            registro = DispatchRecord(
                id=len(self._dispatches) + 1, pdv_id=pdv_id, nivel_critico=nivel_critico,
                sugestao_acao=sugestao_acao, status="EM_ANDAMENTO", criado_em=agora_utc(),
            )
            self._dispatches.append(registro)
            self.marcar_acao_em_andamento()
            return registro

    def listar_dispatches(self) -> List[DispatchRecord]:
        with self._lock:
            return list(self._dispatches)

    # ── Readiness / Heatmap / Acumulado ──────────────────────────────────────
    def readiness(self) -> Dict[str, object]:
        with self._lock:
            offline = len(self._sensores_offline)
            pcd_pendente = any(
                d.nivel_critico == "CRITICO_PCD_CLIMA" and d.status != "RESOLVIDO" for d in self._dispatches
            )
            return {
                "sensores_ativos": max(0, self._readiness.sensores_ativos - offline),
                "fontes_online_str": f"{max(0, self._readiness.fontes_total - offline)}/{self._readiness.fontes_total}",
                "cameras_neurais_ativas": self._readiness.cameras_neurais_ativas,
                "sensores_iot_barris": self._readiness.sensores_iot_barris,
                "lidar_fps": self._readiness.lidar_fps,
                "estoque_inicial_ok": self._readiness.estoque_inicial_ok,
                "rota_livre_ok": not pcd_pendente,
                "motor_ia_online": self._motor_ia_online,
            }

    def heatmap(self) -> Dict[str, object]:
        with self._lock:
            h = self._heatmap
            return {
                "pessoas_presentes": h.pessoas_presentes,
                "ocupacao_estimada_pct": h.ocupacao_estimada_pct,
                "permanencia_media_seg": h.permanencia_media_seg,
                "densidade_maxima_m2": h.densidade_maxima_m2,
                "velocidade_media_ms": h.velocidade_media_ms,
                "zonas_atracao": h.zonas_atracao,
                "hotspots_criticos": h.hotspots_criticos,
                "estado_operacional": self._status_operacional,
            }

    def acumulado(self) -> AcumuladoRecord:
        return self._acumulado


memory_db = MemoryDB()
