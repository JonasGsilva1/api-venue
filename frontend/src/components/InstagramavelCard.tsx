import React, { useState } from 'react';
import { 
  Camera, 
  Sparkles, 
  Heart, 
  Clock, 
  Star, 
  MapPin, 
  ChevronDown, 
  ChevronUp, 
  Flame, 
  PauseCircle,
  Sliders
} from 'lucide-react';
import type { InstagramavelItem, StatusInstagramavel } from '../types/venue';

interface InstagramavelCardProps {
  item: InstagramavelItem;
  isSelected?: boolean;
  onRegistrarCaptura: (id: string) => void;
  onMudarModoLuz?: (id: string, modo: InstagramavelItem['iluminacaoCenica']['modo']) => void;
  onAlternarStatus: (id: string) => void;
  onSelectIn3D?: (id: string) => void;
}

export const InstagramavelCard: React.FC<InstagramavelCardProps> = ({
  item,
  isSelected = false,
  onRegistrarCaptura,
  onMudarModoLuz,
  onAlternarStatus,
  onSelectIn3D,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [flashAnimation, setFlashAnimation] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const handleCapture = () => {
    if (item.status === 'pausado' || item.status === 'limpeza') {
      setFeedbackMsg('Atração temporariamente pausada para manutenção');
      setTimeout(() => setFeedbackMsg(null), 2500);
      return;
    }
    setFlashAnimation(true);
    setFeedbackMsg('+1 Foto registrada & dados de engajamento capturados!');
    onRegistrarCaptura(item.id);
    setTimeout(() => setFlashAnimation(false), 300);
    setTimeout(() => setFeedbackMsg(null), 2500);
  };

  const getStatusDisplay = (status: StatusInstagramavel) => {
    switch (status) {
      case 'ativo':
        return {
          label: 'NORMAL',
          icon: <span className="w-2 h-2 rounded-full bg-raiz-accent inline-block animate-pulse" />,
          colorClass: 'text-raiz-accent bg-raiz-accent/10 border-raiz-accent/40',
        };
      case 'alta_procura':
        return {
          label: 'CRÍTICO / ALTA PROCURA',
          icon: <Flame className="w-3.5 h-3.5 text-rose-400" />,
          colorClass: 'text-rose-300 bg-rose-950/60 border-rose-500/50',
        };
      case 'limpeza':
        return {
          label: 'HIGIENIZAÇÃO',
          icon: <Sparkles className="w-3.5 h-3.5 text-amber-400" />,
          colorClass: 'text-amber-300 bg-amber-950/60 border-amber-500/40',
        };
      case 'pausado':
        return {
          label: 'PAUSADO',
          icon: <PauseCircle className="w-3.5 h-3.5 text-raiz-text-light/75" />,
          colorClass: 'text-raiz-text-light/75 bg-raiz-dark border-raiz-border-dark',
        };
    }
  };

  const statusInfo = getStatusDisplay(item.status);

  const modosLuz: InstagramavelItem['iluminacaoCenica']['modo'][] = [
    'Neon Pulsar',
    'Cyber Glow',
    'Golden Hour',
    'Studio Spotlight',
  ];

  return (
    <div 
      className={`relative rounded-xl border p-5 transition-all duration-200 shadow-xl ${
        isSelected 
          ? 'border-raiz-accent/40 bg-raiz-section ring-2 ring-raiz-accent/30'
          : 'border-raiz-border-dark bg-raiz-section hover:border-raiz-border-dark'
      }`}
    >
      {/* Efeito Flash ao Registrar Captura */}
      {flashAnimation && (
        <div className="absolute inset-0 bg-white/40 rounded-xl pointer-events-none z-20 transition-opacity duration-300" />
      )}

      {/* Toast Feedback */}
      {feedbackMsg && (
        <div className="absolute top-3 right-3 z-30 flex items-center gap-1.5 rounded-lg bg-raiz-dark border border-raiz-accent/40 px-3 py-1.5 text-xs font-medium text-raiz-accent shadow-2xl animate-in fade-in duration-150">
          <Sparkles className="w-3.5 h-3.5 text-raiz-accent" />
          <span>{feedbackMsg}</span>
        </div>
      )}

      {/* Header do Card */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 pb-4 border-b border-raiz-border-dark">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono font-bold text-raiz-accent px-1.5 py-0.5 rounded bg-raiz-accent/10 border border-raiz-accent/30 text-[10px]">
              {item.codigo}
            </span>
            <span className="text-raiz-text-light/55">·</span>
            <span className="text-raiz-text-light/75">{item.setor}</span>
            <span className="text-raiz-text-light/55">·</span>
            <span className="text-raiz-accent font-bold">{item.patrocinador}</span>
          </div>

          <h3 className="mt-1 text-base font-bold text-raiz-text-light tracking-tight flex items-center gap-2">
            <Camera className="w-4 h-4 text-raiz-accent shrink-0" />
            <span>{item.nome}</span>
          </h3>
          <p className="text-xs text-raiz-text-light/75 mt-0.5">
            {item.categoriaCenario}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${statusInfo.colorClass}`}>
            {statusInfo.icon}
            <span>{statusInfo.label}</span>
          </div>

          {onSelectIn3D && (
            <button
              onClick={() => onSelectIn3D(item.id)}
              title="Focar na Maquete 3D da Arena"
              className="p-1.5 text-raiz-text-light/75 hover:text-raiz-accent hover:bg-raiz-section border border-raiz-border-dark rounded-md transition-colors"
              aria-label="Focar no mapa 3D"
            >
              <MapPin className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Grid de Métricas de Engajamento */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-4 border-b border-raiz-border-dark text-raiz-text-light">
        <div>
          <span className="text-xs text-raiz-text-light/75 block">Fotos Registradas</span>
          <span className="text-base font-bold font-mono tabular-nums text-raiz-text-light">
            {item.capturasTotais.toLocaleString('pt-BR')}
          </span>
          <span className="text-[11px] text-raiz-accent block font-medium">
            + {item.compartilhamentosSociaisEstimados} shares
          </span>
        </div>

        <div>
          <span className="text-xs text-raiz-text-light/75 block">Alcance da Marca</span>
          <span className="text-base font-bold font-mono tabular-nums text-raiz-text-light">
            {(item.alcanceEstimadoRedes / 1000).toFixed(0)}k
          </span>
          <span className="text-[11px] text-raiz-text-light/55 block">
            impressões
          </span>
        </div>

        <div>
          <span className="text-xs text-raiz-text-light/75 block">Fila Atual</span>
          <div className="flex items-baseline gap-1">
            <span className="text-base font-bold font-mono tabular-nums text-raiz-text-light">
              {item.pessoasNaFila}
            </span>
            <span className="text-xs text-raiz-text-light/75">pessoas</span>
          </div>
          <span className="text-[11px] text-amber-400 block font-mono tabular-nums flex items-center gap-1">
            <Clock className="w-3 h-3 inline" /> ~{item.tempoEsperaMin} min
          </span>
        </div>

        <div>
          <span className="text-xs text-raiz-text-light/75 block">Avaliação & NPS</span>
          <div className="flex items-center gap-1.5">
            <span className="text-base font-bold font-mono tabular-nums text-raiz-text-light flex items-center gap-1">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              {item.avaliacaoMedia.toFixed(2)}
            </span>
            <span className="text-xs font-bold text-raiz-accent font-mono">
              +{item.npsScore}
            </span>
          </div>
          <span className="text-[11px] text-raiz-text-light/55 block">
            Dwell: ~{item.tempoPermanenciaMedioSegundos}s
          </span>
        </div>
      </div>

      {/* Cenografia & Controle de Iluminação */}
      <div className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <div 
            className="w-3.5 h-3.5 rounded-full shrink-0 border border-raiz-border-dark shadow-sm shadow-raiz-accent/50"
            style={{ backgroundColor: item.iluminacaoCenica.corPrincipal }}
          />
          <div className="text-xs text-raiz-text-light/75">
            <span className="font-semibold text-raiz-text-light">Iluminação: </span>
            <span className="text-raiz-accent">{item.iluminacaoCenica.modo}</span>
            <span className="text-raiz-text-light/55 font-mono text-[11px] ml-1">({item.iluminacaoCenica.intensidadePct}%)</span>
          </div>
        </div>

        {onMudarModoLuz && (
          <div className="flex items-center gap-1 overflow-x-auto py-0.5">
            {modosLuz.map((m) => (
              <button
                key={m}
                onClick={() => onMudarModoLuz(item.id, m)}
                className={`px-2 py-0.5 text-[11px] font-bold rounded transition-colors whitespace-nowrap shrink-0 ${
                  item.iluminacaoCenica.modo === m
                    ? 'bg-raiz-accent/10 border border-raiz-accent/60 text-raiz-accent shadow-sm shadow-raiz-accent/30'
                    : 'bg-raiz-dark border border-raiz-border-dark text-raiz-text-light/75 hover:bg-raiz-light/5'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Hashtags da Ativação */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
        <span className="text-raiz-text-light/55 text-[11px]">Hashtags:</span>
        {item.hashtagsPrincipais.map((tag) => (
          <span key={tag} className="text-raiz-accent font-semibold hover:underline cursor-pointer">
            {tag}
          </span>
        ))}
      </div>

      {/* Feed Social Expansível */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-raiz-border-dark animate-in fade-in duration-200">
          <div className="text-xs font-semibold text-raiz-text-light/75 mb-2 flex items-center justify-between">
            <span>Últimos Registros Sociais na Ativação</span>
            <span className="text-raiz-text-light/55 font-mono text-[10px]">QR Code & Totem Sync</span>
          </div>
          <div className="space-y-1.5">
            {item.fotosRecentes.map((f) => (
              <div key={f.id} className="flex items-center justify-between text-xs p-2 rounded-lg bg-raiz-dark border border-raiz-border-dark">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-raiz-accent/10 border border-raiz-accent/40 text-raiz-accent flex items-center justify-center font-bold text-[10px]">
                    {f.autor.charAt(1).toUpperCase()}
                  </div>
                  <span className="font-semibold text-raiz-text-light">{f.autor}</span>
                  <span className="text-raiz-text-light/55 text-[11px]">às {f.timestamp}</span>
                </div>
                <div className="flex items-center gap-1 text-rose-400 font-mono text-[11px]">
                  <Heart className="w-3 h-3 fill-rose-500 text-rose-500" />
                  <span>{f.likes}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Barra de Ações Operacionais */}
      <div className="mt-4 pt-3 border-b border-raiz-border-dark flex flex-wrap items-center justify-between gap-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-raiz-text-light/75 hover:text-raiz-text-light font-medium inline-flex items-center gap-1 py-1.5 px-2 rounded-md hover:bg-raiz-section transition-colors"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              <span>Recolher</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              <span>Ver Feed Social</span>
            </>
          )}
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onAlternarStatus(item.id)}
            className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors active:scale-95 ${
              item.status === 'pausado'
                ? 'bg-amber-950 border border-amber-600/50 text-amber-300'
                : 'text-raiz-text-light/75 bg-raiz-dark hover:bg-raiz-light/5 border border-raiz-border-dark'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {item.status === 'pausado' ? 'Reativar' : 'Pausa Técnica'}
            </span>
          </button>

          <button
            onClick={handleCapture}
            disabled={item.status === 'pausado'}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-raiz-text-dark bg-raiz-accent hover:bg-raiz-accent/90 disabled:opacity-50 rounded-lg shadow-lg shadow-raiz-accent/20 transition-all active:scale-95"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Registrar Foto</span>
          </button>
        </div>
      </div>
    </div>
  );
};