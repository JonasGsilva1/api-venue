import { Bot, Clock } from 'lucide-react';
import {
  CONFIANCA_MINIMA,
  LIMITE_ESPERA_MIN,
  preverGargalo,
  type HistoricoTelemetria,
  type Previsao,
} from '../../utils/predicao';
import type { AutosservicoItem, InstagramavelItem } from '../../types/venue';

interface PredicaoGargalosViewProps {
  autos: AutosservicoItem[];
  instas: InstagramavelItem[];
  historico: HistoricoTelemetria;
}

interface Linha {
  id: string;
  codigo: string;
  nome: string;
  setor: string;
  tipo: 'Totem' | 'Instagramável';
  atual: number;
  amostras: number;
  previsao: Previsao | null;
}

const MIN_AMOSTRAS = 5;

/** Ordem de exibição: já estourou > vai estourar > estável > coletando dados. */
function prioridade(l: Linha): number {
  if (!l.previsao) return 3;
  const min = l.previsao.minutosAteLimite;
  if (min === null) return 2;
  return min === 0 ? 0 : 1;
}

function corValor(valor: number): string {
  if (valor >= LIMITE_ESPERA_MIN) return 'text-rose-400';
  if (valor >= LIMITE_ESPERA_MIN * 0.75) return 'text-amber-300';
  return 'text-emerald-400';
}

function EstouraEm({ linha }: { linha: Linha }) {
  if (!linha.previsao) {
    return (
      <span className="text-slate-500">
        Coletando dados ({Math.min(linha.amostras, MIN_AMOSTRAS)}/{MIN_AMOSTRAS})
      </span>
    );
  }
  const min = linha.previsao.minutosAteLimite;
  if (min === null) return <span className="text-emerald-400">Estável</span>;
  if (min === 0) return <span className="text-rose-400 font-bold">Já estourou</span>;
  const cor = min <= 5 ? 'text-rose-400' : min <= 15 ? 'text-amber-300' : 'text-slate-300';
  return <span className={`${cor} font-bold`}>em ~{Math.max(1, Math.round(min))} min</span>;
}

function BarraConfianca({ valor }: { valor: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, valor)) * 100);
  const cor = valor >= 0.7 ? 'bg-emerald-400' : valor >= CONFIANCA_MINIMA ? 'bg-amber-400' : 'bg-slate-500';
  return (
    <div className="flex items-center gap-2 min-w-[96px]">
      <div className="h-1.5 w-16 rounded-full bg-slate-800 overflow-hidden">
        <div className={`h-full ${cor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] font-mono text-slate-300 tabular-nums">{pct}%</span>
    </div>
  );
}

export function PredicaoGargalosView({ autos, instas, historico }: PredicaoGargalosViewProps) {
  const alvos = [
    ...autos.map((a) => ({
      id: a.id,
      codigo: a.codigo,
      nome: a.nome,
      setor: a.setor,
      tipo: 'Totem' as const,
      atual: a.tempoEstimadoEsperaMin,
    })),
    ...instas.map((i) => ({
      id: i.id,
      codigo: i.codigo,
      nome: i.nome,
      setor: i.setor,
      tipo: 'Instagramável' as const,
      atual: i.tempoEsperaMin,
    })),
  ];

  const linhas: Linha[] = alvos
    .map((alvo) => {
      const amostras = historico.get(alvo.id) ?? [];
      return {
        ...alvo,
        amostras: amostras.length,
        previsao: preverGargalo(amostras, LIMITE_ESPERA_MIN),
      };
    })
    .sort((a, b) => {
      const dif = prioridade(a) - prioridade(b);
      if (dif !== 0) return dif;
      return (a.previsao?.minutosAteLimite ?? Infinity) - (b.previsao?.minutosAteLimite ?? Infinity);
    });

  const emRisco = linhas.filter((l) => l.previsao && l.previsao.minutosAteLimite !== null).length;
  const coletando = linhas.filter((l) => !l.previsao).length;

  return (
    <section className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <Bot className="w-5 h-5 text-fuchsia-400" />
            <span>Predição de Gargalos (IA)</span>
          </h2>
          <p className="text-xs text-slate-400">
            Tendência do tempo de espera por atração (regressão linear sobre as últimas amostras).
            Limite de gargalo: {LIMITE_ESPERA_MIN} min. Previsões com confiança abaixo de{' '}
            {Math.round(CONFIANCA_MINIMA * 100)}% não geram alerta.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono font-bold">
          <span className="text-rose-300">{emRisco} em risco</span>
          <span className="text-slate-500">·</span>
          <span className="inline-flex items-center gap-1 text-slate-400">
            <Clock className="w-3.5 h-3.5" />
            {coletando} coletando dados
          </span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-[#0b1220]">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-slate-400 border-b border-slate-800">
              <th className="px-3 py-2.5 font-semibold">Atração</th>
              <th className="px-3 py-2.5 font-semibold">Atual</th>
              <th className="px-3 py-2.5 font-semibold">+5 min</th>
              <th className="px-3 py-2.5 font-semibold">+10 min</th>
              <th className="px-3 py-2.5 font-semibold">+15 min</th>
              <th className="px-3 py-2.5 font-semibold">Estoura</th>
              <th className="px-3 py-2.5 font-semibold">Confiança</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id} className="border-b border-slate-800/70 last:border-0">
                <td className="px-3 py-2.5">
                  <div className="font-bold text-white">{l.nome}</div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    {l.codigo} · {l.tipo} · {l.setor}
                  </div>
                </td>
                <td className={`px-3 py-2.5 font-mono font-bold tabular-nums ${corValor(l.atual)}`}>
                  {l.atual.toFixed(1)} min
                </td>
                {[5, 10, 15].map((h) => {
                  const v = l.previsao?.previsto[h];
                  return (
                    <td
                      key={h}
                      className={`px-3 py-2.5 font-mono tabular-nums ${
                        v === undefined ? 'text-slate-600' : corValor(v)
                      }`}
                    >
                      {v === undefined ? '—' : `${v.toFixed(1)} min`}
                    </td>
                  );
                })}
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <EstouraEm linha={l} />
                </td>
                <td className="px-3 py-2.5">
                  {l.previsao ? (
                    <BarraConfianca valor={l.previsao.confianca} />
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}