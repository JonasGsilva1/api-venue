import { useCallback, useEffect, useState } from 'react';
import { Bot, Calculator, Clock, Zap } from 'lucide-react';
import {
  CONFIANCA_MINIMA,
  LIMITE_ESPERA_MIN,
  preverGargalo,
  type HistoricoTelemetria,
  type Previsao,
} from '../../utils/predicao';
import type { InstagramavelItem } from '../../types/venue';
import type { PdvStatusItem } from '../../types/publico';
import type {
  InferenceResponse,
  PredicaoGargaloApiResponse,
} from '../../types/ops';
import {
  getPredicaoGargalos,
  mensagemDeErro,
  postAcionarFluxo,
  postInferencia,
} from '../../services/venueApi';

interface PredicaoGargalosViewProps {
  zonas: PdvStatusItem[];
  instas: InstagramavelItem[];
  historico: HistoricoTelemetria;
  onAcaoExecutada?: () => void;
}

interface Linha {
  id: string;
  codigo: string;
  nome: string;
  setor: string;
  tipo: 'Zona Câmera' | 'Instagramável';
  atual: number;
  amostras: number;
  previsao: Previsao | null;
}

const MIN_AMOSTRAS = 5;

function prioridade(l: Linha): number {
  if (!l.previsao) return 3;
  const min = l.previsao.minutosAteLimite;
  if (min === null) return 2;
  return min === 0 ? 0 : 1;
}

function corValor(valor: number): string {
  if (valor >= LIMITE_ESPERA_MIN) return 'text-rose-400';
  if (valor >= LIMITE_ESPERA_MIN * 0.75) return 'text-amber-300';
  return 'text-raiz-accent';
}

function EstouraEm({ linha }: { linha: Linha }) {
  if (!linha.previsao) {
    return (
      <span className="text-raiz-text-light/55">
        Coletando dados ({Math.min(linha.amostras, MIN_AMOSTRAS)}/{MIN_AMOSTRAS})
      </span>
    );
  }
  const min = linha.previsao.minutosAteLimite;
  if (min === null) return <span className="text-raiz-accent">Estável</span>;
  if (min === 0) return <span className="text-rose-400 font-bold">Já estourou</span>;
  const cor = min <= 5 ? 'text-rose-400' : min <= 15 ? 'text-amber-300' : 'text-raiz-text-light/75';
  return <span className={`${cor} font-bold`}>em ~{Math.max(1, Math.round(min))} min</span>;
}

function BarraConfianca({ valor }: { valor: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, valor)) * 100);
  const cor = valor >= 0.7 ? 'bg-raiz-accent' : valor >= CONFIANCA_MINIMA ? 'bg-amber-400' : 'bg-raiz-border-dark';
  return (
    <div className="flex items-center gap-2 min-w-[96px]">
      <div className="h-1.5 w-16 rounded-full bg-raiz-border-dark overflow-hidden">
        <div className={`h-full ${cor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] font-mono text-raiz-text-light/75 tabular-nums">{pct}%</span>
    </div>
  );
}

export function PredicaoGargalosView({
  zonas,
  instas,
  historico,
  onAcaoExecutada,
}: PredicaoGargalosViewProps) {
  const [predicaoApi, setPredicaoApi] = useState<PredicaoGargaloApiResponse | null>(null);
  const [acionando, setAcionando] = useState(false);
  const [acaoFeedback, setAcaoFeedback] = useState<string | null>(null);

  const [simPdvId, setSimPdvId] = useState<number>(1);
  const [simPessoas, setSimPessoas] = useState<number>(8);
  const [simTaxaNfc, setSimTaxaNfc] = useState<string>('');
  const [simResultado, setSimResultado] = useState<InferenceResponse | null>(null);
  const [simBusy, setSimBusy] = useState(false);
  const [erroApi, setErroApi] = useState<string | null>(null);

  const carregarPredicao = useCallback(async () => {
    try {
      const p = await getPredicaoGargalos();
      setPredicaoApi(p);
    } catch {
      // Mantém estado atual em erro transitório
    }
  }, []);

  useEffect(() => {
    void carregarPredicao();
  }, [carregarPredicao]);

  const handleExecutarAcao = async () => {
    if (!predicaoApi) return;
    setAcionando(true);
    setErroApi(null);
    setAcaoFeedback(null);
    try {
      const resp = await postAcionarFluxo({
        alerta_id: 'PRED-9921',
        acao_executada: 'ACIONAR_DUAS_FILAS_ADICIONAIS',
        setor: predicaoApi.setor,
      });
      setAcaoFeedback(
        `Ação ${resp.acao_executada} registrada (${resp.status_operacional_anterior} → ${resp.status_operacional_evento}).`,
      );
      onAcaoExecutada?.();
    } catch (err) {
      setErroApi(mensagemDeErro(err));
    } finally {
      setAcionando(false);
    }
  };

  const handleCalcularFila = async (e: React.FormEvent) => {
    e.preventDefault();
    setSimBusy(true);
    setErroApi(null);
    try {
      const coords = Array.from({ length: Math.max(0, Math.min(500, simPessoas)) }, (_, i) => ({
        x: Number((120 + (i % 15) * 20).toFixed(1)),
        y: Number((180 + Math.floor(i / 15) * 25).toFixed(1)),
      }));
      const nfcNum = simTaxaNfc.trim() ? Number(simTaxaNfc) : null;
      const taxaValida = nfcNum !== null && nfcNum >= 1 && nfcNum <= 600 ? Math.round(nfcNum) : null;
      const res = await postInferencia({
        pdv_id: simPdvId,
        coordenadas_simuladas: coords,
        transacoes_pos_ultimos_3m: 4,
        taxa_nfc_seg_por_pessoa: taxaValida,
      });
      setSimResultado(res);
    } catch (err) {
      setErroApi(mensagemDeErro(err));
    } finally {
      setSimBusy(false);
    }
  };

  const alvos = [
    ...zonas.map((z) => ({
      id: `zona-${z.id}`,
      codigo: z.nome.split('|')[0]?.trim() || `Z${z.id}`,
      nome: z.nome,
      setor: z.tipo,
      tipo: 'Zona Câmera' as const,
      atual: Number(((z.ultima_leitura?.tempo_espera_seg ?? 0) / 60).toFixed(1)),
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
          <h2 className="text-base sm:text-lg font-bold text-raiz-text-light flex items-center gap-2">
            <Bot className="w-5 h-5 text-raiz-accent" />
            <span>Predição de Gargalos (IA)</span>
          </h2>
          <p className="text-xs text-raiz-text-light/75">
            Tendência do tempo de espera nas zonas monitoradas e atrações. Limite de gargalo:{' '}
            {LIMITE_ESPERA_MIN} min.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono font-bold">
          <span className="text-rose-300">{emRisco} em risco</span>
          <span className="text-raiz-text-light/55">·</span>
          <span className="inline-flex items-center gap-1 text-raiz-text-light/75">
            <Clock className="w-3.5 h-3.5" />
            {coletando} coletando dados
          </span>
        </div>
      </div>

      {erroApi && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-950/30 px-3 py-2 text-xs text-rose-300">
          {erroApi}
        </div>
      )}

      {/* Previsão Ativa do Servidor (GET /api/v1/predicoes/gargalos + POST /api/v1/predicoes/acionar-fluxo) */}
      {predicaoApi && (
        <div className="rounded-xl border border-raiz-accent/40 bg-raiz-section p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded bg-rose-600 px-2 py-0.5 font-mono text-[10px] font-bold text-white">
                {predicaoApi.nivel_predito}
              </span>
              <span className="font-bold text-raiz-text-light">{predicaoApi.setor}</span>
              <span className="font-mono text-amber-300">
                Formação em {predicaoApi.tempo_estimado_formacao_fila}
              </span>
            </div>
            <p className="text-xs text-raiz-text-light/75">{predicaoApi.motivo}</p>
            <p className="text-xs font-semibold text-amber-300">
              Ação recomendada: {predicaoApi.acao_recomendada}
            </p>
            {acaoFeedback && <p className="text-xs text-raiz-accent font-mono">{acaoFeedback}</p>}
          </div>
          <button
            type="button"
            onClick={() => void handleExecutarAcao()}
            disabled={acionando}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-raiz-accent px-4 py-2 text-xs font-bold text-raiz-text-dark hover:bg-raiz-accent/90 disabled:opacity-50"
          >
            <Zap className="h-3.5 w-3.5" />
            <span>{acionando ? 'Executando...' : 'Executar ação recomendada'}</span>
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-raiz-border-dark bg-raiz-dark">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-raiz-text-light/75 border-b border-raiz-border-dark">
              <th className="px-3 py-2.5 font-semibold">Zona / Atração</th>
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
              <tr key={l.id} className="border-b border-raiz-border-dark/70 last:border-0">
                <td className="px-3 py-2.5">
                  <div className="font-bold text-raiz-text-light">{l.nome}</div>
                  <div className="text-[11px] text-raiz-text-light/55 font-mono">
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
                        v === undefined ? 'text-raiz-text-light/55' : corValor(v)
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
                    <span className="text-raiz-text-light/55">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Teste rápido de cálculo de fila (POST /api/v1/inferencia) */}
      <form
        onSubmit={(e) => void handleCalcularFila(e)}
        className="rounded-xl border border-raiz-border-dark bg-raiz-section p-4 space-y-3"
      >
        <div className="flex items-center gap-2 text-xs font-bold text-raiz-accent">
          <Calculator className="h-4 w-4" />
          <span>Calcular fila (teste, sem salvar)</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-[11px] text-raiz-text-light/75 mb-1">Zona</label>
            <select
              value={simPdvId}
              onChange={(e) => setSimPdvId(Number(e.target.value))}
              className="w-full rounded-lg border border-raiz-border-dark bg-raiz-dark px-3 py-2 text-xs text-raiz-text-light"
            >
              {(zonas.length > 0
                ? zonas
                : [
                    { id: 1, nome: 'Z1 | Acesso Estande Principal' },
                    { id: 2, nome: 'Z2 | Passarela Lateral Leste' },
                    { id: 5, nome: 'Corredor de Acesso Norte' },
                  ]
              ).map((z) => (
                <option key={z.id} value={z.id}>
                  {z.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-raiz-text-light/75 mb-1">Pessoas na zona</label>
            <input
              type="number"
              min={0}
              max={500}
              value={simPessoas}
              onChange={(e) => setSimPessoas(Number(e.target.value))}
              className="w-full rounded-lg border border-raiz-border-dark bg-raiz-dark px-3 py-2 text-xs text-raiz-text-light"
            />
          </div>
          <div>
            <label className="block text-[11px] text-raiz-text-light/75 mb-1">Segundos na catraca (opcional)</label>
            <input
              type="number"
              min={1}
              max={600}
              placeholder="Automático"
              value={simTaxaNfc}
              onChange={(e) => setSimTaxaNfc(e.target.value)}
              className="w-full rounded-lg border border-raiz-border-dark bg-raiz-dark px-3 py-2 text-xs text-raiz-text-light"
            />
          </div>
          <button
            type="submit"
            disabled={simBusy}
            className="rounded-lg bg-raiz-accent px-4 py-2 text-xs font-bold text-raiz-text-dark hover:bg-raiz-accent/90 disabled:opacity-50"
          >
            {simBusy ? 'Calculando...' : 'Calcular fila'}
          </button>
        </div>

        {simResultado && (
          <div className="flex flex-wrap items-center gap-4 rounded-lg border border-raiz-border-dark bg-raiz-dark px-3 py-2 text-xs font-mono">
            <span className="text-raiz-text-light">
              Pessoas: <strong>{simResultado.pax_count}</strong>
            </span>
            <span className="text-raiz-accent">
              Espera: <strong>{simResultado.tempo_espera_fmt}</strong>
            </span>
            <span className="text-raiz-text-light/75">
              Densidade: <strong>{simResultado.densidade_m2.toFixed(2)} p/m²</strong>
            </span>
            <span className="text-amber-300">
              Semáforo: <strong>{simResultado.status_cor}</strong>
            </span>
            {simResultado.anomalias.length > 0 && (
              <span className="text-rose-400">
                Anomalias: <strong>{simResultado.anomalias.join(', ')}</strong>
              </span>
            )}
          </div>
        )}
      </form>
    </section>
  );
}
