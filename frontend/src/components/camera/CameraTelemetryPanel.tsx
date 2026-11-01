import React from 'react';
import { Camera, RefreshCw, TriangleAlert } from 'lucide-react';
import { useCameraTelemetry } from '../../hooks/useCameraTelemetry';
import type { CameraTelemetria } from '../../hooks/useCameraTelemetry';
import { formatarDuracao, separarNome } from '../../utils/publico';
import { SeloSimulado } from '../publico/SeloSimulado';

const COR_STATUS = {
  VERDE: 'bg-emerald-400',
  AMARELO: 'bg-amber-400',
  VERMELHO: 'bg-rose-500',
} as const;

const ROTULO_TIPO = {
  entrada_perimetro: 'Entrada',
  fb_liquid: 'F&B',
} as const;

// "Z1 | Balcão Principal de Drinks" vira "Z1 · Balcão Principal de Drinks".
const nomeCurto = (nome: string): string => {
  const { codigo, titulo } = separarNome(nome);
  return titulo === codigo ? codigo : `${codigo} · ${titulo}`;
};

const Linha: React.FC<{ rotulo: string; valor: string }> = ({ rotulo, valor }) => (
  <div className="flex items-baseline justify-between gap-2 text-[11px]">
    <span className="text-slate-500">{rotulo}</span>
    <span className="truncate font-mono font-semibold text-slate-100" title={valor}>
      {valor}
    </span>
  </div>
);

const CameraCard: React.FC<{ item: CameraTelemetria; carregando: boolean }> = ({ item, carregando }) => {
  const { camera, zona } = item;
  const leitura = zona?.ultima_leitura ?? null;
  const semZona = zona === null;

  return (
    <div className="rounded-xl border border-cyan-900/60 bg-[#0d1527] p-3.5 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-mono font-bold text-cyan-300">
            <Camera className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{camera.codigo}</span>
            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">
              {ROTULO_TIPO[camera.tipo]}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-slate-300" title={camera.nome}>
            {camera.nome}
          </p>
        </div>
        {leitura ? (
          <span
            className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${COR_STATUS[leitura.status_cor]}`}
            title={`Status da zona: ${leitura.status_cor}`}
          />
        ) : null}
      </div>

      {leitura && zona ? (
        <div className="space-y-1">
          <Linha rotulo="Zona" valor={nomeCurto(zona.nome)} />
          <Linha rotulo="Pessoas" valor={`${leitura.contagem_pessoas} / ${zona.capacidade}`} />
          <Linha rotulo="Espera" valor={formatarDuracao(leitura.tempo_espera_seg)} />
          <Linha rotulo="Densidade" valor={`${leitura.densidade_m2.toFixed(2)} pess./m²`} />
          <Linha rotulo="Confiança IA" valor={`${Math.round(leitura.confianca_ia * 100)}%`} />
          {leitura.alerta_ruptura_estoque && (
            <p className="text-[11px] font-semibold text-rose-300">Alerta de ruptura de estoque</p>
          )}
          {leitura.modo_leitura !== 'TEMPO_REAL' && (
            <p className="text-[10px] text-amber-300">Leitura em contingência: {leitura.modo_leitura}</p>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-slate-500">
              {carregando
                ? 'Carregando leitura...'
                : semZona
                  ? 'Sem zona equivalente na API.'
                  : 'Sem leitura recente.'}
            </p>
            {!carregando && <SeloSimulado detalhe="Valores fictícios do hardware: a API não mede esta câmera." />}
          </div>
          {!carregando && (
            <Linha rotulo={camera.metricas.rotulo} valor={camera.metricas.valor} />
          )}
        </div>
      )}
    </div>
  );
};

// Painel com a telemetria das 7 câmeras (4 de entrada e 3 de F&B), lida da API.
export const CameraTelemetryPanel: React.FC = () => {
  const { cameras, loading, error, atualizadoEm, refetch } = useCameraTelemetry();

  return (
    <section className="space-y-3" aria-labelledby="cameras-titulo">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="cameras-titulo" className="flex items-center gap-2 text-base font-bold text-white sm:text-lg">
            <Camera className="h-5 w-5 text-cyan-400" aria-hidden="true" />
            <span>Telemetria das Câmeras ({cameras.length})</span>
          </h2>
          <p className="text-xs text-slate-400">
            Leitura por zona da API: pessoas, espera e densidade. Câmeras sem zona usam valores fictícios.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {atualizadoEm && (
            <span className="font-mono text-[11px] text-slate-500">
              Atualizado às {atualizadoEm.toLocaleTimeString('pt-BR')}
            </span>
          )}
          <button
            type="button"
            onClick={refetch}
            aria-label="Atualizar telemetria"
            title="Atualizar agora"
            className="rounded-lg border border-cyan-900/60 bg-[#0d1527] p-1.5 text-slate-300 transition-colors hover:text-white"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300"
        >
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cameras.map((item) => (
          <CameraCard key={item.camera.id} item={item} carregando={loading} />
        ))}
      </div>
    </section>
  );
};
