import React, { useId } from 'react';
import clsx from 'clsx';
import { Flame } from 'lucide-react';
import type { EstadoOperacional, MapaCalorGlobal, StatusCor, ZonaPublico } from '../../types/publico';
import { formatarDuracao } from '../../utils/publico';
import {
  GRADIENTE_LEGENDA,
  LIMITE_ALERTA_OCUPACAO,
  corDeCalor,
  intensidadeDeCalor,
} from '../../utils/heatmap';
import { SeloSimulado } from './SeloSimulado';

export interface HeatmapCardProps {
  zonas: ZonaPublico[];
  global?: MapaCalorGlobal | null;
  loading?: boolean;
  error?: string | null;
  simulated?: boolean;
  className?: string;
}

const ESTADO_OPERACIONAL: Record<EstadoOperacional, { rotulo: string; classes: string }> = {
  NORMAL: {
    rotulo: 'Normal',
    classes: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  },
  PRESSAO_MODERADA: {
    rotulo: 'Pressão moderada',
    classes: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  },
  CRITICO: {
    rotulo: 'Crítico',
    classes: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  },
};

const STATUS_COR: Record<StatusCor, { ponto: string; rotulo: string }> = {
  VERDE: { ponto: 'bg-emerald-400', rotulo: 'Fluxo normal' },
  AMARELO: { ponto: 'bg-amber-400', rotulo: 'Atenção' },
  VERMELHO: { ponto: 'bg-rose-500', rotulo: 'Crítico' },
};

const PLANTA = 1000;
const LINHAS_GRADE = [100, 200, 300, 400, 500, 600, 700, 800, 900];

function horaDaUltimaLeitura(zonas: ZonaPublico[]): string | null {
  const ultima = zonas
    .map((z) => z.atualizadoEm)
    .filter((valor): valor is string => valor !== null)
    .sort()
    .at(-1);
  return ultima ? new Date(ultima).toLocaleTimeString('pt-BR') : null;
}

const Indicador: React.FC<{ rotulo: string; valor: string }> = ({ rotulo, valor }) => (
  <div className="bg-[#0B0F19] border border-[#1E293B] rounded-lg px-3 py-2">
    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{rotulo}</p>
    <p className="font-mono text-sm text-gray-100 mt-0.5">{valor}</p>
  </div>
);

interface PlantaProps {
  zonas: ZonaPublico[];
}

const PlantaCalor: React.FC<PlantaProps> = ({ zonas }) => {
  const prefixo = useId().replace(/:/g, '');
  const comPosicao = zonas.filter((z) => z.posicao !== null);

  return (
    <svg
      viewBox={`0 0 ${PLANTA} ${PLANTA}`}
      role="img"
      aria-label={`Mapa de calor com ${comPosicao.length} zonas`}
      className="w-full h-auto rounded-lg bg-[#0B0F19] border border-[#1E293B]"
    >
      <defs>
        {comPosicao.map((z) => {
          const cor = corDeCalor(intensidadeDeCalor(z.ocupacaoPct));
          return (
            <radialGradient key={z.id} id={`${prefixo}-calor-${z.id}`}>
              <stop offset="0%" stopColor={cor} stopOpacity="0.95" />
              <stop offset="55%" stopColor={cor} stopOpacity="0.35" />
              <stop offset="100%" stopColor={cor} stopOpacity="0" />
            </radialGradient>
          );
        })}
      </defs>

      {LINHAS_GRADE.map((n) => (
        <React.Fragment key={n}>
          <line x1={n} y1={0} x2={n} y2={PLANTA} stroke="#1E293B" strokeWidth={1} />
          <line x1={0} y1={n} x2={PLANTA} y2={n} stroke="#1E293B" strokeWidth={1} />
        </React.Fragment>
      ))}

      {comPosicao.map((z) => {
        const t = intensidadeDeCalor(z.ocupacaoPct);
        return (
          <circle
            key={z.id}
            cx={z.posicao!.x}
            cy={z.posicao!.y}
            r={110 + 90 * t}
            fill={`url(#${prefixo}-calor-${z.id})`}
            style={{ mixBlendMode: 'screen' }}
          />
        );
      })}

      {comPosicao.map((z) => {
        const { x, y } = z.posicao!;
        const cor = corDeCalor(intensidadeDeCalor(z.ocupacaoPct));
        const emAlerta = z.ocupacaoPct >= LIMITE_ALERTA_OCUPACAO;
        const ancora = x > 800 ? 'end' : x < 200 ? 'start' : 'middle';
        const xTexto = ancora === 'end' ? x + 20 : ancora === 'start' ? x - 20 : x;

        return (
          <g key={z.id}>
            <title>{`${z.codigo} — ${z.titulo}: ${z.pessoas} pessoas`}</title>
            {emAlerta && (
              <circle
                cx={x}
                cy={y}
                r={34}
                fill="none"
                stroke="#EF4444"
                strokeWidth={4}
                className="motion-safe:animate-pulse"
              />
            )}
            <circle cx={x} cy={y} r={14} fill="#0B0F19" stroke={cor} strokeWidth={5} />
            <text
              x={xTexto}
              y={y + 48}
              textAnchor={ancora}
              fontSize={30}
              fontWeight={700}
              fill="#F3F4F6"
              stroke="#0B0F19"
              strokeWidth={6}
              paintOrder="stroke"
            >
              {z.codigo}
            </text>
            <text
              x={xTexto}
              y={y + 80}
              textAnchor={ancora}
              fontSize={26}
              fill="#D1D5DB"
              stroke="#0B0F19"
              strokeWidth={6}
              paintOrder="stroke"
            >
              {`${z.pessoas} pess.`}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

export const HeatmapCard: React.FC<HeatmapCardProps> = ({
  zonas,
  global = null,
  loading = false,
  error = null,
  simulated = false,
  className,
}) => {
  const estado = global ? ESTADO_OPERACIONAL[global.estado_operacional] : null;
  const semPosicao = zonas.filter((z) => z.posicao === null).length;
  const atualizadoEm = horaDaUltimaLeitura(zonas);

  return (
    <section
      aria-label="Mapa de calor do estande"
      className={clsx('rounded-xl border border-[#1E293B] bg-[#131B2E] p-4 sm:p-5', className)}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Flame size={18} className="text-[#FFD600]" aria-hidden="true" />
          <h2 className="text-sm font-semibold tracking-wide text-gray-100">Mapa de calor</h2>
          {simulated && <SeloSimulado />}
        </div>
        <div className="flex items-center gap-3">
          {atualizadoEm && (
            <span className="font-mono text-[11px] text-gray-500">Atualizado às {atualizadoEm}</span>
          )}
          {estado && (
            <span className={clsx('px-2 py-0.5 text-xs rounded font-mono border', estado.classes)}>
              {estado.rotulo}
            </span>
          )}
        </div>
      </header>

      {loading ? (
        <div className="aspect-square max-w-xl mx-auto rounded-lg bg-[#0B0F19] border border-[#1E293B] motion-safe:animate-pulse" />
      ) : error ? (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
          Não foi possível carregar o mapa de calor. {error}
        </div>
      ) : zonas.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-[#1E293B] p-8 text-center text-sm text-gray-500">
          Nenhuma zona disponível no momento.
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
          <div>
            <div className="max-w-xl mx-auto">
              <PlantaCalor zonas={zonas} />
              <div className="mt-3">
                <div
                  className="h-2 rounded-full"
                  style={{ background: GRADIENTE_LEGENDA }}
                  aria-hidden="true"
                />
                <div className="flex justify-between mt-1 text-[10px] text-gray-500 uppercase tracking-wider">
                  <span>Baixa (0%)</span>
                  <span>Média</span>
                  <span>Alta ({LIMITE_ALERTA_OCUPACAO}%+ alerta)</span>
                </div>
                {semPosicao > 0 && (
                  <p className="mt-1 text-[11px] text-amber-400">
                    {semPosicao} zona(s) sem coordenadas não aparecem no mapa.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {global && (
              <div className="grid grid-cols-2 gap-2">
                <Indicador rotulo="Densidade máx." valor={`${global.densidade_maxima_m2.toFixed(2)} pess./m²`} />
                <Indicador rotulo="Velocidade média" valor={`${global.velocidade_media_ms.toFixed(2)} m/s`} />
                <Indicador rotulo="Zonas de atração" valor={String(global.zonas_atracao)} />
                <Indicador rotulo="Hotspots críticos" valor={String(global.pontos_criticos)} />
              </div>
            )}

            <div>
              <div className="grid grid-cols-[minmax(0,1fr)_3rem_3.5rem_4.5rem] gap-2 px-1 pb-1 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                <span>Zona</span>
                <span className="text-right">Pess.</span>
                <span className="text-right">Ocup.</span>
                <span className="text-right">Espera</span>
              </div>
              <ul className="divide-y divide-[#1E293B] border-t border-[#1E293B]">
                {zonas.map((z) => {
                  const status = z.statusCor ? STATUS_COR[z.statusCor] : null;
                  const emAlerta = z.ocupacaoPct >= LIMITE_ALERTA_OCUPACAO;
                  return (
                    <li
                      key={z.id}
                      className="grid grid-cols-[minmax(0,1fr)_3rem_3.5rem_4.5rem] gap-2 items-center px-1 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-100 truncate">{z.codigo}</p>
                        <p className="text-[11px] text-gray-500 truncate" title={z.titulo}>
                          {z.titulo}
                        </p>
                      </div>
                      <span className="font-mono text-sm text-gray-200 text-right">{z.pessoas}</span>
                      <span
                        className={clsx(
                          'font-mono text-sm text-right',
                          emAlerta ? 'text-rose-400 font-bold' : 'text-gray-200',
                        )}
                      >
                        {z.ocupacaoPct}%
                      </span>
                      <span className="flex items-center justify-end gap-1.5 font-mono text-[11px] text-gray-300">
                        {status && (
                          <span
                            className={clsx('inline-block size-2 rounded-full', status.ponto)}
                            title={status.rotulo}
                          />
                        )}
                        {formatarDuracao(z.esperaSeg)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};