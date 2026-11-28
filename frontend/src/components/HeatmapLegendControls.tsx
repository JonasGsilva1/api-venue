import React, { useState } from 'react';
import {
  Flame,
  Sliders,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export interface HeatmapLegendControlsProps {
  /** Opacidade global do mapa de calor de 0.0 a 1.0 */
  intensity: number;
  /** Callback disparado ao alterar a opacidade */
  onIntensityChange: (newIntensity: number) => void;
  /** Classe CSS customizada */
  className?: string;
  /** Estado inicial de expansão do painel */
  defaultExpanded?: boolean;
  /** Modo noturno / diurno (opcional) */
  isNightMode?: boolean;
  /** Callback para alternar modo noturno (opcional) */
  onToggleNightMode?: () => void;
}

export const HeatmapLegendControls: React.FC<HeatmapLegendControlsProps> = ({
  intensity,
  onIntensityChange,
  className = '',
  defaultExpanded = true,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [lastNonZeroIntensity, setLastNonZeroIntensity] = useState(intensity > 0 ? intensity : 0.75);

  const percentage = Math.round(intensity * 100);
  const isHeatmapActive = intensity > 0.01;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    onIntensityChange(val);
    if (val > 0.05) {
      setLastNonZeroIntensity(val);
    }
  };

  const toggleHeatmapPower = () => {
    if (isHeatmapActive) {
      setLastNonZeroIntensity(intensity);
      onIntensityChange(0);
    } else {
      onIntensityChange(lastNonZeroIntensity || 0.75);
    }
  };

  return (
    <aside
      aria-label="Escala de Concentração e Controle de Calor"
      className={`z-20 transition-all duration-300 select-none ${className}`}
    >
      {/* Botão recolhido (badge compacto no topo) */}
      {!isExpanded && (
        <button
          onClick={() => setIsExpanded(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-raiz-dark/90 hover:bg-raiz-border-dark/95 backdrop-blur-md border border-raiz-border-dark/80 text-raiz-text-light shadow-xl hover:border-amber-500/50 transition-all group"
          title="Abrir escala de concentração e controles do mapa de calor"
        >
          <div className="relative">
            <Flame className={`w-4 h-4 ${isHeatmapActive ? 'text-amber-400 fill-amber-400/30 animate-pulse' : 'text-raiz-text-light/75'}`} />
            {isHeatmapActive && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            )}
          </div>
          <div className="flex flex-col text-left">
            <span className="text-[11px] font-bold text-raiz-text-light group-hover:text-amber-300 transition-colors">
              Concentração
            </span>
            <span className="text-[10px] font-mono text-raiz-accent">
              {isHeatmapActive ? `Opacidade ${percentage}%` : 'Desativado'}
            </span>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-raiz-text-light/75 group-hover:text-raiz-text-light transition-transform" />
        </button>
      )}

      {/* Painel Flutuante Completo */}
      {isExpanded && (
        <div className="w-[260px] sm:w-[280px] p-3.5 sm:p-4 rounded-2xl bg-raiz-dark/92 backdrop-blur-md border border-raiz-border-dark/80 shadow-2xl text-xs space-y-3.5 animate-in fade-in duration-200">
          {/* Cabeçalho do Painel */}
          <div className="flex items-center justify-between pb-2.5 border-b border-raiz-border-dark/90">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400">
                <Flame className="w-4 h-4 animate-pulse" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-raiz-text-light uppercase tracking-wide flex items-center gap-1.5">
                  Escala de Concentração
                </h3>
                <p className="text-[10px] text-raiz-text-light/75 font-medium">
                  Densidade de público na arena
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={toggleHeatmapPower}
                title={isHeatmapActive ? 'Desativar mapa de calor' : 'Ativar mapa de calor'}
                className={`p-1.5 rounded-lg transition-colors border ${
                  isHeatmapActive
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                    : 'bg-raiz-border-dark/80 text-raiz-text-light/75 border-raiz-border-dark hover:text-raiz-text-light'
                }`}
              >
                {isHeatmapActive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              </button>

              <button
                onClick={() => setIsExpanded(false)}
                title="Minimizar painel"
                className="p-1.5 rounded-lg text-raiz-text-light/75 hover:text-raiz-text-light hover:bg-raiz-border-dark/80 transition-colors"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Seção Central: Barra de Gradiente Vertical e Rótulos das 3 Zonas */}
          <div className="flex items-stretch gap-3.5 py-1 px-1">
            {/* Barra em Cápsula Arredondada com Gradiente Vertical Exato */}
            <div className="relative flex flex-col items-center">
              <div
                className="w-5 sm:w-5.5 h-44 sm:h-48 rounded-full relative shadow-inner shadow-black/80 border border-white/15 shrink-0 overflow-hidden"
                style={{
                  background:
                    'linear-gradient(to bottom, #ef4444 0%, #f97316 22%, #f59e0b 50%, #10b981 76%, #06b6d4 100%)',
                }}
              >
                {/* Linha indicadora de Alerta Crítico (>= 85%) */}
                <div
                  className="absolute left-0 right-0 h-0.5 bg-white/90 shadow-sm"
                  style={{ top: '15%' }}
                  title="Ponto crítico: >= 85%"
                />
                {/* Linha indicadora de Transição Média (~50%) */}
                <div
                  className="absolute left-0 right-0 h-0.5 bg-white/40"
                  style={{ top: '50%' }}
                />
                {/* Linha indicadora de Baixa Concentração (< 35%) */}
                <div
                  className="absolute left-0 right-0 h-0.5 bg-white/40"
                  style={{ top: '80%' }}
                />
              </div>
            </div>

            {/* Rótulos e Escalas de Concentração */}
            <div className="flex flex-col justify-between h-44 sm:h-48 py-0.5 select-none text-[11px] flex-1">
              {/* 1. Alta Concentração */}
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500 shadow-sm shadow-red-500/50" />
                  <span className="font-bold text-raiz-text-light text-xs leading-none">
                    Alta concentração
                  </span>
                </div>
                <div className="flex items-baseline justify-between mt-0.5 pl-3.5">
                  <span className="text-[10px] font-semibold text-rose-400 font-mono">
                    &ge; 85%
                  </span>
                  <span className="text-[9px] text-raiz-text-light/75 font-mono">
                    #ef4444
                  </span>
                </div>
                <span className="text-[10px] text-raiz-text-light/75 pl-3.5 leading-tight">
                  Vermelho / Laranja vivo
                </span>
              </div>

              {/* 2. Média Concentração */}
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 shadow-sm shadow-amber-500/50" />
                  <span className="font-bold text-raiz-text-light text-xs leading-none">
                    Média concentração
                  </span>
                </div>
                <div className="flex items-baseline justify-between mt-0.5 pl-3.5">
                  <span className="text-[10px] font-semibold text-amber-400 font-mono">
                    50% a 75%
                  </span>
                  <span className="text-[9px] text-raiz-text-light/75 font-mono">
                    #f59e0b
                  </span>
                </div>
                <span className="text-[10px] text-raiz-text-light/75 pl-3.5 leading-tight">
                  Amarelo / Transição
                </span>
              </div>

              {/* 3. Baixa Concentração */}
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-raiz-accent shadow-sm shadow-raiz-accent/50" />
                  <span className="font-bold text-raiz-text-light/75 text-xs leading-none">
                    Baixa concentração
                  </span>
                </div>
                <div className="flex items-baseline justify-between mt-0.5 pl-3.5">
                  <span className="text-[10px] font-semibold text-raiz-accent font-mono">
                    &lt; 35%
                  </span>
                  <span className="text-[9px] text-raiz-text-light/75 font-mono">
                    #10b981 / #06b6d4
                  </span>
                </div>
                <span className="text-[10px] text-raiz-text-light/75 pl-3.5 leading-tight">
                  Verde / Azul fluido
                </span>
              </div>
            </div>
          </div>

          {/* Controles de Intensidade (Slider em Tempo Real) */}
          <div className="pt-2.5 border-t border-raiz-border-dark/90 space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-raiz-text-light/75 font-semibold flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-raiz-accent" />
                Opacidade Global
              </span>
              <span className="font-mono font-bold text-raiz-accent bg-raiz-accent/10 px-1.5 py-0.5 rounded border border-raiz-accent/50 text-[10px]">
                {percentage}%
              </span>
            </div>

            <div className="relative flex items-center">
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={intensity}
                onChange={handleSliderChange}
                aria-label="Slider de intensidade do mapa de calor"
                className="w-full h-1.5 bg-raiz-border-dark rounded-lg appearance-none cursor-pointer accent-raiz-accent hover:accent-raiz-accent focus:outline-none"
              />
            </div>

            {/* Presets Rápidos de Opacidade */}
            <div className="grid grid-cols-4 gap-1 pt-0.5">
              {[
                { label: 'Off', val: 0 },
                { label: '40%', val: 0.4 },
                { label: '75%', val: 0.75 },
                { label: '100%', val: 1.0 },
              ].map((p) => {
                const isActive = Math.abs(intensity - p.val) < 0.04;
                return (
                  <button
                    key={p.label}
                    onClick={() => onIntensityChange(p.val)}
                    className={`py-1 text-[10px] font-medium rounded-md transition-colors border ${
                      isActive
                        ? 'bg-raiz-accent text-raiz-text-dark font-bold border-raiz-accent/40 shadow-sm shadow-raiz-accent/20'
                        : 'bg-raiz-dark/70 text-raiz-text-light/75 border-raiz-border-dark hover:bg-raiz-border-dark hover:text-raiz-text-light'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
