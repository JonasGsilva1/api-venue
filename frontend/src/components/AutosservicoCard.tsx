import React, { useState } from 'react';
import { 
  Beer, 
  Clock, 
  Thermometer, 
  Gauge, 
  RefreshCw, 
  Wrench, 
  ChevronDown, 
  ChevronUp, 
  MapPin, 
  AlertTriangle, 
  XCircle,
  PackageCheck,
} from 'lucide-react';
import type { AutosservicoItem, StatusAutosservico } from '../types/venue';

interface AutosservicoCardProps {
  item: AutosservicoItem;
  isSelected?: boolean;
  onReabastecer: (id: string) => void;
  onToggleManutencao: (id: string) => void;
  onSelectIn3D?: (id: string) => void;
}

export const AutosservicoCard: React.FC<AutosservicoCardProps> = ({
  item,
  isSelected = false,
  onReabastecer,
  onToggleManutencao,
  onSelectIn3D,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [toastFeedback, setToastFeedback] = useState<string | null>(null);

  const pctInsumo = Math.round((item.nivelAtualInsumo / item.capacidadeTotalInsumo) * 100);
  const pctCopos = Math.round((item.nivelCopos / item.capacidadeCopos) * 100);

  const handleRefill = () => {
    onReabastecer(item.id);
    setToastFeedback('Tanques e copos reabastecidos!');
    setTimeout(() => setToastFeedback(null), 2500);
  };

  const getStatusDisplay = (status: StatusAutosservico) => {
    switch (status) {
      case 'operacional':
        return {
          label: 'NORMAL',
          icon: <span className="w-2 h-2 rounded-full bg-raiz-accent inline-block animate-pulse" />,
          colorClass: 'text-raiz-accent bg-raiz-accent/10 border-raiz-accent/40',
        };
      case 'atencao':
        return {
          label: 'DÉFICIT INSUMO',
          icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />,
          colorClass: 'text-amber-300 bg-amber-950/60 border-amber-500/40',
        };
      case 'critico':
        return {
          label: 'CRÍTICO / FILA',
          icon: <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />,
          colorClass: 'text-rose-300 bg-rose-950/60 border-rose-500/50',
        };
      case 'manutencao':
        return {
          label: 'MANUTENÇÃO',
          icon: <XCircle className="w-3.5 h-3.5 text-raiz-text-light/75" />,
          colorClass: 'text-raiz-text-light/75 bg-raiz-dark border-raiz-border-dark',
        };
    }
  };

  const statusInfo = getStatusDisplay(item.status);

  return (
    <div 
      className={`relative rounded-xl border p-5 transition-all duration-200 shadow-xl ${
        isSelected 
          ? 'border-raiz-accent/40 bg-raiz-section ring-2 ring-raiz-accent/30'
          : 'border-raiz-border-dark bg-raiz-section hover:border-raiz-border-dark'
      }`}
    >
      {/* Toast Feedback */}
      {toastFeedback && (
        <div className="absolute top-3 right-3 z-10 flex items-center gap-2 rounded-lg bg-raiz-dark border border-raiz-accent/40 px-3 py-1.5 text-xs font-medium text-raiz-accent shadow-2xl animate-in fade-in duration-150">
          <PackageCheck className="w-3.5 h-3.5 text-raiz-accent" />
          <span>{toastFeedback}</span>
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
            <span className="text-raiz-accent font-mono text-[11px]">{item.tipoInsumo}</span>
          </div>
          <h3 className="mt-1 text-base font-bold text-raiz-text-light tracking-tight flex items-center gap-2">
            <Beer className="w-4 h-4 text-raiz-accent shrink-0" />
            <span>{item.nome}</span>
          </h3>
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

      {/* Grid de Métricas Principais */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-4 border-b border-raiz-border-dark text-raiz-text-light">
        <div>
          <span className="text-xs text-raiz-text-light/75 block">Receita Acumulada</span>
          <span className="text-base font-bold font-mono tabular-nums text-raiz-text-light">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.receitaTotal)}
          </span>
          <span className="text-[11px] text-raiz-text-light/55 block font-mono tabular-nums">
            {item.transacoesAcumuladas} transações
          </span>
        </div>

        <div>
          <span className="text-xs text-raiz-text-light/75 block">Ticket Médio</span>
          <span className="text-base font-bold font-mono tabular-nums text-raiz-accent">
            R$ {item.ticketMedio.toFixed(2)}
          </span>
          <span className="text-[11px] text-raiz-text-light/55 block font-mono tabular-nums">
            por cliente
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
            <Clock className="w-3 h-3 inline" /> ~{item.tempoEstimadoEsperaMin} min
          </span>
        </div>

        <div>
          <span className="text-xs text-raiz-text-light/75 block">Throughput</span>
          <div className="flex items-baseline gap-1">
            <span className="text-base font-bold font-mono tabular-nums text-raiz-accent">
              {item.tempoMedioAtendimentoSegundos}s
            </span>
            <span className="text-xs text-raiz-accent font-mono text-[10px]">ágil</span>
          </div>
          <span className="text-[11px] text-raiz-text-light/55 block">
            {item.ultimoAbastecimento}
          </span>
        </div>
      </div>

      {/* Barras de Nível de Insumo & Copos */}
      <div className="py-3.5 space-y-2.5">
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-raiz-text-light/75 font-medium flex items-center gap-1.5">
              <span>Nível de Chopp / Insumo</span>
              <span className="text-raiz-text-light/55 font-mono">({item.nivelAtualInsumo}{item.unidadeMedida} / {item.capacidadeTotalInsumo}{item.unidadeMedida})</span>
            </span>
            <span className={`font-mono font-bold tabular-nums ${pctInsumo < 25 ? 'text-rose-400' : pctInsumo < 40 ? 'text-amber-400' : 'text-raiz-accent'}`}>
              {pctInsumo}%
            </span>
          </div>
          <div className="h-2 w-full bg-raiz-dark border border-raiz-border-dark rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-500 rounded-full ${
                pctInsumo < 25 ? 'bg-gradient-to-r from-rose-600 to-rose-400' : pctInsumo < 45 ? 'bg-gradient-to-r from-amber-600 to-amber-400' : 'bg-gradient-to-r from-raiz-accent to-raiz-accent'
              }`}
              style={{ width: `${Math.max(2, Math.min(100, pctInsumo))}%` }}
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-raiz-text-light/75 font-medium flex items-center gap-1.5">
              <span>Disponibilidade de Copos</span>
              <span className="text-raiz-text-light/55 font-mono">({item.nivelCopos} / {item.capacidadeCopos})</span>
            </span>
            <span className={`font-mono font-bold tabular-nums ${pctCopos < 25 ? 'text-rose-400' : 'text-raiz-accent'}`}>
              {pctCopos}%
            </span>
          </div>
          <div className="h-1.5 w-full bg-raiz-dark border border-raiz-border-dark rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-500 rounded-full ${
                pctCopos < 25 ? 'bg-rose-500' : 'bg-raiz-accent'
              }`}
              style={{ width: `${Math.max(2, Math.min(100, pctCopos))}%` }}
            />
          </div>
        </div>
      </div>

      {/* Telemetria de Hardware */}
      {(item.temperaturaC !== undefined || item.pressaoPsi !== undefined) && (
        <div className="flex items-center gap-4 py-2 text-xs text-raiz-text-light/75 border-t border-raiz-border-dark font-mono">
          {item.temperaturaC !== undefined && (
            <span className="flex items-center gap-1">
              <Thermometer className="w-3.5 h-3.5 text-raiz-accent" />
              <span>Chiller: <strong className="text-raiz-text-light">{item.temperaturaC.toFixed(1)}°C</strong></span>
            </span>
          )}
          {item.pressaoPsi !== undefined && item.pressaoPsi > 0 && (
            <span className="flex items-center gap-1">
              <Gauge className="w-3.5 h-3.5 text-raiz-accent" />
              <span>CO2: <strong className="text-raiz-text-light">{item.pressaoPsi.toFixed(1)} PSI</strong></span>
            </span>
          )}
        </div>
      )}

      {/* Histórico Horário Expansível */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-raiz-border-dark animate-in fade-in duration-200">
          <div className="text-xs font-semibold text-raiz-text-light/75 mb-2 flex items-center justify-between">
            <span>Telemetria de Vendas por Hora</span>
            <span className="text-raiz-text-light/55 font-mono text-[10px]">Gateway: api-evento-ia</span>
          </div>
          <div className="grid grid-cols-5 gap-1.5 text-center">
            {item.consumoPorHora.map((h) => (
              <div key={h.hora} className="bg-raiz-dark p-2 rounded-lg border border-raiz-border-dark">
                <span className="text-[11px] text-raiz-text-light/75 font-mono block">{h.hora}</span>
                <span className="text-xs font-bold text-raiz-text-light font-mono tabular-nums block">
                  {h.transacoes}
                </span>
                <span className="text-[10px] text-raiz-accent font-mono block">
                  R$ {h.receita}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Barra de Ações Operacionais */}
      <div className="mt-4 pt-3 border-t border-raiz-border-dark flex flex-wrap items-center justify-between gap-2">
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
              <span>Telemetria Horária</span>
            </>
          )}
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefill}
            title="Reabastecer tanque e copos para 100%"
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-amber-300 bg-amber-950/40 border border-amber-600/50 hover:bg-amber-900/50 rounded-lg transition-colors active:scale-95"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Repor</span>
          </button>

          <button
            onClick={() => onToggleManutencao(item.id)}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors active:scale-95 ${
              item.status === 'manutencao'
                ? 'bg-rose-950 border border-rose-500/50 text-rose-300'
                : 'text-raiz-text-light/75 bg-raiz-dark hover:bg-raiz-light/5 border border-raiz-border-dark'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {item.status === 'manutencao' ? 'Reativar' : 'Pausar'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};