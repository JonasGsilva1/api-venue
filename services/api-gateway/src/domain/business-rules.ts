/**
 * Regras de negócio puras (sem I/O) — PROJECT_CONTEXT.md §4.2.
 * Centralizadas aqui para que todos os modos de leitura (TEMPO_REAL e contingências)
 * apliquem exatamente os mesmos limiares.
 */
import type { EstadoOperacional, StatusCor } from '../contracts';

export const LIMIAR_VERDE_MAX_SEG = 300; // < 300s → VERDE
export const LIMIAR_AMARELO_MAX_SEG = 720; // 300..720s → AMARELO; > 720s → VERMELHO
export const LIMIAR_REDIRECIONAMENTO_SEG = 180; // push só se > 180s
export const LIMIAR_FILA_RUPTURA_PAX = 6; // pax >= 6 ...
export const LIMIAR_ESTOQUE_CRITICO_PCT = 45; // ... ou estoque < 45%

/** §4.2.4 — Classificação semafórica. */
export function classificarStatusCor(tempoEsperaSeg: number): StatusCor {
  if (tempoEsperaSeg < LIMIAR_VERDE_MAX_SEG) return 'VERDE';
  if (tempoEsperaSeg <= LIMIAR_AMARELO_MAX_SEG) return 'AMARELO';
  return 'VERMELHO';
}

/** §4.2.3 — Paradoxo do Roteamento: true EXCLUSIVAMENTE quando > 180s. */
export function habilitarRedirecionamentoPush(tempoEsperaSeg: number | null): boolean {
  return tempoEsperaSeg !== null && tempoEsperaSeg > LIMIAR_REDIRECIONAMENTO_SEG;
}

/** §4.2.2 — Ruptura mascarada (fila estagnada sem POS) ou estoque crítico. */
export function detectarRupturaEstoque(paxCount: number, transacoesPos3m: number, estoquePct: number): boolean {
  const filaEstagnada = paxCount >= LIMIAR_FILA_RUPTURA_PAX && transacoesPos3m === 0;
  const estoqueCritico = estoquePct < LIMIAR_ESTOQUE_CRITICO_PCT;
  return filaEstagnada || estoqueCritico;
}

/** Densidade em pessoas/m², arredondada a 2 casas. */
export function calcularDensidade(paxCount: number, areaM2: number): number {
  if (areaM2 <= 0) return 0;
  return arredondar(paxCount / areaM2, 2);
}

/** Estado operacional consolidado a partir das cores das zonas. */
export function consolidarEstadoOperacional(cores: readonly StatusCor[]): EstadoOperacional {
  if (cores.includes('VERMELHO')) return 'CRITICO';
  if (cores.includes('AMARELO')) return 'PRESSAO_MODERADA';
  return 'NORMAL';
}

export function arredondar(valor: number, casas: number): number {
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
}

export function limitar(valor: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valor));
}
