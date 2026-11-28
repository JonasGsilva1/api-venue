import React from 'react';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { SeloSimulado } from './SeloSimulado';

export interface KpiCardProps {
  titulo: string;
  /** Valor principal já formatado (ex.: "47", "36,4%", "2m 27s"). */
  valor: string;
  /** Linha de apoio abaixo do valor. */
  detalhe?: string;
  icone: LucideIcon;
  /** Marca o card como dado fictício. */
  simulated?: boolean;
  /** Mostra o valor como "carregando". */
  carregando?: boolean;
  /** Conteúdo extra abaixo do detalhe (barras, gráficos pequenos...). */
  children?: React.ReactNode;
  className?: string;
}

// Card de indicador com superfícies e bordas da paleta RAIZ.
export const KpiCard: React.FC<KpiCardProps> = ({
  titulo,
  valor,
  detalhe,
  icone: Icone,
  simulated = false,
  carregando = false,
  children,
  className,
}) => (
  <div className={clsx('rounded-xl border border-raiz-border-dark bg-raiz-section p-4', className)}>
    <div className="flex items-start justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <Icone size={16} className="text-raiz-accent shrink-0" aria-hidden="true" />
        <h3 className="text-[11px] font-semibold text-raiz-text-light/75 uppercase tracking-wider truncate">
          {titulo}
        </h3>
      </div>
      {simulated && <SeloSimulado />}
    </div>
    <p
      className={clsx(
        'mt-3 font-mono text-2xl font-bold text-raiz-text-light',
        carregando && 'text-raiz-text-light/55 motion-safe:animate-pulse',
      )}
      aria-busy={carregando}
    >
      {carregando ? '—' : valor}
    </p>
    {detalhe && <p className="mt-1 text-[11px] text-raiz-text-light/55">{detalhe}</p>}
    {children}
  </div>
);
