import React, { useState, useId } from 'react';
import clsx from 'clsx';
import {
  TrendingUp,
  Users,
  Clock,
  Sparkles,
  BarChart3,
  LineChart,
  Layers,
  ShoppingBag,
  Award,
  CheckCircle2,
} from 'lucide-react';

export interface FluxoHorarioDia {
  hora: string;
  d1: number;
  d2: number;
  d3: number;
}

export interface SetorDesempenho {
  setor: string;
  codigo: string;
  d1: number;
  d2: number;
  d3: number;
  capacidade: number;
}

// Dados simulados realistas calibrados para os 3 dias do evento RAIZ
const FLUXO_HORARIO_D1_D3: FluxoHorarioDia[] = [
  { hora: '09:00', d1: 35, d2: 45, d3: 60 },
  { hora: '10:00', d1: 65, d2: 85, d3: 110 },
  { hora: '11:00', d1: 95, d2: 130, d3: 165 },
  { hora: '12:00', d1: 110, d2: 155, d3: 195 },
  { hora: '13:00', d1: 85, d2: 125, d3: 160 },
  { hora: '14:00', d1: 120, d2: 180, d3: 240 }, // Pico da tarde
  { hora: '15:00', d1: 105, d2: 170, d3: 225 },
  { hora: '16:00', d1: 90, d2: 145, d3: 210 },
  { hora: '17:00', d1: 75, d2: 120, d3: 180 },
  { hora: '18:00', d1: 50, d2: 85, d3: 135 },
  { hora: '19:00', d1: 30, d2: 50, d3: 95 },
];

const SETORES_COMPARATIVO: SetorDesempenho[] = [
  { setor: 'Balcão Principal & Bar', codigo: 'Z1', d1: 280, d2: 390, d3: 490, capacidade: 20 },
  { setor: 'Lounge Poltronas', codigo: 'Z2', d1: 140, d2: 185, d3: 230, capacidade: 10 },
  { setor: 'Entrada & Circulação', codigo: 'Z3', d1: 320, d2: 440, d3: 560, capacidade: 15 },
  { setor: 'Mesas Café & Reunião', codigo: 'Z4', d1: 110, d2: 160, d3: 210, capacidade: 8 },
  { setor: 'Espaço Autosserviço', codigo: 'Z5', d1: 95, d2: 140, d3: 195, capacidade: 8 },
  { setor: 'Painel Instagramável', codigo: 'Z6', d1: 135, d2: 195, d3: 265, capacidade: 12 },
];

export const SinteseD1D3View: React.FC = () => {
  const prefixo = useId().replace(/:/g, '');

  // Controles interativos
  const [diaFiltro, setDiaFiltro] = useState<'todos' | 'd1' | 'd2' | 'd3'>('todos');
  const [tipoGrafico, setTipoGrafico] = useState<'barras' | 'linhas'>('barras');
  const [horaHover, setHoraHover] = useState<FluxoHorarioDia | null>(null);

  // Totais agregados
  const totalD1 = FLUXO_HORARIO_D1_D3.reduce((s, h) => s + h.d1, 0);
  const totalD2 = FLUXO_HORARIO_D1_D3.reduce((s, h) => s + h.d2, 0);
  const totalD3 = FLUXO_HORARIO_D1_D3.reduce((s, h) => s + h.d3, 0);
  const totalGeral = totalD1 + totalD2 + totalD3;

  // Pico máximo para escala gráfica
  const maxValorHora = Math.max(
    ...FLUXO_HORARIO_D1_D3.map((h) => Math.max(h.d1, h.d2, h.d3))
  );

  return (
    <div className="space-y-6">
      {/* 1. CABEÇALHO */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-gray-100">Síntese Multidiária D1–D3</h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider uppercase bg-[#FFD600]/20 text-[#FFD600] border border-[#FFD600]/40">
              Consolidação do Estande RAIZ
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            Análise comparativa de fluxo, picos horários e retenção de público ao longo dos 3 dias de evento
          </p>
        </div>

        {/* Controles de visualização */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Seletor de dia */}
          <div className="flex items-center bg-[#111827] p-1 rounded-lg border border-[#1E293B] text-xs">
            <button
              type="button"
              onClick={() => setDiaFiltro('todos')}
              className={clsx(
                'px-2.5 py-1 rounded font-medium transition-colors',
                diaFiltro === 'todos'
                  ? 'bg-[#FFD600] text-[#090D16] font-bold shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              )}
            >
              Comparar D1–D3
            </button>
            <button
              type="button"
              onClick={() => setDiaFiltro('d1')}
              className={clsx(
                'px-2.5 py-1 rounded font-medium transition-colors',
                diaFiltro === 'd1'
                  ? 'bg-[#38BDF8] text-[#090D16] font-bold shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              )}
            >
              D1
            </button>
            <button
              type="button"
              onClick={() => setDiaFiltro('d2')}
              className={clsx(
                'px-2.5 py-1 rounded font-medium transition-colors',
                diaFiltro === 'd2'
                  ? 'bg-[#F59E0B] text-[#090D16] font-bold shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              )}
            >
              D2
            </button>
            <button
              type="button"
              onClick={() => setDiaFiltro('d3')}
              className={clsx(
                'px-2.5 py-1 rounded font-medium transition-colors',
                diaFiltro === 'd3'
                  ? 'bg-[#FFD600] text-[#090D16] font-bold shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              )}
            >
              D3 (Pico)
            </button>
          </div>

          {/* Alternar formato gráfico */}
          <div className="flex items-center bg-[#111827] p-1 rounded-lg border border-[#1E293B] text-xs gap-1">
            <button
              type="button"
              onClick={() => setTipoGrafico('barras')}
              title="Gráfico em barras comparativas"
              className={clsx(
                'p-1.5 rounded transition-all',
                tipoGrafico === 'barras'
                  ? 'bg-gray-800 text-[#FFD600]'
                  : 'text-gray-400 hover:text-white'
              )}
            >
              <BarChart3 size={15} />
            </button>
            <button
              type="button"
              onClick={() => setTipoGrafico('linhas')}
              title="Gráfico em curvas sobrepostas"
              className={clsx(
                'p-1.5 rounded transition-all',
                tipoGrafico === 'linhas'
                  ? 'bg-gray-800 text-[#FFD600]'
                  : 'text-gray-400 hover:text-white'
              )}
            >
              <LineChart size={15} />
            </button>
          </div>
        </div>
      </header>

      {/* 2. CARDS RESUMO DOS TRÊS DIAS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Total Geral */}
        <div className="p-4 rounded-xl bg-[#111827] border border-[#1E293B] shadow-lg">
          <div className="flex items-center justify-between text-gray-400 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Total Acumulado D1–D3</span>
            <Users size={16} className="text-[#FFD600]" />
          </div>
          <p className="font-mono text-2xl font-bold text-gray-100 mt-2">
            {totalGeral.toLocaleString('pt-BR')} <span className="text-sm font-normal text-gray-400">visitas</span>
          </p>
          <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-400">
            <span className="font-mono text-emerald-400 font-semibold">+34.8%</span>
            <span>crescimento acumulado</span>
          </div>
        </div>

        {/* KPI 2: D1 (Abertura) */}
        <div
          onClick={() => setDiaFiltro((prev) => (prev === 'd1' ? 'todos' : 'd1'))}
          className={clsx(
            'p-4 rounded-xl bg-[#111827] border cursor-pointer transition-all shadow-lg hover:border-[#38BDF8]/60',
            diaFiltro === 'd1' ? 'border-[#38BDF8] ring-1 ring-[#38BDF8]/40' : 'border-[#1E293B]'
          )}
        >
          <div className="flex items-center justify-between text-gray-400 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[10px] text-[#38BDF8]">
              Dia 1 — Abertura
            </span>
            <span className="size-2.5 rounded-full bg-[#38BDF8]" />
          </div>
          <p className="font-mono text-2xl font-bold text-gray-100 mt-2">
            {totalD1.toLocaleString('pt-BR')} <span className="text-xs font-normal text-gray-400">({Math.round((totalD1 / totalGeral) * 100)}%)</span>
          </p>
          <div className="mt-2 flex items-center justify-between text-[11px] text-gray-400">
            <span>Pico: 14h (120 p/h)</span>
            <span className="text-gray-300 font-mono">Fila: 2m 45s</span>
          </div>
        </div>

        {/* KPI 3: D2 (Negócios & Plenárias) */}
        <div
          onClick={() => setDiaFiltro((prev) => (prev === 'd2' ? 'todos' : 'd2'))}
          className={clsx(
            'p-4 rounded-xl bg-[#111827] border cursor-pointer transition-all shadow-lg hover:border-[#F59E0B]/60',
            diaFiltro === 'd2' ? 'border-[#F59E0B] ring-1 ring-[#F59E0B]/40' : 'border-[#1E293B]'
          )}
        >
          <div className="flex items-center justify-between text-gray-400 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[10px] text-[#F59E0B]">
              Dia 2 — Plenárias
            </span>
            <span className="size-2.5 rounded-full bg-[#F59E0B]" />
          </div>
          <p className="font-mono text-2xl font-bold text-gray-100 mt-2">
            {totalD2.toLocaleString('pt-BR')} <span className="text-xs font-normal text-gray-400">({Math.round((totalD2 / totalGeral) * 100)}%)</span>
          </p>
          <div className="mt-2 flex items-center justify-between text-[11px] text-gray-400">
            <span>Pico: 14h (180 p/h)</span>
            <span className="text-gray-300 font-mono">Fila: 3m 40s</span>
          </div>
        </div>

        {/* KPI 4: D3 (Encerramento & Recorde) */}
        <div
          onClick={() => setDiaFiltro((prev) => (prev === 'd3' ? 'todos' : 'd3'))}
          className={clsx(
            'p-4 rounded-xl bg-[#111827] border cursor-pointer transition-all shadow-lg hover:border-[#FFD600]/60',
            diaFiltro === 'd3' ? 'border-[#FFD600] ring-1 ring-[#FFD600]/40' : 'border-[#1E293B]'
          )}
        >
          <div className="flex items-center justify-between text-gray-400 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[10px] text-[#FFD600] flex items-center gap-1">
              <Award size={13} />
              Dia 3 — Pico Recorde
            </span>
            <span className="size-2.5 rounded-full bg-[#FFD600]" />
          </div>
          <p className="font-mono text-2xl font-bold text-gray-100 mt-2">
            {totalD3.toLocaleString('pt-BR')} <span className="text-xs font-normal text-gray-400">({Math.round((totalD3 / totalGeral) * 100)}%)</span>
          </p>
          <div className="mt-2 flex items-center justify-between text-[11px] text-gray-400">
            <span>Pico: 14h (240 p/h)</span>
            <span className="text-rose-400 font-mono font-semibold">Fila: 4m 50s</span>
          </div>
        </div>
      </div>

      {/* 3. GRÁFICO COMPARATIVO HORÁRIO (SVG DARK MODE) */}
      <div className="rounded-xl bg-[#111827] border border-[#1E293B] p-5 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h3 className="text-sm font-bold text-gray-100 uppercase tracking-wider flex items-center gap-2">
              <TrendingUp size={16} className="text-[#FFD600]" />
              Curva de Fluxo de Pessoas por Hora (D1 vs. D2 vs. D3)
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Comparação da intensidade de circulação hora a hora no pavilhão
            </p>
          </div>

          {/* Legenda visual dos dias */}
          <div className="flex items-center gap-4 text-xs font-medium">
            {(diaFiltro === 'todos' || diaFiltro === 'd1') && (
              <span className="flex items-center gap-1.5 text-gray-300">
                <span className="size-2.5 rounded-full bg-[#38BDF8]" /> D1 (Abertura)
              </span>
            )}
            {(diaFiltro === 'todos' || diaFiltro === 'd2') && (
              <span className="flex items-center gap-1.5 text-gray-300">
                <span className="size-2.5 rounded-full bg-[#F59E0B]" /> D2 (Intermediário)
              </span>
            )}
            {(diaFiltro === 'todos' || diaFiltro === 'd3') && (
              <span className="flex items-center gap-1.5 text-gray-300">
                <span className="size-2.5 rounded-full bg-[#FFD600]" /> D3 (Encerramento)
              </span>
            )}
          </div>
        </div>

        {/* GRÁFICO EM BARRAS AGRUPADAS OU LINHAS SUAVES */}
        {tipoGrafico === 'barras' ? (
          <div className="pt-2">
            <div className="grid grid-cols-11 gap-1 sm:gap-2">
              {FLUXO_HORARIO_D1_D3.map((item, idx) => {
                const altD1 = Math.round((item.d1 / maxValorHora) * 100);
                const altD2 = Math.round((item.d2 / maxValorHora) * 100);
                const altD3 = Math.round((item.d3 / maxValorHora) * 100);
                const isHovered = horaHover?.hora === item.hora;

                return (
                  <div
                    key={idx}
                    onMouseEnter={() => setHoraHover(item)}
                    onMouseLeave={() => setHoraHover(null)}
                    className={clsx(
                      'flex flex-col items-center group cursor-pointer p-1 rounded-lg transition-all',
                      isHovered ? 'bg-[#090D16] border border-[#1E293B]' : ''
                    )}
                  >
                    {/* Tooltip flutuante no hover */}
                    <div className="h-6 flex items-center justify-center">
                      {isHovered ? (
                        <span className="text-[10px] font-mono font-bold text-[#FFD600] animate-fadeIn">
                          {diaFiltro === 'd1'
                            ? `${item.d1}p`
                            : diaFiltro === 'd2'
                            ? `${item.d2}p`
                            : diaFiltro === 'd3'
                            ? `${item.d3}p`
                            : `${item.d1 + item.d2 + item.d3}p`}
                        </span>
                      ) : (
                        <span className="text-[9px] font-mono text-gray-500 opacity-60">
                          {Math.max(item.d1, item.d2, item.d3)}
                        </span>
                      )}
                    </div>

                    {/* Contêiner das barras */}
                    <div className="w-full h-44 bg-[#090D16] rounded-lg p-1 border border-[#1E293B] flex items-end justify-center gap-1">
                      {/* Barra D1 */}
                      {(diaFiltro === 'todos' || diaFiltro === 'd1') && (
                        <div
                          className="w-full max-w-[10px] rounded-t bg-[#38BDF8] transition-all duration-500 group-hover:brightness-110"
                          style={{ height: `${altD1}%` }}
                          title={`D1 às ${item.hora}: ${item.d1} pessoas`}
                        />
                      )}

                      {/* Barra D2 */}
                      {(diaFiltro === 'todos' || diaFiltro === 'd2') && (
                        <div
                          className="w-full max-w-[10px] rounded-t bg-[#F59E0B] transition-all duration-500 group-hover:brightness-110"
                          style={{ height: `${altD2}%` }}
                          title={`D2 às ${item.hora}: ${item.d2} pessoas`}
                        />
                      )}

                      {/* Barra D3 */}
                      {(diaFiltro === 'todos' || diaFiltro === 'd3') && (
                        <div
                          className="w-full max-w-[10px] rounded-t bg-[#FFD600] transition-all duration-500 group-hover:brightness-110"
                          style={{ height: `${altD3}%` }}
                          title={`D3 às ${item.hora}: ${item.d3} pessoas`}
                        />
                      )}
                    </div>

                    {/* Eixo X: Horário */}
                    <span className="text-[10px] font-mono text-gray-400 mt-2 truncate w-full text-center">
                      {item.hora}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Visualização alternativa em SVG Curvas Contínuas */
          <div className="relative pt-2">
            <svg viewBox="0 0 1000 240" className="w-full h-52">
              <defs>
                <linearGradient id={`${prefixo}-grad-d1`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id={`${prefixo}-grad-d2`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id={`${prefixo}-grad-d3`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FFD600" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#FFD600" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grade de fundo */}
              {[40, 90, 140, 190].map((y, i) => (
                <line
                  key={i}
                  x1="30"
                  y1={y}
                  x2="970"
                  y2={y}
                  stroke="#1E293B"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
              ))}

              {/* Curvas calculadas para cada dia */}
              {(() => {
                const step = 940 / (FLUXO_HORARIO_D1_D3.length - 1);
                const getY = (val: number) => 210 - (val / maxValorHora) * 170;

                const ptsD1 = FLUXO_HORARIO_D1_D3.map((h, i) => `${30 + i * step},${getY(h.d1)}`).join(' ');
                const ptsD2 = FLUXO_HORARIO_D1_D3.map((h, i) => `${30 + i * step},${getY(h.d2)}`).join(' ');
                const ptsD3 = FLUXO_HORARIO_D1_D3.map((h, i) => `${30 + i * step},${getY(h.d3)}`).join(' ');

                return (
                  <g>
                    {/* D1 */}
                    {(diaFiltro === 'todos' || diaFiltro === 'd1') && (
                      <polyline
                        points={ptsD1}
                        fill="none"
                        stroke="#38BDF8"
                        strokeWidth="3"
                        strokeLinecap="round"
                      />
                    )}

                    {/* D2 */}
                    {(diaFiltro === 'todos' || diaFiltro === 'd2') && (
                      <polyline
                        points={ptsD2}
                        fill="none"
                        stroke="#F59E0B"
                        strokeWidth="3"
                        strokeLinecap="round"
                      />
                    )}

                    {/* D3 */}
                    {(diaFiltro === 'todos' || diaFiltro === 'd3') && (
                      <polyline
                        points={ptsD3}
                        fill="none"
                        stroke="#FFD600"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                      />
                    )}

                    {/* Pontos nos picos */}
                    {FLUXO_HORARIO_D1_D3.map((h, i) => {
                      const x = 30 + i * step;
                      return (
                        <g key={i}>
                          {(diaFiltro === 'todos' || diaFiltro === 'd3') && (
                            <circle cx={x} cy={getY(h.d3)} r="4" fill="#090D16" stroke="#FFD600" strokeWidth="2" />
                          )}
                          <text x={x} y="235" textAnchor="middle" fontSize="10" fill="#9CA3AF" fontFamily="monospace">
                            {h.hora}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                );
              })()}
            </svg>
          </div>
        )}

        {/* Detalhe do hover se selecionado */}
        {horaHover && (
          <div className="mt-4 p-3 rounded-xl bg-[#090D16] border border-[#1E293B] flex flex-wrap items-center justify-between text-xs animate-fadeIn">
            <span className="font-mono text-gray-300 font-semibold">
              Horário selecionado: <span className="text-[#FFD600]">{horaHover.hora}</span>
            </span>
            <div className="flex items-center gap-6 font-mono text-[11px]">
              <span className="text-[#38BDF8]">D1: {horaHover.d1} pess.</span>
              <span className="text-[#F59E0B]">D2: {horaHover.d2} pess.</span>
              <span className="text-[#FFD600] font-bold">D3: {horaHover.d3} pess. (Recorde)</span>
              <span className="text-gray-400">Total na hora: {horaHover.d1 + horaHover.d2 + horaHover.d3} pess.</span>
            </div>
          </div>
        )}
      </div>

      {/* 4. COMPARATIVO DE ACUMULADO POR SETOR DO ESTANDE */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Desempenho por setor do estande */}
        <div className="rounded-xl bg-[#111827] border border-[#1E293B] p-5 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-gray-100 uppercase tracking-wider flex items-center gap-2">
                <Layers size={16} className="text-[#FFD600]" />
                Volume Acumulado por Setor
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Comparativo de atratividade e circulação por área do estande
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {SETORES_COMPARATIVO.map((s) => {
              const maxSetor = Math.max(...SETORES_COMPARATIVO.map((item) => item.d3));
              const pctD1 = (s.d1 / maxSetor) * 100;
              const pctD2 = (s.d2 / maxSetor) * 100;
              const pctD3 = (s.d3 / maxSetor) * 100;
              const totalSetor = s.d1 + s.d2 + s.d3;

              return (
                <div key={s.codigo} className="space-y-1.5 p-2.5 rounded-lg bg-[#090D16] border border-[#1E293B]">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-[#FFD600]">{s.codigo}</span>
                      <span className="font-medium text-gray-200">{s.setor}</span>
                    </div>
                    <span className="font-mono text-gray-300 font-semibold">{totalSetor} visitas</span>
                  </div>

                  {/* Barras comparativas horizontais D1, D2, D3 */}
                  <div className="space-y-1 pt-1">
                    {(diaFiltro === 'todos' || diaFiltro === 'd1') && (
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className="w-5 font-mono text-[#38BDF8]">D1</span>
                        <div className="h-1.5 flex-1 bg-[#111827] rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-[#38BDF8]" style={{ width: `${pctD1}%` }} />
                        </div>
                        <span className="font-mono text-gray-400 w-8 text-right">{s.d1}</span>
                      </div>
                    )}

                    {(diaFiltro === 'todos' || diaFiltro === 'd2') && (
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className="w-5 font-mono text-[#F59E0B]">D2</span>
                        <div className="h-1.5 flex-1 bg-[#111827] rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-[#F59E0B]" style={{ width: `${pctD2}%` }} />
                        </div>
                        <span className="font-mono text-gray-400 w-8 text-right">{s.d2}</span>
                      </div>
                    )}

                    {(diaFiltro === 'todos' || diaFiltro === 'd3') && (
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className="w-5 font-mono text-[#FFD600]">D3</span>
                        <div className="h-1.5 flex-1 bg-[#111827] rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-[#FFD600]" style={{ width: `${pctD3}%` }} />
                        </div>
                        <span className="font-mono text-gray-300 font-bold w-8 text-right">{s.d3}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Resumo executivo de conclusões operacionais */}
        <div className="rounded-xl bg-[#111827] border border-[#1E293B] p-5 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={18} className="text-[#FFD600]" />
              <h3 className="text-sm font-bold text-gray-100 uppercase tracking-wider">
                Insights Táticos dos 3 Dias
              </h3>
            </div>
            <p className="text-xs text-gray-400 mb-4">
              Síntese automatizada de inteligência de público para futuras edições
            </p>

            <div className="space-y-3">
              <div className="p-3.5 rounded-lg bg-[#090D16] border border-[#1E293B]">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                  <span className="text-xs font-bold text-gray-200">
                    Crescimento Contínuo D1 ➔ D3 (+63.8%)
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                  O fluxo subiu gradativamente de 720 (D1) para 940 (D2) e 1.180 (D3). O boca a boca do painel instagramável impulsionou o maior volume no último dia.
                </p>
              </div>

              <div className="p-3.5 rounded-lg bg-[#090D16] border border-[#1E293B]">
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-[#FFD600] shrink-0" />
                  <span className="text-xs font-bold text-gray-200">
                    Janela Crítica de Fila: 13h30 às 15h30
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                  Em todos os dias o pico ocorreu imediatamente após o almoço. O acionamento do push de redirecionamento para autosserviço no D3 reduziu o tempo de espera em 32%.
                </p>
              </div>

              <div className="p-3.5 rounded-lg bg-[#090D16] border border-[#1E293B]">
                <div className="flex items-center gap-2">
                  <ShoppingBag size={16} className="text-cyan-400 shrink-0" />
                  <span className="text-xs font-bold text-gray-200">
                    Autosserviço absorveu 38% das demandas simples
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                  Kits e brindes retirados nos totens liberaram a equipe do balcão para focar em conversas qualificadas e demonstrações técnicas da plataforma.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-[#1E293B] flex items-center justify-between text-xs text-gray-400">
            <span>Fonte: Sensores de Telemetria RAIZ</span>
            <span className="font-mono text-[#FFD600] font-bold">Relatório Consolidado 100% OK</span>
          </div>
        </div>
      </div>
    </div>
  );
};
