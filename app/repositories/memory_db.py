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


@dataclass
class ConsumoHoraRecord:
    hora: str
    transacoes: int
    receita: float


@dataclass
class AutosservicoRecord:
    id: str
    codigo: str
    nome: str
    tipoInsumo: str
    setor: str
    status: str
    capacidadeTotalInsumo: float
    nivelAtualInsumo: float
    unidadeMedida: str
    capacidadeCopos: int
    nivelCopos: int
    transacoesAcumuladas: int
    receitaTotal: float
    ticketMedio: float
    tempoMedioAtendimentoSegundos: int
    pessoasNaFila: int
    tempoEstimadoEsperaMin: float
    temperaturaC: Optional[float]
    pressaoPsi: Optional[float]
    posicao3D: List[float]
    ultimoAbastecimento: str
    consumoPorHora: List[ConsumoHoraRecord]


@dataclass
class IluminacaoCenicaRecord:
    modo: str
    corPrincipal: str
    intensidadePct: int


@dataclass
class FotoRecenteRecord:
    id: str
    timestamp: str
    autor: str
    likes: int


@dataclass
class InstagramavelRecord:
    id: str
    codigo: str
    nome: str
    patrocinador: str
    categoriaCenario: str
    setor: str
    status: str
    capturasTotais: int
    compartilhamentosSociaisEstimados: int
    alcanceEstimadoRedes: int
    tempoPermanenciaMedioSegundos: int
    avaliacaoMedia: float
    npsScore: int
    pessoasNaFila: int
    tempoEsperaMin: float
    iluminacaoCenica: IluminacaoCenicaRecord
    posicao3D: List[float]
    hashtagsPrincipais: List[str]
    fotosRecentes: List[FotoRecenteRecord]


@dataclass
class GuicheRecord:
    id: str
    codigo: str
    nome: str
    tipo: str
    atendente: str
    pessoasNaFila: int
    capacidadeFila: int
    tempoMedioAtendimentoSeg: int
    status: str
    atendimentosConcluidos: int


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


def _seed_autosservico() -> List[AutosservicoRecord]:
    return [
        AutosservicoRecord(
            id="aut-01", codigo="AUT-BEER-01", nome="Beer Wall Master 01",
            tipoInsumo="Chopp Artesanal IPA & Pilsen", setor="Arena Principal",
            status="operacional", capacidadeTotalInsumo=500.0, nivelAtualInsumo=385.0,
            unidadeMedida="L", capacidadeCopos=600, nivelCopos=490,
            transacoesAcumuladas=612, receitaTotal=18360.0, ticketMedio=30.0,
            tempoMedioAtendimentoSegundos=24, pessoasNaFila=4, tempoEstimadoEsperaMin=1.6,
            temperaturaC=2.1, pressaoPsi=14.2, posicao3D=[-6.0, 0.0, 4.0],
            ultimoAbastecimento="Há 45 min",
            consumoPorHora=[
                ConsumoHoraRecord("18h", 45, 1350.0), ConsumoHoraRecord("19h", 110, 3300.0),
                ConsumoHoraRecord("20h", 185, 5550.0), ConsumoHoraRecord("21h", 160, 4800.0),
                ConsumoHoraRecord("22h", 112, 3360.0),
            ],
        ),
        AutosservicoRecord(
            id="aut-02", codigo="AUT-DRINK-02", nome="Dispenser Cocktails & Gin 02",
            tipoInsumo="Gin Tônica & Drinks Prontos", setor="Palco Sunset",
            status="atencao", capacidadeTotalInsumo=300.0, nivelAtualInsumo=68.0,
            unidadeMedida="L", capacidadeCopos=400, nivelCopos=82,
            transacoesAcumuladas=480, receitaTotal=19200.0, ticketMedio=40.0,
            tempoMedioAtendimentoSegundos=31, pessoasNaFila=12, tempoEstimadoEsperaMin=6.2,
            temperaturaC=3.5, pressaoPsi=13.8, posicao3D=[5.0, 0.0, 6.0],
            ultimoAbastecimento="Há 2h 10 min",
            consumoPorHora=[
                ConsumoHoraRecord("18h", 30, 1200.0), ConsumoHoraRecord("19h", 95, 3800.0),
                ConsumoHoraRecord("20h", 140, 5600.0), ConsumoHoraRecord("21h", 125, 5000.0),
                ConsumoHoraRecord("22h", 90, 3600.0),
            ],
        ),
        AutosservicoRecord(
            id="aut-03", codigo="AUT-SNACK-03", nome="Totem Grab & Go Gastrô 03",
            tipoInsumo="Pizzas Artesanais & Burgers", setor="Vila Gastronômica",
            status="operacional", capacidadeTotalInsumo=350.0, nivelAtualInsumo=240.0,
            unidadeMedida="un", capacidadeCopos=350, nivelCopos=310,
            transacoesAcumuladas=340, receitaTotal=15300.0, ticketMedio=45.0,
            tempoMedioAtendimentoSegundos=45, pessoasNaFila=6, tempoEstimadoEsperaMin=4.5,
            temperaturaC=-1.0, pressaoPsi=0.0, posicao3D=[-7.0, 0.0, -4.0],
            ultimoAbastecimento="Há 1h 20 min",
            consumoPorHora=[
                ConsumoHoraRecord("18h", 25, 1125.0), ConsumoHoraRecord("19h", 75, 3375.0),
                ConsumoHoraRecord("20h", 120, 5400.0), ConsumoHoraRecord("21h", 70, 3150.0),
                ConsumoHoraRecord("22h", 50, 2250.0),
            ],
        ),
        AutosservicoRecord(
            id="aut-04", codigo="AUT-VIP-04", nome="Wine & Champagne Tap VIP",
            tipoInsumo="Vinhos Finos & Espumantes", setor="Camarote VIP",
            status="operacional", capacidadeTotalInsumo=200.0, nivelAtualInsumo=165.0,
            unidadeMedida="L", capacidadeCopos=300, nivelCopos=275,
            transacoesAcumuladas=235, receitaTotal=16450.0, ticketMedio=70.0,
            tempoMedioAtendimentoSegundos=20, pessoasNaFila=2, tempoEstimadoEsperaMin=0.7,
            temperaturaC=5.0, pressaoPsi=12.0, posicao3D=[6.0, 0.0, -5.0],
            ultimoAbastecimento="Há 30 min",
            consumoPorHora=[
                ConsumoHoraRecord("18h", 15, 1050.0), ConsumoHoraRecord("19h", 40, 2800.0),
                ConsumoHoraRecord("20h", 70, 4900.0), ConsumoHoraRecord("21h", 65, 4550.0),
                ConsumoHoraRecord("22h", 45, 3150.0),
            ],
        ),
    ]


def _seed_instagramavel() -> List[InstagramavelRecord]:
    return [
        InstagramavelRecord(
            id="inst-01", codigo="INSTA-NEON-01", nome="Túnel Neon Cyber Sound",
            patrocinador="Heineken 0.0", categoriaCenario="Túnel Imersivo de LED 360°",
            setor="Arena Principal", status="alta_procura", capturasTotais=1420,
            compartilhamentosSociaisEstimados=1180, alcanceEstimadoRedes=185000,
            tempoPermanenciaMedioSegundos=85, avaliacaoMedia=4.92, npsScore=94,
            pessoasNaFila=18, tempoEsperaMin=9.5,
            iluminacaoCenica=IluminacaoCenicaRecord(modo="Neon Pulsar", corPrincipal="#10b981", intensidadePct=92),
            posicao3D=[-2.0, 0.0, 7.0],
            hashtagsPrincipais=["#HeinekenLive", "#ArenaCyber", "#NoiteNeon"],
            fotosRecentes=[
                FotoRecenteRecord("f-1", "22:48", "@mariana.sound", 342),
                FotoRecenteRecord("f-2", "22:42", "@lucas_bass", 189),
                FotoRecenteRecord("f-3", "22:36", "@dj_anapaula", 512),
            ],
        ),
        InstagramavelRecord(
            id="inst-02", codigo="INSTA-SWING-02", nome="Balanço Flutuante nas Alturas",
            patrocinador="Red Bull Energy", categoriaCenario="Instalação Aérea com Fumaça Iluminada",
            setor="Palco Sunset", status="ativo", capturasTotais=980,
            compartilhamentosSociaisEstimados=810, alcanceEstimadoRedes=124000,
            tempoPermanenciaMedioSegundos=110, avaliacaoMedia=4.88, npsScore=89,
            pessoasNaFila=8, tempoEsperaMin=5.2,
            iluminacaoCenica=IluminacaoCenicaRecord(modo="Cyber Glow", corPrincipal="#ef4444", intensidadePct=88),
            posicao3D=[2.0, 0.0, 8.0],
            hashtagsPrincipais=["#TeDaAsas", "#SunsetVibe", "#RedBullFestival"],
            fotosRecentes=[
                FotoRecenteRecord("f-4", "22:49", "@felipetrip", 230),
                FotoRecenteRecord("f-5", "22:40", "@carol.vlog", 418),
            ],
        ),
        InstagramavelRecord(
            id="inst-03", codigo="INSTA-HOLO-03", nome="Cabine Holográfica Glitch 360°",
            patrocinador="Itaú Tech Labs", categoriaCenario="Vídeo Spinner Bullet-Time 4K",
            setor="Vila das Marcas", status="ativo", capturasTotais=820,
            compartilhamentosSociaisEstimados=750, alcanceEstimadoRedes=98000,
            tempoPermanenciaMedioSegundos=65, avaliacaoMedia=4.85, npsScore=86,
            pessoasNaFila=5, tempoEsperaMin=3.0,
            iluminacaoCenica=IluminacaoCenicaRecord(modo="Studio Spotlight", corPrincipal="#f59e0b", intensidadePct=95),
            posicao3D=[-3.0, 0.0, -7.0],
            hashtagsPrincipais=["#ItauNoFestival", "#BulletTime360", "#TechFestival"],
            fotosRecentes=[
                FotoRecenteRecord("f-6", "22:45", "@bruno.engineer", 175),
                FotoRecenteRecord("f-7", "22:31", "@gabi_lifestyle", 620),
            ],
        ),
        InstagramavelRecord(
            id="inst-04", codigo="INSTA-VIP-04", nome="Espelho Infinito & Led Waves",
            patrocinador="Spotify Sessions", categoriaCenario="Infinity Mirror Room Audio-Reativa",
            setor="Camarote VIP", status="ativo", capturasTotais=640,
            compartilhamentosSociaisEstimados=590, alcanceEstimadoRedes=112000,
            tempoPermanenciaMedioSegundos=90, avaliacaoMedia=4.96, npsScore=96,
            pessoasNaFila=4, tempoEsperaMin=2.5,
            iluminacaoCenica=IluminacaoCenicaRecord(modo="Golden Hour", corPrincipal="#a855f7", intensidadePct=85),
            posicao3D=[3.0, 0.0, -6.0],
            hashtagsPrincipais=["#SpotifyVIP", "#InfinityRoom", "#SoundsGood"],
            fotosRecentes=[
                FotoRecenteRecord("f-8", "22:47", "@vitor.soundtrack", 440),
                FotoRecenteRecord("f-9", "22:38", "@patricia_music", 810),
            ],
        ),
    ]


def _seed_guiches() -> List[GuicheRecord]:
    return [
        GuicheRecord("g1", "G-01", "Atendimento & Recepção Geral", "Informações & Cadastro RAIZ", "Mariana Costa", 4, 8, 170, "NORMAL", 42),
        GuicheRecord("g2", "G-02", "Degustação & Experiência", "Bar & Harmonização", "Felipe Alencar", 7, 8, 250, "PRESSAO", 58),
        GuicheRecord("g3", "G-03", "Retirada Express & Welcome Kit", "Entrega Rápida de Brindes", "Lucas Peixoto", 2, 6, 90, "NORMAL", 64),
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
            self._autos: Dict[str, AutosservicoRecord] = {a.id: a for a in _seed_autosservico()}
            self._instas: Dict[str, InstagramavelRecord] = {i.id: i for i in _seed_instagramavel()}
            self._guiches: Dict[str, GuicheRecord] = {g.id: g for g in _seed_guiches()}
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

    # ── Autosserviço / Atrações ───────────────────────────────────────────────
    def listar_autosservico(self) -> List[AutosservicoRecord]:
        with self._lock:
            return list(self._autos.values())

    def obter_autosservico(self, id: str) -> Optional[AutosservicoRecord]:
        with self._lock:
            return self._autos.get(id)

    def transacao_autosservico(self, id: str, valor: float = 30.0) -> Optional[AutosservicoRecord]:
        with self._lock:
            item = self._autos.get(id)
            if not item:
                return None
            novo_nivel = max(0.0, round(item.nivelAtualInsumo - 0.5, 1))
            novo_copos = max(0, item.nivelCopos - 1)
            novas_transacoes = item.transacoesAcumuladas + 1
            nova_receita = item.receitaTotal + valor
            if novo_nivel <= 20:
                novo_status = "critico"
            elif novo_nivel <= 70:
                novo_status = "atencao"
            elif item.status == "manutencao":
                novo_status = "manutencao"
            else:
                novo_status = "operacional"

            atualizado = replace(
                item,
                nivelAtualInsumo=novo_nivel,
                nivelCopos=novo_copos,
                transacoesAcumuladas=novas_transacoes,
                receitaTotal=nova_receita,
                status=novo_status,
            )
            self._autos[id] = atualizado
            return atualizado

    def reabastecer_autosservico(self, id: str) -> Optional[AutosservicoRecord]:
        with self._lock:
            item = self._autos.get(id)
            if not item:
                return None
            atualizado = replace(
                item,
                nivelAtualInsumo=item.capacidadeTotalInsumo,
                nivelCopos=item.capacidadeCopos,
                status="operacional",
                pessoasNaFila=max(1, item.pessoasNaFila // 2),
                ultimoAbastecimento="Agora mesmo",
            )
            self._autos[id] = atualizado
            if "BAR-83-IPA" in self._insumos and "Beer" in item.nome:
                self.registrar_reabastecimento("BAR-83-IPA", 14, "ALTA")
            return atualizado

    def toggle_manutencao_autosservico(self, id: str) -> Optional[AutosservicoRecord]:
        with self._lock:
            item = self._autos.get(id)
            if not item:
                return None
            novo_status = "operacional" if item.status == "manutencao" else "manutencao"
            atualizado = replace(item, status=novo_status)
            self._autos[id] = atualizado
            return atualizado

    # ── Instagramáveis ───────────────────────────────────────────────────────
    def listar_instagramavel(self) -> List[InstagramavelRecord]:
        with self._lock:
            return list(self._instas.values())

    def obter_instagramavel(self, id: str) -> Optional[InstagramavelRecord]:
        with self._lock:
            return self._instas.get(id)

    def captura_instagramavel(self, id: str) -> Optional[InstagramavelRecord]:
        with self._lock:
            item = self._instas.get(id)
            if not item:
                return None
            novas_capturas = item.capturasTotais + 1
            novos_shares = item.compartilhamentosSociaisEstimados + 1
            novo_alcance = item.alcanceEstimadoRedes + 120
            novo_status = "alta_procura" if item.pessoasNaFila > 12 else item.status
            atualizado = replace(
                item,
                capturasTotais=novas_capturas,
                compartilhamentosSociaisEstimados=novos_shares,
                alcanceEstimadoRedes=novo_alcance,
                status=novo_status,
            )
            self._instas[id] = atualizado
            return atualizado

    def mudar_modo_luz_instagramavel(self, id: str, modo: str) -> Optional[InstagramavelRecord]:
        with self._lock:
            item = self._instas.get(id)
            if not item:
                return None
            cores = {
                "Neon Pulsar": "#10b981",
                "Cyber Glow": "#ef4444",
                "Golden Hour": "#f59e0b",
                "Studio Spotlight": "#a855f7",
            }
            nova_luz = IluminacaoCenicaRecord(
                modo=modo,
                corPrincipal=cores.get(modo, item.iluminacaoCenica.corPrincipal),
                intensidadePct=item.iluminacaoCenica.intensidadePct,
            )
            atualizado = replace(item, iluminacaoCenica=nova_luz)
            self._instas[id] = atualizado
            return atualizado

    def toggle_status_instagramavel(self, id: str) -> Optional[InstagramavelRecord]:
        with self._lock:
            item = self._instas.get(id)
            if not item:
                return None
            novo_status = "ativo" if item.status == "pausado" else "pausado"
            atualizado = replace(item, status=novo_status)
            self._instas[id] = atualizado
            return atualizado

    # ── Criar Atração e Simulação de Pico ───────────────────────────────────
    def criar_atracao(self, tipo: str, nome: str, setor: str, insumo_ou_patrocinador: Optional[str] = None) -> object:
        with self._lock:
            timestamp_id = int(agora_utc().timestamp() * 1000)
            if tipo == "autosservico":
                novo_auto = AutosservicoRecord(
                    id=f"aut-{timestamp_id}",
                    codigo=f"AUT-{len(self._autos) + 1}",
                    nome=nome,
                    tipoInsumo=insumo_ou_patrocinador or "Chopp Artesanal",
                    setor=setor,
                    status="operacional",
                    capacidadeTotalInsumo=300.0,
                    nivelAtualInsumo=300.0,
                    unidadeMedida="L",
                    capacidadeCopos=400,
                    nivelCopos=400,
                    transacoesAcumuladas=0,
                    receitaTotal=0.0,
                    ticketMedio=35.0,
                    tempoMedioAtendimentoSegundos=25,
                    pessoasNaFila=1,
                    tempoEstimadoEsperaMin=0.5,
                    temperaturaC=2.5,
                    pressaoPsi=13.5,
                    posicao3D=[float(len(self._autos) * 2 - 4), 0.0, float(len(self._autos) * 2 - 3)],
                    ultimoAbastecimento="Agora",
                    consumoPorHora=[
                        ConsumoHoraRecord("20h", 0, 0.0),
                        ConsumoHoraRecord("21h", 0, 0.0),
                        ConsumoHoraRecord("22h", 0, 0.0),
                    ],
                )
                self._autos[novo_auto.id] = novo_auto
                return novo_auto
            else:
                novo_insta = InstagramavelRecord(
                    id=f"inst-{timestamp_id}",
                    codigo=f"INSTA-{len(self._instas) + 1}",
                    nome=nome,
                    patrocinador=insumo_ou_patrocinador or "Marca Parceira",
                    categoriaCenario="Instalação Visual Iluminada",
                    setor=setor,
                    status="ativo",
                    capturasTotais=0,
                    compartilhamentosSociaisEstimados=0,
                    alcanceEstimadoRedes=0,
                    tempoPermanenciaMedioSegundos=75,
                    avaliacaoMedia=5.0,
                    npsScore=92,
                    pessoasNaFila=0,
                    tempoEsperaMin=0.0,
                    iluminacaoCenica=IluminacaoCenicaRecord(modo="Neon Pulsar", corPrincipal="#ec4899", intensidadePct=90),
                    posicao3D=[float(len(self._instas) * 2 - 3), 0.0, float(-(len(self._instas) * 2 - 2))],
                    hashtagsPrincipais=["#Festival2026", f"#{nome.replace(' ', '')}"],
                    fotosRecentes=[],
                )
                self._instas[novo_insta.id] = novo_insta
                return novo_insta

    def simular_pico_fluxo(self) -> None:
        with self._lock:
            self.marcar_acao_em_andamento()
            for id, a in list(self._autos.items()):
                self._autos[id] = replace(
                    a,
                    transacoesAcumuladas=a.transacoesAcumuladas + 25,
                    receitaTotal=a.receitaTotal + (25 * a.ticketMedio),
                    nivelAtualInsumo=max(10.0, a.nivelAtualInsumo - 12.0),
                    pessoasNaFila=a.pessoasNaFila + 4,
                )
            for id, i in list(self._instas.items()):
                self._instas[id] = replace(
                    i,
                    capturasTotais=i.capturasTotais + 40,
                    compartilhamentosSociaisEstimados=i.compartilhamentosSociaisEstimados + 32,
                    alcanceEstimadoRedes=i.alcanceEstimadoRedes + 5400,
                    pessoasNaFila=i.pessoasNaFila + 5,
                    status="alta_procura",
                )

    def calcular_sintese(self) -> Dict[str, object]:
        with self._lock:
            autos = list(self._autos.values())
            instas = list(self._instas.values())
            receita_total_autos = sum(a.receitaTotal for a in autos)
            transacoes_autos = sum(a.transacoesAcumuladas for a in autos)
            capturas_instas = sum(i.capturasTotais for i in instas)
            alcance_redes = sum(i.alcanceEstimadoRedes for i in instas)
            total_atendimentos = transacoes_autos + capturas_instas
            ticket_medio = receita_total_autos / transacoes_autos if transacoes_autos > 0 else 0.0

            todas_esperas = [a.tempoEstimadoEsperaMin for a in autos] + [i.tempoEsperaMin for i in instas]
            tempo_espera_global = (sum(todas_esperas) / len(todas_esperas)) if todas_esperas else 0.0
            vazao = round(total_atendimentos / 300.0, 1)

            autos_status: Dict[str, int] = {"operacional": 0, "atencao": 0, "critico": 0, "manutencao": 0}
            for a in autos:
                autos_status[a.status] = autos_status.get(a.status, 0) + 1

            instas_status: Dict[str, int] = {"ativo": 0, "alta_procura": 0, "limpeza": 0, "pausado": 0}
            for i in instas:
                instas_status[i.status] = instas_status.get(i.status, 0) + 1

            setor_map: Dict[str, Dict[str, float]] = {}
            for a in autos:
                if a.setor not in setor_map:
                    setor_map[a.setor] = {"receita": 0.0, "volume": 0}
                setor_map[a.setor]["receita"] += a.receitaTotal
                setor_map[a.setor]["volume"] += a.transacoesAcumuladas
            for i in instas:
                if i.setor not in setor_map:
                    setor_map[i.setor] = {"receita": 0.0, "volume": 0}
                setor_map[i.setor]["volume"] += i.capturasTotais

            faturamento_setor = [
                {
                    "setor": setor,
                    "receita": data["receita"],
                    "volume": int(data["volume"]),
                    "pct": round((data["receita"] / receita_total_autos * 100), 1) if receita_total_autos > 0 else 0.0,
                }
                for setor, data in setor_map.items()
            ]

            fluxo_horario = [
                {"hora": "18h", "autosservico": 115, "instagramavel": 320, "receita": 4725.0},
                {"hora": "19h", "autosservico": 320, "instagramavel": 680, "receita": 16275.0},
                {"hora": "20h", "autosservico": 515, "instagramavel": 1100, "receita": 26450.0},
                {"hora": "21h", "autosservico": 420, "instagramavel": 950, "receita": 17500.0},
                {"hora": "22h", "autosservico": 297, "instagramavel": 810, "receita": 12360.0},
            ]

            alertas = [
                {
                    "id": "al-1",
                    "tipo": "aviso",
                    "mensagem": "Nível de Chopp Gin Tônica em 22% (68L restantes) no Totem AUT-DRINK-02 (Palco Sunset).",
                    "hora": "22:45",
                    "atracao": "Dispenser Cocktails & Gin 02",
                    "atracaoId": "aut-02",
                    "direcionamento": "Despachar equipe de reabastecimento móvel com 2 barris de 50L e 1 lote de 200 copos para o Palco Sunset nos próximos 15 minutos.",
                    "impactoEstimado": "Evita perda projetada de R$ 3.800 em vendas e ruptura antes do show das 23h15.",
                    "acaoRapidaLabel": "Despachar Reposição Móvel",
                },
                {
                    "id": "al-2",
                    "tipo": "urgente",
                    "mensagem": "Fila de 18 pessoas no Túnel Neon Cyber Sound (Tempo de espera médio elevado para 9.5 min).",
                    "hora": "22:38",
                    "atracao": "Túnel Neon Cyber Sound",
                    "atracaoId": "inst-01",
                    "direcionamento": "Ativar modo de disparo fotográfico rápido (redução de pose de 85s para 50s) e sinalizar via totem o Balanço Flutuante (Setor Sunset), que possui fila de apenas 5 min.",
                    "impactoEstimado": "Redução estimada de 45% no tempo de espera da fila e alívio de gargalo na circulação da Arena.",
                    "acaoRapidaLabel": "Ativar Modo Ágil & Rebalancear Fila",
                },
                {
                    "id": "al-3",
                    "tipo": "info",
                    "mensagem": "Meta horária de receita superada na Arena Principal (+18% sobre a projeção do dia).",
                    "hora": "22:15",
                    "atracao": "Arena Principal",
                    "atracaoId": "aut-01",
                    "direcionamento": "Oportunidade comercial: disparar notificação promocional push no app do evento oferecendo combo \"Chopp + Pizza Artesanal\" na Vila Gastronômica para dispersar o fluxo.",
                    "impactoEstimado": "Potencial de incremento de +R$ 4.500 no ticket médio de alimentação do setor gastronômico.",
                    "acaoRapidaLabel": "Ativar Promoção Cruzada Gastrô",
                },
            ]

            return {
                "eventoNome": "Festival Som & Luz Arena 2026",
                "dataEvento": "19 de Outubro de 2026",
                "tempoDecorridoHoras": 4.8,
                "publicoTotalEstimadoVenue": 18500,
                "totalAtendimentosGerais": total_atendimentos,
                "receitaTotalAutosservico": round(receita_total_autos, 2),
                "totalCapturasInstagramavel": capturas_instas,
                "alcanceTotalRedes": alcance_redes,
                "ticketMedioGeral": round(ticket_medio, 2),
                "vazaoMediaAtendimentosPorMin": vazao,
                "tempoMedioEsperaGlobalMin": round(tempo_espera_global, 1),
                "satisfacaoGeralScore": 4.91,
                "autosservicoPorStatus": autos_status,
                "instagramavelPorStatus": instas_status,
                "faturamentoPorSetor": faturamento_setor,
                "fluxoHorario": fluxo_horario,
                "principaisAlertas": alertas,
            }

    # ── Guichês ──────────────────────────────────────────────────────────────
    def listar_guiches(self) -> List[GuicheRecord]:
        with self._lock:
            return list(self._guiches.values())

    def atualizar_fila_guiche(self, id: str, delta: int) -> Optional[GuicheRecord]:
        with self._lock:
            g = self._guiches.get(id)
            if not g:
                return None
            nova_fila = max(0, g.pessoasNaFila + delta)
            ocupacao = nova_fila / g.capacidadeFila if g.capacidadeFila > 0 else 0.0
            novo_status = "CRITICO" if ocupacao >= 0.85 else "PRESSAO" if ocupacao >= 0.6 else "NORMAL"
            atualizado = replace(g, pessoasNaFila=nova_fila, status=novo_status)
            self._guiches[id] = atualizado
            return atualizado


memory_db = MemoryDB()
