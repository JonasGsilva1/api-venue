/**
 * Planos de contingência da Matriz de Resiliência (PROJECT_CONTEXT.md §6).
 * Funções puras sobre o histórico do repositório: produzem uma estimativa
 * (pax, espera, densidade, confiança) sem depender do ai-engine.
 */
import { arredondar, calcularDensidade, limitar } from '../domain/business-rules';
import type { PdvRecord, ReadingRecord } from '../domain/types';

export interface EstimativaLeitura {
  readonly pax_count: number;
  readonly tempo_espera_seg: number;
  readonly densidade_m2: number;
  readonly ia_confidence: number;
  /** Detalhe técnico incluído no aviso de contingência. */
  readonly base_calculo: string;
}

/** Tempo médio de atendimento por pessoa quando não há ritmo de POS (ref. ~46s do autosserviço Z2). */
export const TEMPO_SERVICO_PADRAO_SEG = 46;
/** Teto de segurança para estimativas heurísticas (1h). */
const TEMPO_ESPERA_MAX_SEG = 3600;
export const JANELA_FALLBACK_502_MS = 15 * 60_000;
export const JANELA_MEDIA_MOVEL_504_MS = 3 * 60_000;

function media(valores: readonly number[]): number {
  return valores.length === 0 ? 0 : valores.reduce((s, v) => s + v, 0) / valores.length;
}

/**
 * §6.4 — CONTINGENCIA_503: pressão da fila estimada exclusivamente pela
 * velocidade transacional do POS e pela contagem bruta de coordenadas.
 */
export function estimarContingencia503(pdv: PdvRecord, contagemBruta: number, transacoesPos3m: number): EstimativaLeitura {
  const ritmoPorMin = transacoesPos3m / 3;
  const tempo =
    ritmoPorMin > 0 ? (contagemBruta / ritmoPorMin) * 60 : contagemBruta * TEMPO_SERVICO_PADRAO_SEG;
  return {
    pax_count: contagemBruta,
    tempo_espera_seg: Math.round(limitar(tempo, 0, TEMPO_ESPERA_MAX_SEG)),
    densidade_m2: calcularDensidade(contagemBruta, pdv.area_m2),
    ia_confidence: 0.35,
    base_calculo: `heurística POS (${arredondar(ritmoPorMin, 2)} atend./min) + contagem bruta (${contagemBruta} pax)`,
  };
}

/**
 * §6.2 — FALLBACK_502: interpolação pela tendência histórica dos últimos 15 minutos
 * do ponto (média ponderada por recência + regressão linear projetada para "agora"),
 * cruzada com o volume atual do POS (queda de transações → fila maior).
 */
export function estimarFallback502(
  pdv: PdvRecord,
  historico15m: readonly ReadingRecord[],
  transacoesPos3m: number,
  agoraMs: number,
): EstimativaLeitura {
  if (historico15m.length === 0) {
    // Sem histórico: o próprio volume do POS é a única fonte disponível.
    const base = estimarContingencia503(pdv, transacoesPos3m, transacoesPos3m);
    return { ...base, ia_confidence: 0.2, base_calculo: `sem histórico de 15 min; ${base.base_calculo}` };
  }

  const ordenado = [...historico15m].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const pesos = ordenado.map((_, i) => i + 1); // mais recente pesa mais
  const somaPesos = pesos.reduce((s, p) => s + p, 0);
  const ponderada = (sel: (r: ReadingRecord) => number): number =>
    ordenado.reduce((s, r, i) => s + sel(r) * (pesos[i] ?? 0), 0) / somaPesos;

  const paxPond = ponderada((r) => r.pax_count);
  const tempoPond = ponderada((r) => r.tempo_espera_seg);
  const txPond = ponderada((r) => r.transacoes_pos_ultimos_3m);

  // Regressão linear (tempo de espera × minutos) para projetar a tendência até agora.
  const xs = ordenado.map((r) => (Date.parse(r.timestamp) - agoraMs) / 60_000);
  const ys = ordenado.map((r) => r.tempo_espera_seg);
  const mx = media(xs);
  const my = media(ys);
  const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const inclinacao = den === 0 ? 0 : xs.reduce((s, x, i) => s + (x - mx) * ((ys[i] ?? my) - my), 0) / den;
  const projetadoAgora = my + inclinacao * (0 - mx);
  // Interpolação: metade tendência projetada, metade média ponderada; limitado a ±50% da média ponderada.
  const tempoTendencia = limitar((projetadoAgora + tempoPond) / 2, tempoPond * 0.5, tempoPond * 1.5);

  // Cruzamento com o POS adjacente: menos transações que o histórico → espera e fila maiores.
  const fatorPos = limitar((txPond + 1) / (transacoesPos3m + 1), 0.5, 2);
  const pax = Math.round(paxPond * Math.sqrt(fatorPos));
  const tempo = Math.round(limitar(tempoTendencia * fatorPos, 0, TEMPO_ESPERA_MAX_SEG));

  return {
    pax_count: pax,
    tempo_espera_seg: tempo,
    densidade_m2: calcularDensidade(pax, pdv.area_m2),
    ia_confidence: arredondar(limitar(0.35 + 0.02 * ordenado.length, 0.35, 0.65), 2),
    base_calculo: `tendência de ${ordenado.length} leituras/15 min × fator POS ${arredondar(fatorPos, 2)}`,
  };
}

/**
 * §6.3 — MEDIA_MOVEL_504: média móvel dos últimos 3 minutos do ponto.
 * Sem histórico na janela, recorre à heurística de contingência com a contagem atual.
 */
export function estimarMediaMovel504(
  pdv: PdvRecord,
  historico3m: readonly ReadingRecord[],
  contagemAtual: number,
  transacoesPos3m: number,
): EstimativaLeitura {
  if (historico3m.length === 0) {
    const base = estimarContingencia503(pdv, contagemAtual, transacoesPos3m);
    return { ...base, ia_confidence: 0.3, base_calculo: `sem leituras nos últimos 3 min; ${base.base_calculo}` };
  }
  const pax = Math.round(media(historico3m.map((r) => r.pax_count)));
  return {
    pax_count: pax,
    tempo_espera_seg: Math.round(media(historico3m.map((r) => r.tempo_espera_seg))),
    densidade_m2: calcularDensidade(pax, pdv.area_m2),
    ia_confidence: 0.6,
    base_calculo: `média móvel de ${historico3m.length} leituras/3 min`,
  };
}
