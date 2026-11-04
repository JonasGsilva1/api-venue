"""
Repositório In-Memory Singleton unificado (Fase 1).

Simula, num único processo, o papel do PostgreSQL/TimescaleDB (histórico de leituras,
despachos, acionamentos) e do Redis (estado instantâneo: status operacional, câmeras, motor de IA).
Por ser o ÚNICO estado da aplicação, elimina o risco de split-brain entre serviços.

Todos os seeds seguem PROJECT_CONTEXT.md §4 (monitoramento de gargalos por câmeras + ativações).
Nenhum dado pessoal é armazenado: apenas contagens agregadas de público e fluxo.
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
    tipo: str  # "CATRACA" | "CIRCULACAO" | "ESTANDE"
    area_m2: float
    capacidade: int
    tempo_servico_seg: float  # tempo efetivo por pessoa na fila (calibrado pelo seed)
    postos_atendimento: int
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
    anomalias: List[str]
    modo_leitura: str
    sensor_status: str
    transacoes_pos_ultimos_3m: int


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
    lidar_fps: int


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
    engajamento_interacoes: int

    @property
    def publico_acumulado(self) -> int:
        return sum(self.publico_por_dia.values())


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
class CameraHardwareRecord:
    id: str
    codigo: str
    nome: str
    tipo: str  # "entrada_perimetro" | "fluxo_interno"
    setor: str
    posicao: List[float]
    alvo: List[float]
    status: str  # "operacional" | "atencao" | "critico"
    fps: int
    rotulo_metrica: str
    valor_metrica: str
    detalhe_metrica: Optional[str]
    pdv_id_vinculado: Optional[int]
    zona_dedicada: Optional[ZonaRecord] = None
    leitura_dedicada: Optional[LeituraRecord] = None


# ════════════════════════════════════════════════════════════════════════════
# SEEDS OBRIGATÓRIOS (PROJECT_CONTEXT.md §4)
# ════════════════════════════════════════════════════════════════════════════
def _seed_zonas() -> List[ZonaRecord]:
    return [
        ZonaRecord(
            id=1, codigo_zona="Z1", nome="Z1 | Acesso Estande Principal", tipo="CATRACA",
            area_m2=23.0, capacidade=40, tempo_servico_seg=38.0, postos_atendimento=1,
            indicadores={"fila_pax": 6, "tempo_espera_seg": 228},
        ),
        ZonaRecord(
            id=2, codigo_zona="Z2", nome="Z2 | Passarela Lateral Leste", tipo="CATRACA",
            area_m2=12.0, capacidade=15, tempo_servico_seg=23.0, postos_atendimento=1,
            indicadores={"fila_pax": 2, "tempo_espera_seg": 46, "variacao_pct": 12},
        ),
        ZonaRecord(
            id=3, codigo_zona="Z3", nome="Z3 | Lounge e Mesas de Reunião", tipo="ESTANDE",
            area_m2=36.0, capacidade=24, tempo_servico_seg=0.0, postos_atendimento=1,
            indicadores={"permanencia_media_seg": 204, "reunioes_ativas": 1},
        ),
        ZonaRecord(
            id=4, codigo_zona="Z5", nome="Z5 | Espaço Instagramável", tipo="ESTANDE",
            area_m2=16.0, capacidade=12, tempo_servico_seg=30.0, postos_atendimento=1,
            indicadores={"interacoes": 14, "variacao_pct": 27, "tempo_espera_seg": 120},
        ),
        ZonaRecord(
            id=5, codigo_zona="ACN", nome="Corredor de Acesso Norte", tipo="CATRACA",
            area_m2=120.0, capacidade=300, tempo_servico_seg=1000 / 84, postos_atendimento=4,
            indicadores={"fila_pax": 84, "tempo_espera_seg": 1000},
        ),
    ]


# Perfil da última leitura de cada zona (valor exato do seed) usado para gerar o histórico.
# pax de Z1+Z2+Z3+Z5 = 24 = pessoas_presentes do heatmap S06.
_SEED_LEITURAS = {
    1: {"pax": 6, "tempo": 228, "tx": 4, "conf": 0.94},
    2: {"pax": 2, "tempo": 46, "tx": 6, "conf": 0.92},
    3: {"pax": 12, "tempo": 0, "tx": 0, "conf": 0.90},
    4: {"pax": 4, "tempo": 120, "tx": 0, "conf": 0.89},
    5: {"pax": 84, "tempo": 1000, "tx": 18, "conf": 0.93},
}
HISTORICO_MINUTOS = 15


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


def _seed_cameras(agora: datetime) -> List[CameraHardwareRecord]:
    return [
        CameraHardwareRecord(
            id="cam-ent-01",
            codigo="CAM-ENT-01",
            nome="Entrada Portão A (Perímetro Norte)",
            tipo="entrada_perimetro",
            setor="Acesso / Perímetro Norte",
            posicao=[-4.0, 4.2, 12.0],
            alvo=[-4.0, 0.0, 12.0],
            status="operacional",
            fps=30,
            rotulo_metrica="Fluxo Acesso",
            valor_metrica="380 pess/h",
            detalhe_metrica="Tempo fila: 1.5 min",
            pdv_id_vinculado=None,
            zona_dedicada=ZonaRecord(
                id=101,
                codigo_zona="ENT-A",
                nome="ENT-A | Portão A (Perímetro Norte)",
                tipo="CATRACA",
                area_m2=45.0,
                capacidade=80,
                tempo_servico_seg=5.0,
                postos_atendimento=4,
                indicadores={"fila_pax": 18, "tempo_espera_seg": 90},
            ),
            leitura_dedicada=LeituraRecord(
                id=1001,
                pdv_id=101,
                timestamp=agora,
                pax_count=18,
                tempo_espera_seg=90,
                densidade_m2=0.40,
                status_cor="VERDE",
                confianca_ia=0.95,
                anomalias=[],
                modo_leitura="TEMPO_REAL",
                sensor_status="ONLINE",
                transacoes_pos_ultimos_3m=19,
            ),
        ),
        CameraHardwareRecord(
            id="cam-ent-02",
            codigo="CAM-ENT-02",
            nome="Entrada Catracas VIP",
            tipo="entrada_perimetro",
            setor="Acesso / VIP",
            posicao=[-1.0, 4.2, 12.0],
            alvo=[-1.0, 0.0, 12.0],
            status="operacional",
            fps=30,
            rotulo_metrica="Fluxo VIP",
            valor_metrica="120 pess/h",
            detalhe_metrica="Tempo fila: 0.5 min",
            pdv_id_vinculado=None,
            zona_dedicada=ZonaRecord(
                id=102,
                codigo_zona="ENT-VIP",
                nome="ENT-VIP | Catracas VIP",
                tipo="CATRACA",
                area_m2=30.0,
                capacidade=40,
                tempo_servico_seg=5.0,
                postos_atendimento=2,
                indicadores={"fila_pax": 6, "tempo_espera_seg": 30},
            ),
            leitura_dedicada=LeituraRecord(
                id=1002,
                pdv_id=102,
                timestamp=agora,
                pax_count=6,
                tempo_espera_seg=30,
                densidade_m2=0.20,
                status_cor="VERDE",
                confianca_ia=0.97,
                anomalias=[],
                modo_leitura="TEMPO_REAL",
                sensor_status="ONLINE",
                transacoes_pos_ultimos_3m=6,
            ),
        ),
        CameraHardwareRecord(
            id="cam-ent-03",
            codigo="CAM-ENT-03",
            nome="Entrada Pista Principal",
            tipo="entrada_perimetro",
            setor="Acesso / Geral",
            posicao=[1.0, 4.2, 12.0],
            alvo=[1.0, 0.0, 12.0],
            status="operacional",
            fps=30,
            rotulo_metrica="Fluxo Geral",
            valor_metrica="490 pess/h",
            detalhe_metrica="Tempo fila: 2.8 min",
            pdv_id_vinculado=None,
            zona_dedicada=ZonaRecord(
                id=103,
                codigo_zona="ENT-GERAL",
                nome="ENT-GERAL | Pista Principal",
                tipo="CATRACA",
                area_m2=60.0,
                capacidade=120,
                tempo_servico_seg=5.0,
                postos_atendimento=6,
                indicadores={"fila_pax": 34, "tempo_espera_seg": 168},
            ),
            leitura_dedicada=LeituraRecord(
                id=1003,
                pdv_id=103,
                timestamp=agora,
                pax_count=34,
                tempo_espera_seg=168,
                densidade_m2=0.57,
                status_cor="VERDE",
                confianca_ia=0.93,
                anomalias=[],
                modo_leitura="TEMPO_REAL",
                sensor_status="ONLINE",
                transacoes_pos_ultimos_3m=25,
            ),
        ),
        CameraHardwareRecord(
            id="cam-ent-04",
            codigo="CAM-ENT-04",
            nome="Entrada Perímetro Leste",
            tipo="entrada_perimetro",
            setor="Acesso / Leste",
            posicao=[4.0, 4.2, 12.0],
            alvo=[4.0, 0.0, 12.0],
            status="operacional",
            fps=30,
            rotulo_metrica="Fluxo Leste",
            valor_metrica="210 pess/h",
            detalhe_metrica="Tempo fila: 1.1 min",
            pdv_id_vinculado=None,
            zona_dedicada=ZonaRecord(
                id=104,
                codigo_zona="ENT-LESTE",
                nome="ENT-LESTE | Perímetro Leste",
                tipo="CATRACA",
                area_m2=40.0,
                capacidade=60,
                tempo_servico_seg=6.0,
                postos_atendimento=3,
                indicadores={"fila_pax": 11, "tempo_espera_seg": 66},
            ),
            leitura_dedicada=LeituraRecord(
                id=1004,
                pdv_id=104,
                timestamp=agora,
                pax_count=11,
                tempo_espera_seg=66,
                densidade_m2=0.28,
                status_cor="VERDE",
                confianca_ia=0.94,
                anomalias=[],
                modo_leitura="TEMPO_REAL",
                sensor_status="ONLINE",
                transacoes_pos_ultimos_3m=11,
            ),
        ),
        CameraHardwareRecord(
            id="cam-fluxo-01",
            codigo="CAM-FLUXO-01",
            nome="Controlo de Acesso & Densidade Oeste",
            tipo="fluxo_interno",
            setor="Circulação / Setor Oeste",
            posicao=[-5.0, 4.8, 2.0],
            alvo=[-5.0, 0.8, 2.0],
            status="critico",
            fps=60,
            rotulo_metrica="Pessoas / Densidade",
            valor_metrica="142 pessoas / 0.8 p/m²",
            detalhe_metrica="Taxa de passagem: 45 pessoas/min",
            pdv_id_vinculado=5,
        ),
        CameraHardwareRecord(
            id="cam-fluxo-02",
            codigo="CAM-FLUXO-02",
            nome="Controlo de Acesso & Densidade Central",
            tipo="fluxo_interno",
            setor="Circulação / Eixo Central",
            posicao=[0.0, 5.0, -2.0],
            alvo=[0.0, 1.0, -2.0],
            status="atencao",
            fps=60,
            rotulo_metrica="Pessoas / Densidade",
            valor_metrica="218 pessoas / 1.4 p/m²",
            detalhe_metrica="Taxa de passagem: 68 pessoas/min",
            pdv_id_vinculado=1,
        ),
        CameraHardwareRecord(
            id="cam-fluxo-03",
            codigo="CAM-FLUXO-03",
            nome="Controlo de Acesso & Densidade Leste",
            tipo="fluxo_interno",
            setor="Circulação / Setor Leste",
            posicao=[5.0, 4.8, 2.0],
            alvo=[5.0, 0.8, 2.0],
            status="critico",
            fps=60,
            rotulo_metrica="Pessoas / Densidade",
            valor_metrica="326 pessoas / 2.1 p/m²",
            detalhe_metrica="Taxa de passagem: 91 pessoas/min",
            pdv_id_vinculado=2,
        ),
    ]


# ════════════════════════════════════════════════════════════════════════════
# Regras puras compartilhadas (mesmos limiares em TEMPO_REAL e contingências)
# ════════════════════════════════════════════════════════════════════════════
LIMIAR_VERDE_MAX_SEG = 300
LIMIAR_AMARELO_MAX_SEG = 720
LIMIAR_REDIRECIONAMENTO_SEG = 180
LIMIAR_NFC_LENTO_SEG = 45


def classificar_status_cor(tempo_espera_seg: int) -> str:
    if tempo_espera_seg < LIMIAR_VERDE_MAX_SEG:
        return "VERDE"
    if tempo_espera_seg <= LIMIAR_AMARELO_MAX_SEG:
        return "AMARELO"
    return "VERMELHO"


def calcular_densidade(pax: int, area_m2: float) -> float:
    return 0.0 if area_m2 <= 0 else round(pax / area_m2, 2)


# ════════════════════════════════════════════════════════════════════════════
# Repositório
# ════════════════════════════════════════════════════════════════════════════
class MemoryDB:
    """Singleton thread-safe com todo o estado da aplicação."""

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
                sensores_ativos=7, fontes_total=7, cameras_neurais_ativas=7, lidar_fps=60,
            )
            self._heatmap = HeatmapBase(
                pessoas_presentes=24, ocupacao_estimada_pct=46, permanencia_media_seg=318,
                densidade_maxima_m2=0.78, velocidade_media_ms=0.68, zonas_atracao=3, hotspots_criticos=0,
            )
            self._acumulado = AcumuladoRecord(
                publico_por_dia={"D1": 240, "D2": 320, "D3": 400},
                atendimentos_cortesia=720,
                engajamento_interacoes=360,
            )
            self._instas: Dict[str, InstagramavelRecord] = {i.id: i for i in _seed_instagramavel()}
            self._cameras: Dict[str, CameraHardwareRecord] = {c.id: c for c in _seed_cameras(agora)}
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
                        anomalias=[], modo_leitura="TEMPO_REAL", sensor_status="ONLINE",
                        transacoes_pos_ultimos_3m=tx,
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
                "lidar_fps": self._readiness.lidar_fps,
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
                "pontos_criticos": h.hotspots_criticos,
                "estado_operacional": self._status_operacional,
            }

    def acumulado(self) -> AcumuladoRecord:
        return self._acumulado

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
    def criar_atracao(self, nome: str, setor: str, patrocinador: Optional[str] = None) -> InstagramavelRecord:
        with self._lock:
            timestamp_id = int(agora_utc().timestamp() * 1000)
            novo_insta = InstagramavelRecord(
                id=f"inst-{timestamp_id}",
                codigo=f"INSTA-{len(self._instas) + 1}",
                nome=nome,
                patrocinador=patrocinador or "Marca Parceira",
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
            instas = list(self._instas.values())
            cameras = list(self._cameras.values())

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
        with self._lock:
            return list(self._cameras.values())

    def obter_camera(self, camera_id: str) -> Optional[CameraHardwareRecord]:
        aliases = {
            "cam-int-01": "cam-fluxo-01",
            "cam-int-02": "cam-fluxo-02",
            "cam-int-03": "cam-fluxo-03",
            "cam-fb-01": "cam-fluxo-01",
            "cam-fb-02": "cam-fluxo-02",
            "cam-fb-03": "cam-fluxo-03",
        }
        with self._lock:
            resolved_id = aliases.get(camera_id, camera_id)
            return self._cameras.get(resolved_id)


memory_db = MemoryDB()
