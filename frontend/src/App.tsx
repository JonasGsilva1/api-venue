import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bot,
  Camera,
  Compass,
  Film,
  LogIn,
  Plus,
  Radio,
  RefreshCw,
  Wifi,
  X,
} from 'lucide-react';
import { InstagramavelCard } from './components/InstagramavelCard';
import { Venue3DScene } from './components/Venue3DScene';
import { SinteseAcumulada } from './components/SinteseAcumulada';
import { TerminalCLI } from './components/TerminalCLI';
import { CameraTelemetryPanel } from './components/camera/CameraTelemetryPanel';
import { ApiToast } from './components/ui/ApiToast';
import { LoginModal } from './components/auth/LoginModal';
import { PredicaoGargalosView } from './components/predicao/PredicaoGargalosView';
import { DriveVideosView } from './components/DriveVideosView';
import { useAuth } from './context/AuthContext';
import { useOpsActions } from './hooks/useOpsActions';
import { useHistoricoTelemetria } from './hooks/useHistoricoTelemetria';
import { useRealtimeStream } from './hooks/useRealtimeStream';
import {
  getDropoffSummary,
  getHealth,
  getInstagramaveis,
  getPdvStatus,
  getReadinessHeatmap,
  getSintese,
  mensagemDeErro,
  pingStatusPdvs,
  postAcionarFluxo,
  postCapturaInstagramavel,
  postCriarAtracao,
  postDespacho,
  postModoLuzInstagramavel,
  postSimularPico,
  postToggleStatusInstagramavel,
} from './services/venueApi';
import { toZonaPublico } from './utils/publico';
import type { InstagramavelItem, ModoIluminacao, SinteseAcumuladaData } from './types/venue';
import type {
  AnalyticsSummaryResponse,
  PdvStatusItem,
  ReadinessHeatmapResponse,
} from './types/publico';
import type { HealthResponse } from './types/ops';

export interface ZoneData {
  id: string;
  name: string;
  x: number;
  z: number;
  occupancy: number;
  pessoas: number;
}

export const ZONES_DATA: ZoneData[] = [
  { id: 'Z1', name: 'Balcão Principal', x: -1.5, z: 2.0, occupancy: 86, pessoas: 16 },
  { id: 'Z2', name: 'Lounge Poltronas', x: -3.0, z: 0.5, occupancy: 70, pessoas: 7 },
  { id: 'Z3', name: 'Entrada & Circulação', x: 0.0, z: 2.5, occupancy: 100, pessoas: 15 },
  { id: 'Z4', name: 'Mesas Café & Network', x: 2.0, z: 1.5, occupancy: 68, pessoas: 7 },
  { id: 'Z5', name: 'Espaço Autosserviço', x: 3.2, z: -0.5, occupancy: 25, pessoas: 2 },
  { id: 'Z6', name: 'Área de Apoio / Staff', x: 1.0, z: -1.5, occupancy: 17, pessoas: 1 },
];

export function getHeatmapColor(occupancy: number): string {
  if (occupancy >= 85) return '#ef4444';
  if (occupancy >= 50) return '#f59e0b';
  return '#10b981';
}

const SINTESE_VAZIA: SinteseAcumuladaData = {
  eventoNome: 'Venue Intelligence / RaizEvento',
  dataEvento: 'Carregando...',
  tempoDecorridoHoras: 0,
  publicoTotalEstimadoVenue: 1,
  totalAtendimentosGerais: 0,
  camerasMonitoradasAtivas: 0,
  totalCapturasInstagramavel: 0,
  alcanceTotalRedes: 0,
  vazaoMediaAtendimentosPorMin: 0,
  tempoMedioEsperaGlobalMin: 0,
  satisfacaoGeralScore: 0,
  camerasPorStatus: { operacional: 0, atencao: 0, critico: 0 },
  instagramavelPorStatus: { ativo: 0, alta_procura: 0, limpeza: 0, pausado: 0 },
  fluxoPorSetor: [],
  fluxoHorario: [],
  principaisAlertas: [],
};

export default function App() {
  const { user, token } = useAuth();
  const [zonas, setZonas] = useState<PdvStatusItem[]>([]);
  const [instas, setInstas] = useState<InstagramavelItem[]>([]);
  const [sintese, setSintese] = useState<SinteseAcumuladaData>(SINTESE_VAZIA);
  const [readinessHeatmap, setReadinessHeatmap] = useState<ReadinessHeatmapResponse | null>(null);
  const [dropoff, setDropoff] = useState<AnalyticsSummaryResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);

  const [activeTab, setActiveTab] = useState<'tudo' | 'sintese' | 'instagramavel' | 'predicao' | 'videos'>('tudo');
  const [show3DMap, setShow3DMap] = useState(true);
  const [selectedAtracaoId, setSelectedAtracaoId] = useState<string | null>(null);
  const [filtroSetor, setFiltroSetor] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState('10s');
  const [lastUpdate, setLastUpdate] = useState('--:--:--');
  const [pingLatency, setPingLatency] = useState<number>(0);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [acaoFeedback, setAcaoFeedback] = useState<{ tipo: 'ok' | 'erro' | 'info'; texto: string } | null>(null);

  const { ocupado, feedback, despachoOps, limparFeedback } = useOpsActions();

  const [formNome, setFormNome] = useState('');
  const [formSetor, setFormSetor] = useState('Arena Principal');
  const [formPatrocinador, setFormPatrocinador] = useState('');

  const intervaloMs = (parseInt(autoRefreshInterval, 10) || 10) * 1000;

  const carregarTudo = useCallback(async (signal?: AbortSignal) => {
    const [
      pingRes,
      healthRes,
      zonasRes,
      instasRes,
      sinteseRes,
      readinessRes,
      dropoffRes,
    ] = await Promise.allSettled([
      pingStatusPdvs(signal),
      getHealth(signal),
      getPdvStatus(signal),
      getInstagramaveis(signal),
      getSintese(signal),
      getReadinessHeatmap(signal),
      getDropoffSummary(signal),
    ]);

    if (signal?.aborted) return;

    if (pingRes.status === 'fulfilled') setPingLatency(pingRes.value);
    if (healthRes.status === 'fulfilled') setHealth(healthRes.value);
    if (zonasRes.status === 'fulfilled') setZonas(zonasRes.value);
    if (instasRes.status === 'fulfilled') setInstas(instasRes.value);
    if (sinteseRes.status === 'fulfilled') setSintese(sinteseRes.value);
    if (readinessRes.status === 'fulfilled') setReadinessHeatmap(readinessRes.value);
    if (dropoffRes.status === 'fulfilled') setDropoff(dropoffRes.value);

    setLastUpdate(new Date().toTimeString().split(' ')[0]);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void carregarTudo(controller.signal);
    const timer = setInterval(() => {
      if (!document.hidden) void carregarTudo(controller.signal);
    }, intervaloMs);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [carregarTudo, intervaloMs, token]);

  const handleEventoTempoReal = useCallback(() => {
    setRefreshSignal((n) => n + 1);
    void carregarTudo();
  }, [carregarTudo]);

  const { conectadoWs } = useRealtimeStream(token, handleEventoTempoReal);

  // Histórico do tempo de espera por zona real e atração instagramável, usado pela regressão linear
  const metricasEspera = useMemo(() => {
    const m: Record<string, number> = {};
    zonas.forEach((z) => {
      m[`zona-${z.id}`] = Number(((z.ultima_leitura?.tempo_espera_seg ?? 0) / 60).toFixed(2));
    });
    instas.forEach((i) => {
      m[i.id] = i.tempoEsperaMin;
    });
    return m;
  }, [zonas, instas]);

  const { historico } = useHistoricoTelemetria(metricasEspera, intervaloMs);
  const zonasPublico = useMemo(() => zonas.map(toZonaPublico), [zonas]);

  const handleRegistrarCaptura = async (id: string) => {
    try {
      const atualizado = await postCapturaInstagramavel(id);
      setInstas((prev) => prev.map((item) => (item.id === id ? atualizado : item)));
      void carregarTudo();
    } catch (err) {
      setAcaoFeedback({ tipo: 'erro', texto: mensagemDeErro(err) });
    }
  };

  const handleMudarModoLuz = async (id: string, modo: ModoIluminacao) => {
    try {
      const atualizado = await postModoLuzInstagramavel(id, modo);
      setInstas((prev) => prev.map((item) => (item.id === id ? atualizado : item)));
    } catch (err) {
      setAcaoFeedback({ tipo: 'erro', texto: mensagemDeErro(err) });
    }
  };

  const handleAlternarStatusInsta = async (id: string) => {
    try {
      const atualizado = await postToggleStatusInstagramavel(id);
      setInstas((prev) => prev.map((item) => (item.id === id ? atualizado : item)));
    } catch (err) {
      setAcaoFeedback({ tipo: 'erro', texto: mensagemDeErro(err) });
    }
  };

  const handleSimularPicoDeFluxo = async () => {
    try {
      const resp = await postSimularPico();
      setAcaoFeedback({ tipo: 'ok', texto: resp.mensagem });
      setRefreshSignal((n) => n + 1);
      await carregarTudo();
    } catch (err) {
      setAcaoFeedback({ tipo: 'erro', texto: mensagemDeErro(err) });
    }
  };

  const handleExecutarAcaoSugerida = async (alertaId: string, atracaoId?: string | null) => {
    try {
      if (atracaoId === 'cam-fluxo-01' || alertaId === 'al-1') {
        await postDespacho({
          pdv_id: 5,
          nivel_critico: 'CRITICO',
          sugestao_acao: 'Abrir 2 faixas extras e redirecionar fluxo pelo Perímetro Leste',
        });
      }
      const resp = await postAcionarFluxo({
        alerta_id: 'PRED-9921',
        acao_executada: 'ACIONAR_DUAS_FILAS_ADICIONAIS',
        setor: atracaoId || 'Arena Principal',
      });
      setAcaoFeedback({
        tipo: 'ok',
        texto: `Ação ${resp.acao_executada} registrada (${resp.status_operacional_evento}).`,
      });
      setRefreshSignal((n) => n + 1);
      await carregarTudo();
    } catch (err) {
      setAcaoFeedback({ tipo: 'erro', texto: mensagemDeErro(err) });
    }
  };

  const handleCriarAtracao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formNome.trim().length < 2) {
      setAcaoFeedback({ tipo: 'erro', texto: 'Informe pelo menos 2 caracteres para o nome da atração.' });
      return;
    }

    try {
      const novo = await postCriarAtracao({
        tipo: 'instagramavel',
        nome: formNome.trim(),
        setor: formSetor,
        patrocinador: formPatrocinador.trim() || null,
      });
      setInstas((prev) => [...prev, novo]);
      setFormNome('');
      setFormPatrocinador('');
      setShowAddModal(false);
      setAcaoFeedback({ tipo: 'ok', texto: `Atração "${novo.nome}" cadastrada na API.` });
      void carregarTudo();
    } catch (err) {
      setAcaoFeedback({ tipo: 'erro', texto: mensagemDeErro(err) });
    }
  };

  const filteredInstas = filtroSetor ? instas.filter((i) => i.setor === filtroSetor) : instas;
  const statusEvento = health?.status_operacional_evento ?? 'ESTAVEL';
  const toastAtivo = feedback ?? acaoFeedback;

  return (
    <div className="min-h-screen bg-raiz-dark text-raiz-text-light font-sans antialiased pb-16 selection:bg-raiz-accent selection:text-raiz-text-dark">
      {/* 1. TOP HEADER BAR */}
      <header className="bg-raiz-section border-b border-raiz-border-dark sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-raiz-accent/10 border border-raiz-accent/40 flex items-center justify-center text-raiz-accent shrink-0 shadow-lg shadow-raiz-accent/10">
              <Activity className="w-5 h-5 text-raiz-accent" />
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-lg font-black text-raiz-text-light tracking-tight">
                  Venue Intelligence Core
                </h1>
                <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-raiz-accent/10 border border-raiz-accent/40 text-raiz-accent">
                  RAÍZ
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                    statusEvento === 'ACAO_EM_ANDAMENTO'
                      ? 'bg-amber-950/80 border-amber-500/40 text-amber-300'
                      : 'bg-raiz-accent/10 border-raiz-accent/40 text-raiz-accent'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full inline-block animate-pulse ${
                      statusEvento === 'ACAO_EM_ANDAMENTO' ? 'bg-amber-400' : 'bg-raiz-accent'
                    }`}
                  />
                  <span>{statusEvento === 'ACAO_EM_ANDAMENTO' ? 'Ação em andamento' : 'Estável'}</span>
                </span>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-raiz-text-light/75 font-mono mt-0.5 flex-wrap">
                <span>Conexão com a API</span>
                <span className="text-raiz-text-light/55">·</span>
                <span className="text-raiz-accent font-bold">{pingLatency}ms</span>
                <span className="text-raiz-text-light/55">·</span>
                <span className="inline-flex items-center gap-1">
                  <Wifi className={`h-3 w-3 ${conectadoWs ? 'text-raiz-accent' : 'text-raiz-text-light/55'}`} />
                  <span>{conectadoWs ? 'Tempo Real ativo' : 'Atualização periódica'}</span>
                </span>
                <span className="text-raiz-text-light/55">·</span>
                <span>Atualizado às {lastUpdate}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center px-2.5 py-1.5 rounded-lg bg-raiz-dark border border-raiz-border-dark text-xs text-raiz-text-light/75 font-mono">
              <span className="text-raiz-text-light/75 mr-1">Auto:</span>
              <select
                value={autoRefreshInterval}
                onChange={(e) => setAutoRefreshInterval(e.target.value)}
                className="bg-transparent text-raiz-text-light font-bold focus:outline-none cursor-pointer"
              >
                <option value="5s" className="bg-raiz-dark">5s</option>
                <option value="10s" className="bg-raiz-dark">10s</option>
                <option value="30s" className="bg-raiz-dark">30s</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => {
                setRefreshSignal((n) => n + 1);
                void carregarTudo();
              }}
              className="p-2 rounded-lg bg-raiz-dark border border-raiz-border-dark text-raiz-text-light/75 hover:text-raiz-text-light transition-colors"
              title="Sincronizar telemetria"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={async () => {
                await despachoOps();
                setRefreshSignal((n) => n + 1);
                void carregarTudo();
              }}
              disabled={ocupado === 'despacho'}
              title="Registra uma intervenção na API para a zona mais crítica"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/40 border border-rose-500/60 text-rose-300 text-xs font-semibold hover:bg-rose-900/40 transition-colors active:scale-95 disabled:opacity-60 disabled:cursor-wait"
            >
              <Radio className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
              <span>Despacho Ops</span>
            </button>

            <button
              type="button"
              onClick={() => setShowTerminal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-raiz-accent hover:bg-raiz-accent/90 text-raiz-text-dark text-xs font-black transition-all shadow-md shadow-raiz-accent/20 active:scale-95"
            >
              <span className="font-mono">{'>_'}</span>
              <span>Terminal CLI</span>
            </button>

            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-raiz-dark border border-raiz-accent/40 text-raiz-accent text-xs font-bold hover:bg-raiz-accent/10 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Atração</span>
            </button>

            <button
              type="button"
              onClick={() => setShowLoginModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-raiz-dark border border-raiz-border-dark text-raiz-text-light text-xs font-semibold hover:border-raiz-accent/50 hover:text-raiz-accent transition-colors"
              title="Entrar ou trocar perfil de acesso"
            >
              <LogIn className="w-3.5 h-3.5 text-raiz-accent" />
              <span>Login ({user?.role ?? 'admin'})</span>
            </button>
          </div>
        </div>

        {/* 2. SUB-HEADER HORIZONTAL NAVIGATION BAR */}
        <div className="bg-raiz-dark border-t border-b border-raiz-border-dark px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 overflow-x-auto py-2">
            <div className="flex items-center gap-2 sm:gap-4 shrink-0 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('tudo')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors whitespace-nowrap font-medium ${
                  activeTab === 'tudo'
                    ? 'text-raiz-accent font-bold bg-raiz-section border border-raiz-accent/40'
                    : 'text-raiz-text-light/75 hover:text-raiz-text-light'
                }`}
              >
                <span>Mapa &amp; Arena</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('predicao')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors whitespace-nowrap font-medium ${
                  activeTab === 'predicao'
                    ? 'text-raiz-accent font-bold bg-raiz-accent/10 border border-raiz-accent/40'
                    : 'text-raiz-text-light/75 hover:text-raiz-text-light'
                }`}
              >
                <Bot className="w-3.5 h-3.5 text-raiz-accent" />
                <span>Predições de Gargalos (IA)</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('instagramavel')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors whitespace-nowrap font-medium ${
                  activeTab === 'instagramavel'
                    ? 'text-raiz-accent font-bold bg-raiz-accent/10 border border-raiz-accent/40'
                    : 'text-raiz-text-light/75 hover:text-raiz-text-light'
                }`}
              >
                <Camera className="w-3.5 h-3.5 text-raiz-accent" />
                <span>Instagramáveis</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('sintese')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors whitespace-nowrap font-medium ${
                  activeTab === 'sintese'
                    ? 'text-raiz-accent font-bold bg-raiz-section border border-raiz-accent/40'
                    : 'text-raiz-text-light/75 hover:text-raiz-text-light'
                }`}
              >
                <span>Síntese Acumulada</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('videos')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors whitespace-nowrap font-medium ${
                  activeTab === 'videos'
                    ? 'text-raiz-accent font-bold bg-raiz-section border border-raiz-accent/40'
                    : 'text-raiz-text-light/75 hover:text-raiz-text-light'
                }`}
              >
                <Film className="w-3.5 h-3.5 text-raiz-accent" />
                <span>Vídeos do Drive</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowTerminal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-raiz-section border border-raiz-accent/40 text-raiz-accent text-xs font-mono font-bold hover:bg-raiz-accent/10 transition-colors shrink-0"
            >
              <span className="text-raiz-accent">{'>_'}</span>
              <span>Terminal de Execução</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        <ApiToast
          feedback={toastAtivo}
          onClose={() => {
            limparFeedback();
            setAcaoFeedback(null);
          }}
        />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-raiz-border-dark">
          <div>
            <h2 className="text-base sm:text-lg font-mono font-bold text-raiz-accent flex items-center gap-2">
              <span>{'>_'}</span>
              <span>Terminal Operacional &amp; Execução de Diagnóstico</span>
            </h2>
            <p className="text-xs text-raiz-text-light/75 mt-0.5">
              Painel conectado em tempo real à API FastAPI para leitura espacial, câmeras e ações táticas.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShow3DMap(!show3DMap)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-raiz-accent bg-raiz-section border border-raiz-border-dark hover:bg-raiz-section/80 rounded-lg transition-colors whitespace-nowrap"
            >
              <Compass className="w-3.5 h-3.5 text-raiz-accent" />
              <span>{show3DMap ? 'Ocultar Arena 3D' : 'Exibir Arena 3D'}</span>
            </button>
          </div>
        </div>

        {/* 3D Scene Viewport */}
        {show3DMap && activeTab === 'tudo' && (
          <div className="animate-in fade-in duration-300">
            <Venue3DScene
              autos={[]}
              instas={instas}
              selectedId={selectedAtracaoId}
              onSelectAtracao={(id) => setSelectedAtracaoId(id)}
            />
          </div>
        )}

        {/* Telemetria das 7 câmeras (dados da API) */}
        {activeTab === 'tudo' && (
          <div className="animate-in fade-in duration-200">
            <CameraTelemetryPanel
              refreshSignal={refreshSignal}
              onDataChanged={() => {
                void carregarTudo();
              }}
            />
          </div>
        )}

        {/* Seção 1: Síntese Acumulada */}
        {(activeTab === 'tudo' || activeTab === 'sintese') && (
          <div className="animate-in fade-in duration-200">
            <SinteseAcumulada
              data={sintese}
              dropoff={dropoff}
              readinessHeatmap={readinessHeatmap}
              zonasPublico={zonasPublico}
              setorAtivo={filtroSetor}
              onFiltrarSetor={(s) => setFiltroSetor(s)}
              onSimularPicoDeFluxo={() => void handleSimularPicoDeFluxo()}
              onExecutarAcaoSugerida={(alertaId, atracaoId) =>
                void handleExecutarAcaoSugerida(alertaId, atracaoId)
              }
            />
          </div>
        )}

        {/* Seção: Predição de Gargalos (IA) */}
        {activeTab === 'predicao' && (
          <div className="animate-in fade-in duration-200">
            <PredicaoGargalosView
              zonas={zonas}
              instas={instas}
              historico={historico}
              onAcaoExecutada={() => {
                setRefreshSignal((n) => n + 1);
                void carregarTudo();
              }}
            />
          </div>
        )}

        {/* Seção: Vídeos do Google Drive */}
        {activeTab === 'videos' && <DriveVideosView />}

        {/* Seção 3: Pontos Instagramáveis */}
        {(activeTab === 'tudo' || activeTab === 'instagramavel') && (
          <section className="space-y-4 animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-raiz-text-light flex items-center gap-2">
                  <Camera className="w-5 h-5 text-raiz-accent" />
                  <span>Pontos Instagramáveis &amp; Ativações de Marca</span>
                </h2>
                <p className="text-xs text-raiz-text-light/75">
                  Engajamento social, contagem de fotos, controle de iluminação cenográfica e satisfação.
                </p>
              </div>
              <span className="text-xs text-raiz-accent font-mono font-bold">
                {filteredInstas.length} de {instas.length} ativações ativas
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredInstas.map((item) => (
                <InstagramavelCard
                  key={item.id}
                  item={item}
                  isSelected={selectedAtracaoId === item.id}
                  onRegistrarCaptura={(id) => void handleRegistrarCaptura(id)}
                  onMudarModoLuz={(id, modo) => void handleMudarModoLuz(id, modo)}
                  onAlternarStatus={(id) => void handleAlternarStatusInsta(id)}
                  onSelectIn3D={(id) => {
                    setSelectedAtracaoId(id);
                    setActiveTab('tudo');
                    setShow3DMap(true);
                  }}
                />
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Terminal CLI Modal */}
      <TerminalCLI
        isOpen={showTerminal}
        onClose={() => setShowTerminal(false)}
        onRunAction={(action) => {
          if (action === 'aliviar-filas') {
            void handleExecutarAcaoSugerida('al-2', 'inst-01');
          } else {
            setRefreshSignal((n) => n + 1);
            void carregarTudo();
          }
        }}
      />

      {/* Modal de Login */}
      <LoginModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />

      {/* Modal para Cadastro de Nova Atração */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-raiz-dark rounded-2xl border border-raiz-accent/40 p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-raiz-border-dark">
              <h3 className="text-base font-bold text-raiz-text-light">
                Cadastrar Nova Atração no Venue
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 text-raiz-text-light/75 hover:text-raiz-text-light rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={(e) => void handleCriarAtracao(e)} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-raiz-text-light/75 block mb-1">
                  Nome da Atração Instagramável
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  placeholder="Ex: Espelho de Neon Red Bull"
                  value={formNome}
                  onChange={(e) => setFormNome(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-raiz-border-dark bg-raiz-section text-raiz-text-light rounded-lg focus:outline-none focus:ring-2 focus:ring-raiz-accent/30 focus:border-raiz-accent/40"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-raiz-text-light/75 block mb-1">
                  Setor / Localização na Arena
                </label>
                <select
                  value={formSetor}
                  onChange={(e) => setFormSetor(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-raiz-border-dark bg-raiz-section text-raiz-text-light rounded-lg focus:outline-none focus:ring-2 focus:ring-raiz-accent/30 focus:border-raiz-accent/40"
                >
                  <option value="Arena Principal">Arena Principal</option>
                  <option value="Palco Sunset">Palco Sunset</option>
                  <option value="Camarote VIP">Camarote VIP</option>
                  <option value="Vila das Marcas">Vila das Marcas</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-raiz-text-light/75 block mb-1">
                  Marca / Patrocinador Vinculado
                </label>
                <input
                  type="text"
                  placeholder="Ex: Spotify, Itaú, Heineken"
                  value={formPatrocinador}
                  onChange={(e) => setFormPatrocinador(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-raiz-border-dark bg-raiz-section text-raiz-text-light rounded-lg focus:outline-none focus:ring-2 focus:ring-raiz-accent/30 focus:border-raiz-accent/40"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-raiz-border-dark">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-raiz-text-light/75 hover:text-raiz-text-light transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-raiz-text-dark bg-raiz-accent hover:bg-raiz-accent/90 rounded-lg transition-colors shadow-lg shadow-raiz-accent/20"
                >
                  Salvar e Cadastrar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
