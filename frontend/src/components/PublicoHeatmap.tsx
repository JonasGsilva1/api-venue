import React, { useState, useEffect, useId, useMemo } from 'react';
import clsx from 'clsx';
import {
  Flame,
  Waves,
  Users,
  Eye,
  Sliders,
  Play,
  Pause,
  AlertTriangle,
  Sparkles,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import type { ZonaPublico, MapaCalorGlobal } from '../types/publico';
import {
  corDeCalor,
  intensidadeDeCalor,
  LIMITE_ALERTA_OCUPACAO,
} from '../utils/heatmap';
import { formatarDuracao } from '../utils/publico';
import standBoothImage from '../assets/stand-booth-clean.jpg';

/** Setor enriquecido para a planta 3D e métricas de fluxo */
export interface SetorVisual {
  id: string;
  codigo: string;
  titulo: string;
  subtitulo: string;
  posicao3D: { x: number; y: number }; // Coordenadas no SVG 1376x768
  raioBase: number;
  pessoas: number;
  capacidade: number;
  areaM2: number;
  densidadeM2: number;
  ocupacaoPct: number;
  esperaSeg: number;
  taxaFluxoMin: number; // pessoas / minuto entrando
  velocidadeMs: number;
}

/** Conexão de fluxo entre setores */
export interface RotaFluxo {
  id: string;
  de: string;
  para: string;
  origem: { x: number; y: number };
  destino: { x: number; y: number };
  curva: { x: number; y: number };
  taxaPessMin: number;
  velocidadeMs: number;
  rotulo: string;
}

export interface PublicoHeatmapProps {
  /** Zonas recebidas da API (opcional; se ausente, usa dados simulados calibrados). */
  zonas?: ZonaPublico[];
  /** Métricas globais da API (opcional). */
  global?: MapaCalorGlobal | null;
  /** Força o badge de dado simulado. */
  simulated?: boolean;
  className?: string;
  onSelectZona?: (setor: SetorVisual) => void;
}

// Conjunto de dados simulados padrão calibrados com a planta isométrica do print
const SETORES_PADRAO: SetorVisual[] = [
  {
    id: 'z1',
    codigo: 'Z1',
    titulo: 'Balcão Principal',
    subtitulo: 'Recepção, Bar & Atendimento',
    posicao3D: { x: 570, y: 440 },
    raioBase: 155,
    pessoas: 18,
    capacidade: 20,
    areaM2: 7.2,
    densidadeM2: 2.5,
    ocupacaoPct: 90,
    esperaSeg: 260,
    taxaFluxoMin: 44,
    velocidadeMs: 0.45,
  },
  {
    id: 'z2',
    codigo: 'Z2',
    titulo: 'Lounge Poltronas',
    subtitulo: 'Descanso & Conversas Privadas',
    posicao3D: { x: 230, y: 470 },
    raioBase: 125,
    pessoas: 7,
    capacidade: 10,
    areaM2: 6.5,
    densidadeM2: 1.08,
    ocupacaoPct: 70,
    esperaSeg: 60,
    taxaFluxoMin: 18,
    velocidadeMs: 0.35,
  },
  {
    id: 'z3',
    codigo: 'Z3',
    titulo: 'Entrada & Circulação',
    subtitulo: 'Corredor Central de Acesso',
    posicao3D: { x: 480, y: 590 },
    raioBase: 140,
    pessoas: 13,
    capacidade: 15,
    areaM2: 8.0,
    densidadeM2: 1.63,
    ocupacaoPct: 86,
    esperaSeg: 45,
    taxaFluxoMin: 52,
    velocidadeMs: 0.88,
  },
  {
    id: 'z4',
    codigo: 'Z4',
    titulo: 'Mesas Café & Networking',
    subtitulo: 'Reuniões & Conexões Rápidas',
    posicao3D: { x: 830, y: 590 },
    raioBase: 115,
    pessoas: 6,
    capacidade: 8,
    areaM2: 5.8,
    densidadeM2: 1.03,
    ocupacaoPct: 75,
    esperaSeg: 90,
    taxaFluxoMin: 14,
    velocidadeMs: 0.4,
  },
  {
    id: 'z5',
    codigo: 'Z5',
    titulo: 'Espaço Autosserviço',
    subtitulo: 'Totem Digital & Parede Interativa',
    posicao3D: { x: 950, y: 460 },
    raioBase: 105,
    pessoas: 3,
    capacidade: 8,
    areaM2: 6.0,
    densidadeM2: 0.5,
    ocupacaoPct: 38,
    esperaSeg: 30,
    taxaFluxoMin: 10,
    velocidadeMs: 0.65,
  },
  {
    id: 'z6',
    codigo: 'Z6',
    titulo: 'Área de Apoio / Staff',
    subtitulo: 'Bastidores & Suporte Técnico',
    posicao3D: { x: 620, y: 350 },
    raioBase: 90,
    pessoas: 2,
    capacidade: 6,
    areaM2: 5.0,
    densidadeM2: 0.4,
    ocupacaoPct: 33,
    esperaSeg: 15,
    taxaFluxoMin: 6,
    velocidadeMs: 0.5,
  },
];

// Rotas de fluxo entre zonas com coordenadas de curvatura Bezier
const ROTAS_FLUXO: RotaFluxo[] = [
  {
    id: 'f1',
    de: 'z3',
    para: 'z1',
    origem: { x: 480, y: 590 },
    destino: { x: 570, y: 440 },
    curva: { x: 505, y: 505 },
    taxaPessMin: 42,
    velocidadeMs: 0.85,
    rotulo: 'Entrada ➔ Balcão Principal',
  },
  {
    id: 'f2',
    de: 'z1',
    para: 'z2',
    origem: { x: 570, y: 440 },
    destino: { x: 230, y: 470 },
    curva: { x: 390, y: 485 },
    taxaPessMin: 18,
    velocidadeMs: 0.42,
    rotulo: 'Balcão ➔ Lounge Poltronas',
  },
  {
    id: 'f3',
    de: 'z3',
    para: 'z4',
    origem: { x: 480, y: 590 },
    destino: { x: 830, y: 590 },
    curva: { x: 650, y: 620 },
    taxaPessMin: 14,
    velocidadeMs: 0.55,
    rotulo: 'Entrada ➔ Mesas Café',
  },
  {
    id: 'f4',
    de: 'z1',
    para: 'z5',
    origem: { x: 570, y: 440 },
    destino: { x: 950, y: 460 },
    curva: { x: 770, y: 420 },
    taxaPessMin: 10,
    velocidadeMs: 0.6,
    rotulo: 'Balcão ➔ Autosserviço',
  },
];

export const PublicoHeatmap: React.FC<PublicoHeatmapProps> = ({
  zonas: zonasProps,
  global: globalProps,
  simulated = true,
  className,
  onSelectZona,
}) => {
  const prefixo = useId().replace(/:/g, '');

  // Camadas visuais
  const [mostrarCalor, setMostrarCalor] = useState(true);
  const [mostrarFluxo, setMostrarFluxo] = useState(true);
  const [mostrarRotulos, setMostrarRotulos] = useState(true);
  const [intensidadeGlobal, setIntensidadeGlobal] = useState(100);

  // Setor selecionado para inspeção
  const [setorSelecionado, setSetorSelecionado] = useState<SetorVisual | null>(null);

  // Cenário de simulação e oscilação em tempo real
  const [cenario, setCenario] = useState<'pico' | 'medio' | 'baixo'>('pico');
  const [simulacaoAoVivo, setSimulacaoAoVivo] = useState(true);
  const [fatorOscilacao, setFatorOscilacao] = useState(0);
  const [expandido, setExpandido] = useState(false);

  // Oscilação suave em tempo real quando ativada
  useEffect(() => {
    if (!simulacaoAoVivo) return;
    const interval = setInterval(() => {
      setFatorOscilacao((prev) => (prev + 1) % 100);
    }, 2500);
    return () => clearInterval(interval);
  }, [simulacaoAoVivo]);

  // Setores computados de acordo com o cenário e oscilação
  const setores: SetorVisual[] = useMemo(() => {
    const multiplicador =
      cenario === 'pico' ? 1.0 : cenario === 'medio' ? 0.72 : 0.4;

    return SETORES_PADRAO.map((s, idx) => {
      // Se houver zona correspondente recebida da API externa, usa os dados reais
      if (zonasProps && zonasProps.length > 0) {
        const encontrada = zonasProps.find(
          (z) => z.codigo.toLowerCase() === s.codigo.toLowerCase()
        );
        if (encontrada) {
          return {
            ...s,
            pessoas: encontrada.pessoas,
            capacidade: encontrada.capacidade || s.capacidade,
            ocupacaoPct: encontrada.ocupacaoPct,
            densidadeM2: encontrada.densidadeM2 || s.densidadeM2,
            esperaSeg: encontrada.esperaSeg || s.esperaSeg,
          };
        }
      }

      // Variação orgânica simulada
      const seno = Math.sin((fatorOscilacao * 0.15) + idx * 1.3);
      const delta = Math.round(seno * 2);
      const pessoasAjustadas = Math.max(
        1,
        Math.round(s.pessoas * multiplicador + (simulacaoAoVivo ? delta : 0))
      );
      const ocupacaoPct = Math.min(
        100,
        Math.max(5, Math.round((pessoasAjustadas / s.capacidade) * 100))
      );
      const densidadeM2 = Number((pessoasAjustadas / s.areaM2).toFixed(2));

      return {
        ...s,
        pessoas: pessoasAjustadas,
        ocupacaoPct,
        densidadeM2,
        esperaSeg: Math.round(s.esperaSeg * (ocupacaoPct / 100)),
      };
    });
  }, [cenario, fatorOscilacao, simulacaoAoVivo, zonasProps]);

  // Totais agregados
  const totalPessoas = useMemo(
    () =>
      globalProps?.pessoas_presentes ??
      setores.reduce((sum, s) => sum + s.pessoas, 0),
    [globalProps, setores]
  );

  const densidadeMaxima = useMemo(
    () =>
      globalProps?.densidade_maxima_m2 ??
      Math.max(...setores.map((s) => s.densidadeM2)),
    [globalProps, setores]
  );

  const setoresEmAlerta = useMemo(
    () => setores.filter((s) => s.ocupacaoPct >= LIMITE_ALERTA_OCUPACAO),
    [setores]
  );

  const handleSelectSetor = (setor: SetorVisual) => {
    setSetorSelecionado((prev) => (prev?.id === setor.id ? null : setor));
    if (onSelectZona) onSelectZona(setor);
  };

  return (
    <div
      className={clsx(
        'rounded-2xl border border-[#1E293B] bg-[#111827] text-gray-100 shadow-2xl transition-all overflow-hidden flex flex-col',
        expandido ? 'fixed inset-4 z-50 overflow-y-auto' : 'w-full',
        className
      )}
    >
      {/* 1. CABEÇALHO TÁTICO (#111827 + Destaque #FFD600) */}
      <header className="px-5 py-4 border-b border-[#1E293B] bg-[#0E1526]/80 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-[#FFD600]/10 border border-[#FFD600]/30 text-[#FFD600] flex items-center justify-center">
            <Flame size={20} className="motion-safe:animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-gray-100 tracking-wide">
                Mapa de Calor & Fluxo 3D
              </h2>
              {simulated && (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider uppercase bg-[#FFD600]/20 text-[#FFD600] border border-[#FFD600]/40">
                  Simulação
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400">
              Densidade volumétrica e dinâmica de circulação por setor no estande RAIZ
            </p>
          </div>
        </div>

        {/* Controles de camadas e simulação */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Cenários rápidos */}
          <div className="flex items-center bg-[#090D16] p-1 rounded-lg border border-[#1E293B] text-xs">
            <button
              type="button"
              onClick={() => setCenario('pico')}
              className={clsx(
                'px-2.5 py-1 rounded font-medium transition-colors',
                cenario === 'pico'
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 font-semibold'
                  : 'text-gray-400 hover:text-gray-200'
              )}
            >
              Pico (Alerta)
            </button>
            <button
              type="button"
              onClick={() => setCenario('medio')}
              className={clsx(
                'px-2.5 py-1 rounded font-medium transition-colors',
                cenario === 'medio'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 font-semibold'
                  : 'text-gray-400 hover:text-gray-200'
              )}
            >
              Moderado
            </button>
            <button
              type="button"
              onClick={() => setCenario('baixo')}
              className={clsx(
                'px-2.5 py-1 rounded font-medium transition-colors',
                cenario === 'baixo'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-semibold'
                  : 'text-gray-400 hover:text-gray-200'
              )}
            >
              Tranquilo
            </button>
          </div>

          {/* Toggle de Simulação ao Vivo */}
          <button
            type="button"
            onClick={() => setSimulacaoAoVivo((v) => !v)}
            title={simulacaoAoVivo ? 'Pausar oscilação' : 'Ativar oscilação ao vivo'}
            className={clsx(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-all',
              simulacaoAoVivo
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-[#090D16] border-[#1E293B] text-gray-400 hover:text-gray-200'
            )}
          >
            {simulacaoAoVivo ? <Pause size={13} /> : <Play size={13} />}
            <span>{simulacaoAoVivo ? 'Ao Vivo' : 'Pausado'}</span>
          </button>

          {/* Alternar camadas */}
          <div className="flex items-center bg-[#090D16] p-1 rounded-lg border border-[#1E293B] text-xs gap-1">
            <button
              type="button"
              onClick={() => setMostrarCalor((v) => !v)}
              className={clsx(
                'px-2 py-1 rounded flex items-center gap-1 font-medium transition-all',
                mostrarCalor
                  ? 'bg-[#FFD600] text-[#090D16] font-bold shadow'
                  : 'text-gray-400 hover:text-gray-200'
              )}
            >
              <Flame size={13} />
              Calor
            </button>
            <button
              type="button"
              onClick={() => setMostrarFluxo((v) => !v)}
              className={clsx(
                'px-2 py-1 rounded flex items-center gap-1 font-medium transition-all',
                mostrarFluxo
                  ? 'bg-[#FFD600] text-[#090D16] font-bold shadow'
                  : 'text-gray-400 hover:text-gray-200'
              )}
            >
              <Waves size={13} />
              Fluxo
            </button>
            <button
              type="button"
              onClick={() => setMostrarRotulos((v) => !v)}
              className={clsx(
                'px-2 py-1 rounded flex items-center gap-1 font-medium transition-all',
                mostrarRotulos
                  ? 'bg-[#FFD600] text-[#090D16] font-bold shadow'
                  : 'text-gray-400 hover:text-gray-200'
              )}
            >
              <Eye size={13} />
              Setores
            </button>
          </div>

          {/* Maximizar / Minimizar */}
          <button
            type="button"
            onClick={() => setExpandido((v) => !v)}
            title={expandido ? 'Minimizar' : 'Tela cheia'}
            className="p-1.5 rounded-lg border border-[#1E293B] bg-[#090D16] text-gray-400 hover:text-white transition-colors"
          >
            {expandido ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </div>
      </header>

      {/* 2. BARRA DE MÉTRICAS RÁPIDAS SUPERIOR */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-5 py-3 bg-[#090D16]/60 border-b border-[#1E293B] text-xs">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-[#FFD600]" />
          <div>
            <span className="text-[10px] text-gray-400 uppercase font-semibold">Total Presente</span>
            <p className="font-mono text-sm font-bold text-gray-100">{totalPessoas} pessoas</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Flame size={16} className="text-rose-400" />
          <div>
            <span className="text-[10px] text-gray-400 uppercase font-semibold">Densidade Máxima</span>
            <p className="font-mono text-sm font-bold text-gray-100">{densidadeMaxima.toFixed(2)} pess./m²</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Waves size={16} className="text-cyan-400" />
          <div>
            <span className="text-[10px] text-gray-400 uppercase font-semibold">Fluxo Geral Médio</span>
            <p className="font-mono text-sm font-bold text-gray-100">0.68 m/s (~42 pess/min)</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AlertTriangle
            size={16}
            className={setoresEmAlerta.length > 0 ? 'text-amber-400 animate-pulse' : 'text-emerald-400'}
          />
          <div>
            <span className="text-[10px] text-gray-400 uppercase font-semibold">Zonas em Alerta</span>
            <p className="font-mono text-sm font-bold text-gray-100">
              {setoresEmAlerta.length > 0 ? (
                <span className="text-rose-400">{setoresEmAlerta.length} zona(s) (&gt;{LIMITE_ALERTA_OCUPACAO}%)</span>
              ) : (
                <span className="text-emerald-400">Fluxo Normal</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* 3. ÁREA PRINCIPAL: MAPA ISOMÉTRICO (ESQUERDA) + LEGENDA VERTICAL IDENTICA AO PRINT (DIREITA) */}
      <div className="relative p-4 sm:p-6 bg-[#090D16] flex-1 flex flex-col lg:flex-row items-stretch gap-6">
        {/* VIEWPORT DO MAPA ISOMÉTRICO COM RENDER 3D + SVG HEATMAP OVERLAY */}
        <div className="relative flex-1 rounded-2xl overflow-hidden border border-[#1E293B] bg-[#05070D] shadow-inner flex items-center justify-center group min-h-[380px] sm:min-h-[460px]">
          {/* Imagem base do estande RAIZ 3D */}
          <img
            src={standBoothImage}
            alt="Planta 3D Isométrica do Estande RAIZ"
            className="w-full h-full object-contain pointer-events-none select-none"
            style={{
              filter: 'brightness(0.92) contrast(1.08)',
            }}
          />

          {/* Camada SVG dinâmica: Gradientes de Calor, Vetores de Fluxo e Marcadores Táticos */}
          <svg
            viewBox="0 0 1376 768"
            className="absolute inset-0 w-full h-full pointer-events-auto"
            style={{ touchAction: 'none' }}
          >
            <defs>
              {/* Filtro Gaussiano para suavizar a mancha térmica orgânica */}
              <filter id={`${prefixo}-blur-calor`} x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="38" result="blur" />
              </filter>

              {/* Marcador de seta para fluxo direcional */}
              <marker
                id={`${prefixo}-seta-fluxo`}
                viewBox="0 0 10 10"
                refX="6"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#38BDF8" opacity="0.8" />
              </marker>

              {/* Gradiente radial para cada setor baseado em corDeCalor e intensidadeDeCalor */}
              {setores.map((s) => {
                const t = intensidadeDeCalor(s.ocupacaoPct);
                const corPico = corDeCalor(t);
                const corMeio = corDeCalor(t * 0.75);
                const corBorda = corDeCalor(t * 0.35);

                return (
                  <radialGradient key={s.id} id={`${prefixo}-mancha-${s.id}`}>
                    <stop offset="0%" stopColor={corPico} stopOpacity="0.88" />
                    <stop offset="35%" stopColor={corMeio} stopOpacity="0.65" />
                    <stop offset="68%" stopColor={corBorda} stopOpacity="0.32" />
                    <stop offset="100%" stopColor={corBorda} stopOpacity="0" />
                  </radialGradient>
                );
              })}
            </defs>

            {/* A. CAMADA DE CALOR TÉRMICO (Mix Blend Mode: Screen para fundir manchas perfeitamente) */}
            {mostrarCalor && (
              <g
                style={{
                  mixBlendMode: 'screen',
                  opacity: intensidadeGlobal / 100,
                  transition: 'opacity 0.3s ease',
                }}
                filter={`url(#${prefixo}-blur-calor)`}
              >
                {/* Brilho base ambiente sutil para simular presença no piso do estande */}
                <ellipse
                  cx="540"
                  cy="490"
                  rx="360"
                  ry="180"
                  fill="#1D4ED8"
                  opacity="0.22"
                />

                {/* Manchas de calor por setor */}
                {setores.map((s) => {
                  const t = intensidadeDeCalor(s.ocupacaoPct);
                  const raioAjustado = s.raioBase * (0.8 + 0.38 * t);
                  const isHover = setorSelecionado?.id === s.id;

                  return (
                    <circle
                      key={`calor-${s.id}`}
                      cx={s.posicao3D.x}
                      cy={s.posicao3D.y}
                      r={isHover ? raioAjustado * 1.2 : raioAjustado}
                      fill={`url(#${prefixo}-mancha-${s.id})`}
                      className="transition-all duration-700 ease-out"
                    />
                  );
                })}
              </g>
            )}

            {/* B. CAMADA DE FLUXO DE PESSOAS (Vetores animados com partículas) */}
            {mostrarFluxo && (
              <g className="transition-opacity duration-300">
                <style>
                  {`
                    @keyframes fluxoAnimado_${prefixo} {
                      0% { stroke-dashoffset: 60; }
                      100% { stroke-dashoffset: 0; }
                    }
                    .fluxo-trilha-${prefixo} {
                      animation: fluxoAnimado_${prefixo} 1.8s linear infinite;
                    }
                  `}
                </style>

                {ROTAS_FLUXO.map((rota) => {
                  const pathData = `M ${rota.origem.x} ${rota.origem.y} Q ${rota.curva.x} ${rota.curva.y} ${rota.destino.x} ${rota.destino.y}`;
                  const isFoco =
                    setorSelecionado?.id === rota.de || setorSelecionado?.id === rota.para;

                  return (
                    <g key={rota.id} className="cursor-pointer">
                      {/* Trilha de fundo com brilho */}
                      <path
                        d={pathData}
                        fill="none"
                        stroke="#0284C7"
                        strokeWidth={isFoco ? 5 : 3}
                        strokeOpacity={isFoco ? 0.7 : 0.35}
                        strokeLinecap="round"
                      />

                      {/* Trilha tracejada animada indicando a direção do fluxo */}
                      <path
                        d={pathData}
                        fill="none"
                        stroke="#38BDF8"
                        strokeWidth={isFoco ? 4 : 2.5}
                        strokeDasharray="8 8"
                        strokeLinecap="round"
                        className={`fluxo-trilha-${prefixo}`}
                        markerEnd={`url(#${prefixo}-seta-fluxo)`}
                      />

                      {/* Rótulo de taxa de pessoas ao longo da curva */}
                      <rect
                        x={rota.curva.x - 26}
                        y={rota.curva.y - 12}
                        width="52"
                        height="20"
                        rx="10"
                        fill="#090D16"
                        stroke="#38BDF8"
                        strokeWidth="1"
                        opacity="0.9"
                      />
                      <text
                        x={rota.curva.x}
                        y={rota.curva.y + 2}
                        textAnchor="middle"
                        fontSize="10"
                        fontWeight="600"
                        fill="#E0F2FE"
                        fontFamily="monospace"
                      >
                        {rota.taxaPessMin} p/m
                      </text>
                    </g>
                  );
                })}
              </g>
            )}

            {/* C. PINOS TÁTICOS E RÓTULOS DE CADA SETOR */}
            {mostrarRotulos && (
              <g>
                {setores.map((s) => {
                  const t = intensidadeDeCalor(s.ocupacaoPct);
                  const cor = corDeCalor(t);
                  const emAlerta = s.ocupacaoPct >= LIMITE_ALERTA_OCUPACAO;
                  const isSelected = setorSelecionado?.id === s.id;

                  return (
                    <g
                      key={`pin-${s.id}`}
                      onClick={() => handleSelectSetor(s)}
                      className="cursor-pointer transition-transform group/pin"
                      style={{
                        transformOrigin: `${s.posicao3D.x}px ${s.posicao3D.y}px`,
                      }}
                    >
                      {/* Anel de alerta pulsante se em alta concentração */}
                      {emAlerta && (
                        <circle
                          cx={s.posicao3D.x}
                          cy={s.posicao3D.y}
                          r="34"
                          fill="none"
                          stroke="#EF4444"
                          strokeWidth="3"
                          opacity="0.8"
                          className="motion-safe:animate-ping"
                        />
                      )}

                      {/* Anel de seleção em amarelo do Design System */}
                      {isSelected && (
                        <circle
                          cx={s.posicao3D.x}
                          cy={s.posicao3D.y}
                          r="30"
                          fill="none"
                          stroke="#FFD600"
                          strokeWidth="3.5"
                          strokeDasharray="5 3"
                        />
                      )}

                      {/* Halo central com a cor calculada dinamicamente */}
                      <circle
                        cx={s.posicao3D.x}
                        cy={s.posicao3D.y}
                        r="18"
                        fill="#090D16"
                        stroke={cor}
                        strokeWidth="4"
                        className="transition-colors duration-300 shadow-lg"
                      />

                      {/* Código da zona no centro do pino */}
                      <text
                        x={s.posicao3D.x}
                        y={s.posicao3D.y + 4.5}
                        textAnchor="middle"
                        fontSize="11"
                        fontWeight="800"
                        fill="#FFFFFF"
                        fontFamily="system-ui"
                      >
                        {s.codigo}
                      </text>

                      {/* Badge flutuante de ocupação e pessoas */}
                      <g
                        transform={`translate(${s.posicao3D.x}, ${s.posicao3D.y - 34})`}
                        className="pointer-events-none"
                      >
                        <rect
                          x="-58"
                          y="-16"
                          width="116"
                          height="24"
                          rx="6"
                          fill="#090D16"
                          stroke={cor}
                          strokeWidth="1.5"
                          opacity="0.95"
                        />
                        <text
                          x="0"
                          y="1"
                          textAnchor="middle"
                          fontSize="10"
                          fontWeight="700"
                          fill="#F9FAFB"
                          fontFamily="system-ui"
                        >
                          {s.codigo}: {s.pessoas}p • {s.ocupacaoPct}%
                        </text>
                      </g>
                    </g>
                  );
                })}
              </g>
            )}
          </svg>

          {/* Dica de interação flutuante */}
          <div className="absolute bottom-3 left-3 px-3 py-1.5 rounded-lg bg-[#090D16]/85 backdrop-blur-md border border-[#1E293B] text-[11px] text-gray-300 flex items-center gap-2 pointer-events-none">
            <span className="size-2 rounded-full bg-[#FFD600] animate-pulse" />
            <span>Clique nos setores para inspecionar densidade e fluxo</span>
          </div>
        </div>

        {/* LEGENDA VERTICAL — IDENTICA À REFERÊNCIA DO PRINT */}
        <aside
          aria-label="Legenda de Concentração de Público"
          className="lg:w-48 xl:w-56 flex-shrink-0 flex flex-col justify-between p-4 rounded-xl bg-[#0E1526]/90 border border-[#1E293B] shadow-xl"
        >
          <div>
            <h3 className="text-xs font-bold text-gray-200 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[#FFD600]" />
              Densidade
            </h3>
            <p className="text-[11px] text-gray-400 mb-5">
              Escala térmica calculada por ocupação/m²
            </p>

            {/* CÁPSULA / BARRA GRADIENTE VERTICAL IDENTICA AO PRINT */}
            <div className="flex items-center gap-4 py-2 px-1">
              {/* Barra em pílula arredondada com gradiente vertical (Vermelho topo -> Amarelo meio -> Azul base) */}
              <div
                className="w-5 sm:w-6 h-64 sm:h-72 rounded-full relative shadow-lg shadow-black/50 border border-white/10 shrink-0"
                style={{
                  background: `linear-gradient(to bottom, 
                    ${corDeCalor(1)} 0%, 
                    ${corDeCalor(0.85)} 18%, 
                    ${corDeCalor(0.66)} 40%, 
                    ${corDeCalor(0.33)} 70%, 
                    ${corDeCalor(0)} 100%)`,
                }}
              >
                {/* Linha indicadora do ponto de alerta crítico */}
                <div
                  className="absolute left-0 right-0 h-0.5 bg-white shadow-sm"
                  style={{ top: '15%' }}
                  title={`Alerta Crítico: >= ${LIMITE_ALERTA_OCUPACAO}%`}
                />
              </div>

              {/* RÓTULOS IDÊNTICOS À REFERÊNCIA DO USUÁRIO */}
              <div className="flex flex-col justify-between h-64 sm:h-72 py-1 select-none">
                {/* 1. Alta Concentração */}
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-gray-100 leading-tight">
                    Alta
                  </span>
                  <span className="text-xs text-gray-400 leading-tight">
                    concentração
                  </span>
                  <span className="text-[10px] font-mono text-rose-400 mt-0.5 font-semibold">
                    &ge; {LIMITE_ALERTA_OCUPACAO}%
                  </span>
                </div>

                {/* 2. Média Concentração */}
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-gray-200 leading-tight">
                    Média
                  </span>
                  <span className="text-xs text-gray-400 leading-tight">
                    concentração
                  </span>
                  <span className="text-[10px] font-mono text-amber-400 mt-0.5 font-semibold">
                    ~50% a 75%
                  </span>
                </div>

                {/* 3. Baixa Concentração */}
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-gray-300 leading-tight">
                    Baixa
                  </span>
                  <span className="text-xs text-gray-400 leading-tight">
                    concentração
                  </span>
                  <span className="text-[10px] font-mono text-blue-400 mt-0.5 font-semibold">
                    &lt; 35%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Controle fino de intensidade de calor */}
          <div className="mt-6 pt-4 border-t border-[#1E293B]">
            <div className="flex items-center justify-between text-[11px] text-gray-400 mb-1.5 font-mono">
              <span className="flex items-center gap-1">
                <Sliders size={12} className="text-[#FFD600]" />
                Intensidade
              </span>
              <span>{intensidadeGlobal}%</span>
            </div>
            <input
              type="range"
              min={30}
              max={150}
              value={intensidadeGlobal}
              onChange={(e) => setIntensidadeGlobal(Number(e.target.value))}
              className="w-full accent-[#FFD600] h-1.5 bg-[#090D16] rounded-lg appearance-none cursor-pointer"
            />
          </div>
        </aside>
      </div>

      {/* 4. PAINEL DETALHADO DE INSPEÇÃO DE SETOR / LISTA DE ZONAS */}
      <div className="border-t border-[#1E293B] bg-[#0E1526]/90 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-[#FFD600]" />
            <h3 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
              {setorSelecionado ? `Detalhamento Tático — ${setorSelecionado.codigo}` : 'Setores do Estande'}
            </h3>
          </div>
          {setorSelecionado && (
            <button
              type="button"
              onClick={() => setSetorSelecionado(null)}
              className="text-xs font-semibold text-[#FFD600] hover:underline"
            >
              Ver todos os setores
            </button>
          )}
        </div>

        {/* Se um setor estiver selecionado, exibe HUD de alta definição */}
        {setorSelecionado ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-[#090D16] p-4 rounded-xl border border-[#1E293B]">
            <div className="md:col-span-1">
              <div className="flex items-center gap-2">
                <span
                  className="size-3.5 rounded-full"
                  style={{
                    backgroundColor: corDeCalor(intensidadeDeCalor(setorSelecionado.ocupacaoPct)),
                  }}
                />
                <h4 className="font-bold text-sm text-gray-100">{setorSelecionado.titulo}</h4>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">{setorSelecionado.subtitulo}</p>
              <div className="mt-2">
                <span
                  className={clsx(
                    'px-2 py-0.5 text-[10px] font-mono font-bold rounded border',
                    setorSelecionado.ocupacaoPct >= LIMITE_ALERTA_OCUPACAO
                      ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                      : setorSelecionado.ocupacaoPct >= 60
                      ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                      : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                  )}
                >
                  {setorSelecionado.ocupacaoPct >= LIMITE_ALERTA_OCUPACAO
                    ? 'ALERTA DE ALTA CONCENTRAÇÃO'
                    : 'FLUXO CONTROLADO'}
                </span>
              </div>
            </div>

            <div className="p-3 bg-[#111827] rounded-lg border border-[#1E293B]">
              <span className="text-[10px] uppercase font-semibold text-gray-400">Pessoas / Capacidade</span>
              <p className="font-mono text-lg font-bold text-gray-100 mt-1">
                {setorSelecionado.pessoas}{' '}
                <span className="text-xs text-gray-400 font-normal">/ {setorSelecionado.capacidade} máx</span>
              </p>
              <div className="mt-2 h-1.5 rounded-full bg-[#090D16] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, setorSelecionado.ocupacaoPct)}%`,
                    backgroundColor: corDeCalor(intensidadeDeCalor(setorSelecionado.ocupacaoPct)),
                  }}
                />
              </div>
            </div>

            <div className="p-3 bg-[#111827] rounded-lg border border-[#1E293B]">
              <span className="text-[10px] uppercase font-semibold text-gray-400">Densidade Estimada</span>
              <p className="font-mono text-lg font-bold text-gray-100 mt-1">
                {setorSelecionado.densidadeM2}{' '}
                <span className="text-xs text-gray-400 font-normal">pess./m²</span>
              </p>
              <p className="text-[11px] text-gray-400 mt-1">
                Área útil: {setorSelecionado.areaM2} m²
              </p>
            </div>

            <div className="p-3 bg-[#111827] rounded-lg border border-[#1E293B]">
              <span className="text-[10px] uppercase font-semibold text-gray-400">Fluxo & Permanência</span>
              <p className="font-mono text-lg font-bold text-[#FFD600] mt-1">
                {setorSelecionado.taxaFluxoMin}{' '}
                <span className="text-xs text-gray-300 font-normal">pess./min</span>
              </p>
              <p className="text-[11px] text-gray-400 mt-1">
                Tempo fila/espera: {formatarDuracao(setorSelecionado.esperaSeg)}
              </p>
            </div>
          </div>
        ) : (
          /* Grade rápida de todos os setores */
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {setores.map((s) => {
              const cor = corDeCalor(intensidadeDeCalor(s.ocupacaoPct));
              const emAlerta = s.ocupacaoPct >= LIMITE_ALERTA_OCUPACAO;

              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleSelectSetor(s)}
                  className={clsx(
                    'p-2.5 rounded-xl border text-left transition-all hover:border-[#FFD600]/60 bg-[#090D16]',
                    emAlerta ? 'border-rose-500/50' : 'border-[#1E293B]'
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-xs font-bold text-[#FFD600]">{s.codigo}</span>
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: cor }}
                      title={`${s.ocupacaoPct}% ocupação`}
                    />
                  </div>
                  <p className="text-xs font-medium text-gray-200 truncate" title={s.titulo}>
                    {s.titulo}
                  </p>
                  <div className="flex items-baseline justify-between mt-1 font-mono text-[11px]">
                    <span className="text-gray-400">{s.pessoas} pess.</span>
                    <span
                      className={clsx('font-bold', emAlerta ? 'text-rose-400' : 'text-gray-300')}
                    >
                      {s.ocupacaoPct}%
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
