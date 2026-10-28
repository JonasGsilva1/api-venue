import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Activity, 
  RefreshCw, 
  Package, 
  Radio, 
  Plus, 
  Layers3, 
  Bot, 
  Compass, 
  Beer, 
  Camera, 
  X,
  Flame,
  Users,
  BarChart3,
  Wifi,
  WifiOff
} from 'lucide-react';
import { AutosservicoCard } from './components/AutosservicoCard';
import { InstagramavelCard } from './components/InstagramavelCard';
import { Venue3DScene } from './components/Venue3DScene';
import { SinteseAcumulada } from './components/SinteseAcumulada';
import { TerminalCLI } from './components/TerminalCLI';
import { PublicoHeatmap } from './components/PublicoHeatmap';
import { BalcaoFilasView } from './components/balcao/BalcaoFilasView';
import { SinteseD1D3View } from './components/sintese/SinteseD1D3View';

import { INITIAL_AUTOSSERVICO, INITIAL_INSTAGRAMAVEL, computeSinteseAcumulada } from './data/mockData';
import type { AutosservicoItem, InstagramavelItem, StatusAutosservico } from './types/venue';
import type { PdvStatusItem, ReadinessHeatmapResponse } from './types/publico';
import { toZonaPublico } from './utils/publico';
import { venueService, type InsumosStatusResponse } from './services/venueService';

export default function App() {
  const [autos, setAutos] = useState<AutosservicoItem[]>(INITIAL_AUTOSSERVICO);
  const [instas, setInstas] = useState<InstagramavelItem[]>(INITIAL_INSTAGRAMAVEL);
  const [sinteseData, setSinteseData] = useState(() => computeSinteseAcumulada(INITIAL_AUTOSSERVICO, INITIAL_INSTAGRAMAVEL));
  const [pdvStatus, setPdvStatus] = useState<PdvStatusItem[]>([]);
  const [readinessHeatmap, setReadinessHeatmap] = useState<ReadinessHeatmapResponse | null>(null);
  const [insumosStatus, setInsumosStatus] = useState<InsumosStatusResponse | null>(null);
  const [statusOperacional, setStatusOperacional] = useState<'ESTAVEL' | 'ACAO_EM_ANDAMENTO'>('ESTAVEL');
  const [apiOnline, setApiOnline] = useState<boolean>(true);

  const [activeTab, setActiveTab] = useState<'tudo' | 'sintese' | 'autosservico' | 'instagramavel' | 'heatmap' | 'balcao' | 'd1d3'>('tudo');
  const [show3DMap, setShow3DMap] = useState(true);
  const [selectedAtracaoId, setSelectedAtracaoId] = useState<string | null>(null);
  const [filtroSetor, setFiltroSetor] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState('10s');
  const [lastUpdate, setLastUpdate] = useState('04:15:40');
  const [pingLatency, setPingLatency] = useState(18);

  const [novoTipo, setNovoTipo] = useState<'autosservico' | 'instagramavel'>('autosservico');
  const [formNome, setFormNome] = useState('');
  const [formSetor, setFormSetor] = useState('Arena Principal');
  const [formInsumoOuPatrocinador, setFormInsumoOuPatrocinador] = useState('');

  const gatewayUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

  // Carrega e sincroniza todos os dados dos endpoints da API FastAPI
  const carregarDadosApi = useCallback(async () => {
    try {
      const ping = await venueService.pingHealth();
      setPingLatency(ping.latencyMs);
      if (ping.status_operacional) {
        setStatusOperacional(ping.status_operacional as any);
      }
      setApiOnline(true);
    } catch {
      setApiOnline(false);
    }

    try {
      const [autosRes, instasRes, sinteseRes, pdvRes, readRes, insumosRes] = await Promise.allSettled([
        venueService.getAutosservico(),
        venueService.getInstagramavel(),
        venueService.getSintese(),
        venueService.getPdvStatus(),
        venueService.getReadinessHeatmap(),
        venueService.getInsumosStatus(),
      ]);

      if (autosRes.status === 'fulfilled' && autosRes.value.length > 0) {
        setAutos(autosRes.value);
      }
      if (instasRes.status === 'fulfilled' && instasRes.value.length > 0) {
        setInstas(instasRes.value);
      }
      if (sinteseRes.status === 'fulfilled') {
        setSinteseData(sinteseRes.value);
      }
      if (pdvRes.status === 'fulfilled') {
        setPdvStatus(pdvRes.value);
      }
      if (readRes.status === 'fulfilled') {
        setReadinessHeatmap(readRes.value);
      }
      if (insumosRes.status === 'fulfilled') {
        setInsumosStatus(insumosRes.value);
      }

      const now = new Date();
      setLastUpdate(now.toTimeString().split(' ')[0]);
    } catch (err) {
      console.warn('Erro ao atualizar dados da API:', err);
    }
  }, []);

  // Polling automático configurável
  useEffect(() => {
    carregarDadosApi();
    const intervalMap: Record<string, number> = { '5s': 5000, '10s': 10000, '30s': 30000 };
    const timer = setInterval(carregarDadosApi, intervalMap[autoRefreshInterval] || 10000);
    return () => clearInterval(timer);
  }, [carregarDadosApi, autoRefreshInterval]);

  const totensEmDeficit = insumosStatus
    ? insumosStatus.itens_em_deficit
    : autos.filter((a) => a.nivelAtualInsumo / a.capacidadeTotalInsumo < 0.3 || a.status === 'atencao').length;

  const zonasPublico = useMemo(() => {
    return pdvStatus.map(toZonaPublico);
  }, [pdvStatus]);

  // Ações conectadas diretamente à API FastAPI
  const handleSimularTransacao = async (id: string, valor = 30) => {
    try {
      const atualizado = await venueService.simularTransacao(id, valor);
      setAutos((prev) => prev.map((item) => (item.id === id ? atualizado : item)));
      const sintese = await venueService.getSintese();
      setSinteseData(sintese);
    } catch {
      setAutos((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;
          const novoNivel = Math.max(0, item.nivelAtualInsumo - 0.5);
          const novoCopos = Math.max(0, item.nivelCopos - 1);
          const novasTransacoes = item.transacoesAcumuladas + 1;
          const novaReceita = item.receitaTotal + valor;
          const novoStatus: StatusAutosservico = 
            novoNivel <= 20 ? 'critico' : novoNivel <= 70 ? 'atencao' : item.status === 'manutencao' ? 'manutencao' : 'operacional';
          return {
            ...item,
            nivelAtualInsumo: novoNivel,
            nivelCopos: novoCopos,
            transacoesAcumuladas: novasTransacoes,
            receitaTotal: novaReceita,
            status: novoStatus,
          };
        })
      );
    }
  };

  const handleReabastecer = async (id: string) => {
    try {
      const atualizado = await venueService.reabastecerTotem(id);
      setAutos((prev) => prev.map((item) => (item.id === id ? atualizado : item)));
      const [sintese, insumos] = await Promise.all([venueService.getSintese(), venueService.getInsumosStatus()]);
      setSinteseData(sintese);
      setInsumosStatus(insumos);
    } catch {
      setAutos((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                nivelAtualInsumo: item.capacidadeTotalInsumo,
                nivelCopos: item.capacidadeCopos,
                status: 'operacional',
                pessoasNaFila: Math.max(1, Math.floor(item.pessoasNaFila / 2)),
                ultimoAbastecimento: 'Agora mesmo',
              }
            : item
        )
      );
    }
  };

  const handleToggleManutencao = async (id: string) => {
    try {
      const atualizado = await venueService.toggleManutencao(id);
      setAutos((prev) => prev.map((item) => (item.id === id ? atualizado : item)));
    } catch {
      setAutos((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, status: item.status === 'manutencao' ? 'operacional' : 'manutencao' } : item
        )
      );
    }
  };

  const handleRegistrarCaptura = async (id: string) => {
    try {
      const atualizado = await venueService.registrarCaptura(id);
      setInstas((prev) => prev.map((item) => (item.id === id ? atualizado : item)));
      const sintese = await venueService.getSintese();
      setSinteseData(sintese);
    } catch {
      setInstas((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;
          const novasCapturas = item.capturasTotais + 1;
          const novosShares = item.compartilhamentosSociaisEstimados + 1;
          const novoAlcance = item.alcanceEstimadoRedes + 120;
          return {
            ...item,
            capturasTotais: novasCapturas,
            compartilhamentosSociaisEstimados: novosShares,
            alcanceEstimadoRedes: novoAlcance,
            status: item.pessoasNaFila > 12 ? 'alta_procura' : item.status,
          };
        })
      );
    }
  };

  const handleMudarModoLuz = async (id: string, modo: InstagramavelItem['iluminacaoCenica']['modo']) => {
    try {
      const atualizado = await venueService.mudarModoLuz(id, modo);
      setInstas((prev) => prev.map((item) => (item.id === id ? atualizado : item)));
    } catch {
      const cores: Record<string, string> = {
        'Neon Pulsar': '#10b981',
        'Cyber Glow': '#ef4444',
        'Golden Hour': '#f59e0b',
        'Studio Spotlight': '#a855f7',
      };
      setInstas((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;
          return {
            ...item,
            iluminacaoCenica: {
              ...item.iluminacaoCenica,
              modo,
              corPrincipal: cores[modo] || item.iluminacaoCenica.corPrincipal,
            },
          };
        })
      );
    }
  };

  const handleAlternarStatusInsta = async (id: string) => {
    try {
      const atualizado = await venueService.toggleStatusInstagramavel(id);
      setInstas((prev) => prev.map((item) => (item.id === id ? atualizado : item)));
    } catch {
      setInstas((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status: item.status === 'pausado' ? 'ativo' : 'pausado' } : item))
      );
    }
  };

  const handleSimularPicoDeFluxo = async () => {
    try {
      await venueService.simularPico();
      await carregarDadosApi();
    } catch {
      setAutos((prev) =>
        prev.map((a) => ({
          ...a,
          transacoesAcumuladas: a.transacoesAcumuladas + 25,
          receitaTotal: a.receitaTotal + 25 * a.ticketMedio,
          nivelAtualInsumo: Math.max(10, a.nivelAtualInsumo - 12),
          pessoasNaFila: a.pessoasNaFila + 4,
        }))
      );
      setInstas((prev) =>
        prev.map((i) => ({
          ...i,
          capturasTotais: i.capturasTotais + 40,
          compartilhamentosSociaisEstimados: i.compartilhamentosSociaisEstimados + 32,
          alcanceEstimadoRedes: i.alcanceEstimadoRedes + 5400,
          pessoasNaFila: i.pessoasNaFila + 5,
          status: 'alta_procura',
        }))
      );
    }
  };

  const handleExecutarAcaoSugerida = async (alertaId: string, atracaoId?: string) => {
    try {
      if (alertaId === 'al-1' || atracaoId === 'aut-02') {
        await venueService.reabastecerTotem('aut-02');
        await venueService.reabastecerInsumo('BAR-83-IPA', 14, 'ALTA');
      } else if (alertaId === 'al-2' || atracaoId === 'inst-01') {
        await venueService.mudarModoLuz('inst-01', 'Neon Pulsar');
        await venueService.acionarFluxo('PRED-9921', 'ACIONAR_DUAS_FILAS_ADICIONAIS', 'Portão Principal');
      } else if (alertaId === 'al-3') {
        await venueService.simularTransacao('aut-03', 45);
      }
      await carregarDadosApi();
    } catch (err) {
      console.warn('Erro ao executar ação sugerida na API:', err);
    }
  };

  const handleCriarAtracao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNome.trim()) return;

    try {
      await venueService.criarAtracao({
        tipo: novoTipo,
        nome: formNome,
        setor: formSetor,
        insumoOuPatrocinador: formInsumoOuPatrocinador,
      });
      await carregarDadosApi();
    } catch (err) {
      console.warn('Erro ao cadastrar atração na API:', err);
    }

    setFormNome('');
    setFormInsumoOuPatrocinador('');
    setShowAddModal(false);
  };

  const handleTerminalRunAction = async (cmd: string): Promise<string | void> => {
    const c = cmd.toLowerCase().trim();
    if (c === 'status') {
      const [health, sintese, insumos] = await Promise.all([
        venueService.pingHealth(),
        venueService.getSintese(),
        venueService.getInsumosStatus(),
      ]);
      return `[TELEMETRIA API] Status: ${health.status_operacional} | Ping: ${health.latencyMs}ms | Atendimentos: ${sintese.totalAtendimentosGerais} | Déficits de insumos: ${insumos.itens_em_deficit}`;
    } else if (c.includes('repor')) {
      await venueService.reabastecerInsumo('BAR-83-IPA', 14, 'ALTA');
      await venueService.reabastecerInsumo('BAR-01-AGUA', 11, 'ALTA');
      for (const a of autos) {
        await venueService.reabastecerTotem(a.id);
      }
      await carregarDadosApi();
      return '[SUCESSO API] Despacho emitido: BAR-83-IPA e BAR-01-AGUA reabastecidos. Todos os totens em 100%.';
    } else if (c.includes('fila') || c.includes('aliviar')) {
      await venueService.acionarFluxo('PRED-9921', 'ACIONAR_DUAS_FILAS_ADICIONAIS', 'Portão Principal');
      await carregarDadosApi();
      return '[SUCESSO API] Ação preditiva acionada: 2 filas adicionais no Portão Principal.';
    } else if (c.includes('pico')) {
      await venueService.simularPico();
      await carregarDadosApi();
      return '[SIMULAÇÃO API] Injeção de pico de tráfego aplicada com sucesso. Status operacional alterado para ACAO_EM_ANDAMENTO.';
    } else {
      return `[OK API] Comando "${cmd}" processado com sucesso pelo gateway FastAPI.`;
    }
  };

  const filteredAutos = filtroSetor ? autos.filter((a) => a.setor === filtroSetor) : autos;
  const filteredInstas = filtroSetor ? instas.filter((i) => i.setor === filtroSetor) : instas;

  return (
    <div className="min-h-screen bg-[#070c18] text-slate-100 font-sans antialiased pb-16 selection:bg-cyan-500 selection:text-black">
      {/* 1. TOP HEADER BAR */}
      <header className="bg-[#080d1a] border-b border-cyan-950/60 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-950/40 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shrink-0 shadow-lg shadow-cyan-950/40">
              <Activity className="w-5 h-5 text-cyan-400" />
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-lg font-black text-white tracking-tight">
                  Venue Intelligence Core
                </h1>
                <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/40 text-emerald-400">
                  RAÍZ
                </span>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                  statusOperacional === 'ACAO_EM_ANDAMENTO'
                    ? 'bg-rose-950/80 border border-rose-500/40 text-rose-300'
                    : 'bg-emerald-950/80 border border-emerald-500/40 text-emerald-300'
                }`}>
                  <span className={`w-2 h-2 rounded-full inline-block animate-pulse ${
                    statusOperacional === 'ACAO_EM_ANDAMENTO' ? 'bg-rose-400' : 'bg-emerald-400'
                  }`} />
                  <span>{statusOperacional === 'ACAO_EM_ANDAMENTO' ? 'AÇÃO EM ANDAMENTO' : 'NORMAL'}</span>
                </span>
                <span className={`px-2 py-0.5 text-[10px] rounded font-mono flex items-center gap-1 ${
                  apiOnline ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                }`}>
                  {apiOnline ? <Wifi size={10} /> : <WifiOff size={10} />}
                  {apiOnline ? 'API CONECTADA' : 'OFFLINE'}
                </span>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono mt-0.5 flex-wrap">
                <span>Gateway: {gatewayUrl}</span>
                <span className="text-slate-600">·</span>
                <span className="text-emerald-400 font-bold">{pingLatency}ms</span>
                <span className="text-slate-600">·</span>
                <span>Atualizado às {lastUpdate}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center px-2.5 py-1.5 rounded-lg bg-[#0d1527] border border-cyan-900/60 text-xs text-slate-300 font-mono">
              <span className="text-slate-400 mr-1">Auto:</span>
              <select
                value={autoRefreshInterval}
                onChange={(e) => setAutoRefreshInterval(e.target.value)}
                className="bg-transparent text-white font-bold focus:outline-none cursor-pointer"
              >
                <option value="5s" className="bg-[#090d16]">5s</option>
                <option value="10s" className="bg-[#090d16]">10s</option>
                <option value="30s" className="bg-[#090d16]">30s</option>
              </select>
            </div>

            <button
              onClick={() => carregarDadosApi()}
              className="p-2 rounded-lg bg-[#0d1527] border border-cyan-900/60 text-slate-300 hover:text-white transition-colors"
              title="Sincronizar telemetria com API"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            <div 
              onClick={() => setActiveTab('autosservico')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-950/40 border border-amber-600/50 text-amber-300 text-xs font-semibold cursor-pointer hover:bg-amber-900/50 transition-colors"
            >
              <Package className="w-3.5 h-3.5" />
              <span>Insumos</span>
              <span className="w-4 h-4 rounded-full bg-rose-600 text-white font-mono text-[10px] font-bold flex items-center justify-center">
                {totensEmDeficit}
              </span>
            </div>

            <button
              onClick={() => handleSimularPicoDeFluxo()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#230914] border border-rose-500/60 text-rose-300 text-xs font-semibold hover:bg-rose-900/40 transition-colors active:scale-95"
            >
              <Radio className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
              <span>Despacho Ops</span>
            </button>

            <button
              onClick={() => setShowTerminal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-xs font-black transition-all shadow-md shadow-emerald-500/20 active:scale-95"
            >
              <span className="font-mono">{'>_' }</span>
              <span>Terminal CLI</span>
            </button>

            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#111c33] border border-cyan-500/40 text-cyan-300 text-xs font-bold hover:bg-[#162544] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Atração</span>
            </button>
          </div>
        </div>

        {/* 2. SUB-HEADER HORIZONTAL NAVIGATION BAR */}
        <div className="bg-[#050912] border-t border-b border-cyan-950/60 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 overflow-x-auto py-2">
            <div className="flex items-center gap-2 sm:gap-4 shrink-0 text-xs">
              <button
                onClick={() => setActiveTab('tudo')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors whitespace-nowrap font-medium ${
                  activeTab === 'tudo' ? 'text-cyan-300 font-bold bg-[#0d1a2d] border border-cyan-500/40' : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>Mapa & Arena (3D)</span>
              </button>

              <button
                onClick={() => setActiveTab('autosservico')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors whitespace-nowrap font-medium ${
                  activeTab === 'autosservico' ? 'text-cyan-300 font-bold bg-[#0d1a2d] border border-cyan-500/40' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Layers3 className="w-3.5 h-3.5 text-cyan-400" />
                <span>Zonas & Telemetria ({autos.length})</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('autosservico');
                  setFiltroSetor(null);
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-amber-300 hover:text-amber-200 transition-colors whitespace-nowrap font-medium"
              >
                <Package className="w-3.5 h-3.5 text-amber-400" />
                <span>Insumos & Chopp ({totensEmDeficit} em déficit)</span>
              </button>

              <button
                onClick={() => setActiveTab('instagramavel')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors whitespace-nowrap font-medium ${
                  activeTab === 'instagramavel' ? 'text-fuchsia-300 font-bold bg-[#1a0f26] border border-fuchsia-500/40' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Bot className="w-3.5 h-3.5 text-fuchsia-400" />
                <span>Predições de Gargalos (IA)</span>
              </button>

              <button
                onClick={() => setActiveTab('sintese')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors whitespace-nowrap font-medium ${
                  activeTab === 'sintese' ? 'text-cyan-300 font-bold bg-[#0d1a2d] border border-cyan-500/40' : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>Síntese Acumulada</span>
              </button>

              <button
                onClick={() => setActiveTab('heatmap')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors whitespace-nowrap font-medium ${
                  activeTab === 'heatmap' ? 'text-amber-400 font-bold bg-[#26180b] border border-amber-500/40' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Flame className="w-3.5 h-3.5 text-amber-400" />
                <span>Mapa de Calor</span>
              </button>

              <button
                onClick={() => setActiveTab('balcao')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors whitespace-nowrap font-medium ${
                  activeTab === 'balcao' ? 'text-emerald-400 font-bold bg-[#0e261a] border border-emerald-500/40' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5 text-emerald-400" />
                <span>Balcão & Filas</span>
              </button>

              <button
                onClick={() => setActiveTab('d1d3')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors whitespace-nowrap font-medium ${
                  activeTab === 'd1d3' ? 'text-purple-400 font-bold bg-[#20102e] border border-purple-500/40' : 'text-slate-400 hover:text-white'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5 text-purple-400" />
                <span>Síntese D1–D3</span>
              </button>
            </div>

            <button
              onClick={() => setShowTerminal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#0d1a2d] border border-cyan-600/40 text-cyan-300 text-xs font-mono font-bold hover:bg-cyan-900/30 transition-colors shrink-0"
            >
              <span className="text-emerald-400">{'>_' }</span>
              <span>Terminal CLI</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {/* Visualização 3D Viewport (Apenas na aba tudo ou mapa) */}
        {activeTab === 'tudo' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-1 border-b border-slate-800">
              <div>
                <h2 className="text-base sm:text-lg font-mono font-bold text-cyan-400 flex items-center gap-2">
                  <Compass className="w-4 h-4 text-cyan-400" />
                  <span>Arena Virtual 3D & Simulação Espacial</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Visualização tridimensional em tempo real das posições de totens, iluminação cenográfica e fluxo.
                </p>
              </div>

              <button
                onClick={() => setShow3DMap(!show3DMap)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-cyan-300 bg-[#0d1527] border border-cyan-900/60 hover:bg-[#131d33] rounded-lg transition-colors whitespace-nowrap"
              >
                <Compass className="w-3.5 h-3.5 text-cyan-400" />
                <span>{show3DMap ? 'Ocultar Arena 3D' : 'Exibir Arena 3D'}</span>
              </button>
            </div>

            {show3DMap && (
              <div className="animate-in fade-in duration-300">
                <Venue3DScene
                  autos={autos}
                  instas={instas}
                  selectedId={selectedAtracaoId}
                  onSelectAtracao={(id) => setSelectedAtracaoId(id)}
                />
              </div>
            )}
          </div>
        )}

        {/* Visualização de Mapa de Calor Interativo */}
        {activeTab === 'heatmap' && (
          <div className="animate-in fade-in duration-200">
            <PublicoHeatmap
              zonas={zonasPublico.length > 0 ? zonasPublico : undefined}
              global={readinessHeatmap?.mapa_calor_global}
              simulated={false}
            />
          </div>
        )}

        {/* Visualização de Balcão & Filas */}
        {activeTab === 'balcao' && (
          <div className="animate-in fade-in duration-200">
            <BalcaoFilasView />
          </div>
        )}

        {/* Visualização de Síntese Multidiária D1-D3 */}
        {activeTab === 'd1d3' && (
          <div className="animate-in fade-in duration-200">
            <SinteseD1D3View />
          </div>
        )}

        {/* Seção: Síntese Acumulada */}
        {(activeTab === 'tudo' || activeTab === 'sintese') && (
          <div className="animate-in fade-in duration-200">
            <SinteseAcumulada
              data={sinteseData}
              setorAtivo={filtroSetor}
              onFiltrarSetor={(s) => setFiltroSetor(s)}
              onSimularPicoDeFluxo={handleSimularPicoDeFluxo}
              onExecutarAcaoSugerida={handleExecutarAcaoSugerida}
            />
          </div>
        )}

        {/* Seção: Totens de Autosserviço */}
        {(activeTab === 'tudo' || activeTab === 'autosservico') && (
          <section className="space-y-4 animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <Beer className="w-5 h-5 text-cyan-400" />
                  <span>Totens de Autosserviço (F&B / Chopp / Kiosks)</span>
                </h2>
                <p className="text-xs text-slate-400">
                  Monitoramento de telemetria, pressão CO2, volume restante e transações registradas via API FastAPI.
                </p>
              </div>
              <span className="text-xs text-cyan-400 font-mono font-bold">
                {filteredAutos.length} de {autos.length} totens ativos
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredAutos.map((item) => (
                <AutosservicoCard
                  key={item.id}
                  item={item}
                  isSelected={selectedAtracaoId === item.id}
                  onSimularTransacao={handleSimularTransacao}
                  onReabastecer={handleReabastecer}
                  onToggleManutencao={handleToggleManutencao}
                  onSelectIn3D={(id) => {
                    setSelectedAtracaoId(id);
                    setShow3DMap(true);
                  }}
                />
              ))}
            </div>
          </section>
        )}

        {/* Seção: Pontos Instagramáveis */}
        {(activeTab === 'tudo' || activeTab === 'instagramavel') && (
          <section className="space-y-4 animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <Camera className="w-5 h-5 text-fuchsia-400" />
                  <span>Pontos Instagramáveis & Ativações de Marca</span>
                </h2>
                <p className="text-xs text-slate-400">
                  Engajamento social, contagem de fotos, controle de iluminação cenográfica e satisfação.
                </p>
              </div>
              <span className="text-xs text-fuchsia-400 font-mono font-bold">
                {filteredInstas.length} de {instas.length} ativações ativas
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredInstas.map((item) => (
                <InstagramavelCard
                  key={item.id}
                  item={item}
                  isSelected={selectedAtracaoId === item.id}
                  onRegistrarCaptura={handleRegistrarCaptura}
                  onMudarModoLuz={handleMudarModoLuz}
                  onAlternarStatus={handleAlternarStatusInsta}
                  onSelectIn3D={(id) => {
                    setSelectedAtracaoId(id);
                    setShow3DMap(true);
                  }}
                />
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Terminal CLI Modal conectado com a API */}
      <TerminalCLI
        isOpen={showTerminal}
        onClose={() => setShowTerminal(false)}
        onRunAction={handleTerminalRunAction}
      />

      {/* Modal para Cadastro de Nova Atração via API */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-[#0b1220] rounded-2xl border border-cyan-500/40 p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">
                Cadastrar Nova Atração no Venue (API)
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCriarAtracao} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  Tipo de Atração
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNovoTipo('autosservico')}
                    className={`py-2 px-3 text-xs font-bold rounded-lg border text-center transition-colors ${
                      novoTipo === 'autosservico'
                        ? 'border-cyan-400 bg-cyan-950/60 text-cyan-300'
                        : 'border-slate-800 text-slate-400 hover:bg-[#070d18]'
                    }`}
                  >
                    Totem Autosserviço
                  </button>
                  <button
                    type="button"
                    onClick={() => setNovoTipo('instagramavel')}
                    className={`py-2 px-3 text-xs font-bold rounded-lg border text-center transition-colors ${
                      novoTipo === 'instagramavel'
                        ? 'border-fuchsia-400 bg-fuchsia-950/60 text-fuchsia-300'
                        : 'border-slate-800 text-slate-400 hover:bg-[#070d18]'
                    }`}
                  >
                    Ponto Instagramável
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Nome da Atração
                </label>
                <input
                  type="text"
                  required
                  placeholder={novoTipo === 'autosservico' ? 'Ex: Beer Wall 05 - Pilsen Express' : 'Ex: Espelho de Neon Red Bull'}
                  value={formNome}
                  onChange={(e) => setFormNome(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-800 bg-[#070d18] text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Setor / Localização na Arena
                </label>
                <select
                  value={formSetor}
                  onChange={(e) => setFormSetor(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-800 bg-[#070d18] text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500"
                >
                  <option value="Arena Principal">Arena Principal</option>
                  <option value="Palco Sunset">Palco Sunset</option>
                  <option value="Vila Gastronômica">Vila Gastronômica</option>
                  <option value="Camarote VIP">Camarote VIP</option>
                  <option value="Vila das Marcas">Vila das Marcas</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  {novoTipo === 'autosservico' ? 'Tipo de Insumo / Produto' : 'Marca / Patrocinador Vinculado'}
                </label>
                <input
                  type="text"
                  placeholder={novoTipo === 'autosservico' ? 'Ex: Chopp IPA 500ml' : 'Ex: Spotify, Itaú, Heineken'}
                  value={formInsumoOuPatrocinador}
                  onChange={(e) => setFormInsumoOuPatrocinador(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-800 bg-[#070d18] text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg shadow-md shadow-emerald-500/20"
                >
                  Adicionar ao Venue
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}