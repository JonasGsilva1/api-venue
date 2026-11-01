import { LIMITE_ALERTA_OCUPACAO } from './heatmap';
import type {
  AutosservicoItem,
  InstagramavelItem,
  SinteseAcumuladaData,
} from '../types/venue';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface Amostra {
  t: number; // Date.now()
  valor: number;
}

export interface Previsao {
  atual: number;
  previsto: Record<number, number>; // { 5: x, 10: y, 15: z } minutos à frente
  minutosAteLimite: number | null;
  confianca: number; // 0..1
}

export type AlertaPreditivo = SinteseAcumuladaData['principaisAlertas'][number];

/** Mapa id da atração -> últimas amostras (vem do hook useHistoricoTelemetria). */
export type HistoricoTelemetria = ReadonlyMap<string, Amostra[]>;

// ---------------------------------------------------------------------------
// Constantes (ajuste com o mentor)
// ---------------------------------------------------------------------------

/** Tempo de espera (min) a partir do qual a fila é considerada um gargalo. */
export const LIMITE_ESPERA_MIN = 8;
/** Previsões com confiança menor que isso são ignoradas. */
export const CONFIANCA_MINIMA = 0.4;
/** Minutos até estourar o limite para classificar como "urgente" / "aviso". */
export const LIMITE_URGENTE_MIN = 5;
export const LIMITE_AVISO_MIN = 15;

// ---------------------------------------------------------------------------
// Algoritmo: regressão linear sobre janela deslizante
// ---------------------------------------------------------------------------

const soma = (v: number[]) => v.reduce((a, b) => a + b, 0);

export function preverGargalo(
  amostras: Amostra[],
  limite = LIMITE_ALERTA_OCUPACAO,
  horizontes = [5, 10, 15],
): Previsao | null {
  const n = amostras.length;
  if (n < 5) return null; // histórico insuficiente

  const xs = amostras.map((a) => (a.t - amostras[0].t) / 60000); // minutos
  const ys = amostras.map((a) => a.valor);
  const mx = soma(xs) / n;
  const my = soma(ys) / n;

  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
    syy += (ys[i] - my) ** 2;
  }
  if (sxx === 0) return null;

  const inclinacao = sxy / sxx; // unidades por minuto
  const intercepto = my - inclinacao * mx;
  const r2 = syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  const agora = xs[n - 1];
  const atual = ys[n - 1];

  const previsto: Record<number, number> = {};
  for (const h of horizontes) {
    previsto[h] = Math.max(0, intercepto + inclinacao * (agora + h));
  }

  const minutosAteLimite =
    atual >= limite ? 0 : inclinacao > 0.05 ? (limite - atual) / inclinacao : null;

  return { atual, previsto, minutosAteLimite, confianca: r2 * Math.min(1, n / 12) };
}

// ---------------------------------------------------------------------------
// Geração de alertas preditivos
// ---------------------------------------------------------------------------

interface AlvoPrevisao {
  id: string;
  nome: string;
  setor: string;
  tipo: 'autosservico' | 'instagramavel';
}

function horaAgora(): string {
  return new Date().toTimeString().slice(0, 5); // "HH:MM"
}

function montarAlerta(alvo: AlvoPrevisao, p: Previsao): AlertaPreditivo | null {
  const { minutosAteLimite: min } = p;
  if (min === null) return null; // tendência estável ou caindo

  const jaEstourou = min === 0;
  // Se já estourou, o alerta é um fato; a confiança só filtra projeções futuras.
  if (!jaEstourou && p.confianca < CONFIANCA_MINIMA) return null;
  if (!jaEstourou && min > LIMITE_AVISO_MIN) return null;

  const urgente = jaEstourou || min <= LIMITE_URGENTE_MIN;
  const confPct = Math.round(p.confianca * 100);
  const previsto15 = p.previsto[15];
  const quando = jaEstourou
    ? `já ultrapassou o limite de ${LIMITE_ESPERA_MIN} min`
    : `deve ultrapassar o limite de ${LIMITE_ESPERA_MIN} min em ~${Math.max(1, Math.round(min))} min`;

  const mensagem =
    `[IA] Fila em ${alvo.nome} (${alvo.setor}): espera atual de ` +
    `${p.atual.toFixed(1)} min, ${quando} ` +
    `(projeção +15 min: ${previsto15.toFixed(1)} min · confiança ${confPct}%).`;

  const direcionamento =
    alvo.tipo === 'autosservico'
      ? 'Reforçar o atendimento e reabastecer o totem antes do pico; sinalizar totens vizinhos com menos fila.'
      : 'Ativar o modo ágil de captura e sinalizar a atração vizinha com menos fila para redistribuir o público.';

  return {
    id: `pred-${alvo.id}`,
    tipo: urgente ? 'urgente' : 'aviso',
    mensagem,
    hora: horaAgora(),
    atracao: alvo.nome,
    atracaoId: alvo.id,
    direcionamento,
    impactoEstimado: `Antecipa o gargalo em ${alvo.nome} e evita abandono de fila.`,
    acaoRapidaLabel: alvo.tipo === 'autosservico' ? 'Reforçar Atendimento' : 'Rebalancear Fila',
  };
}

/**
 * Roda preverGargalo por atração (usando o tempo de espera como métrica) e
 * devolve alertas no mesmo formato de `principaisAlertas`.
 * Urgentes primeiro; dentro do mesmo tipo, os mais próximos de estourar.
 */
export function gerarAlertasPreditivos(
  autos: AutosservicoItem[],
  instas: InstagramavelItem[],
  historico: HistoricoTelemetria,
): AlertaPreditivo[] {
  const alvos: AlvoPrevisao[] = [
    ...autos.map((a) => ({ id: a.id, nome: a.nome, setor: a.setor, tipo: 'autosservico' as const })),
    ...instas.map((i) => ({ id: i.id, nome: i.nome, setor: i.setor, tipo: 'instagramavel' as const })),
  ];

  const resultados: { alerta: AlertaPreditivo; minutos: number }[] = [];

  for (const alvo of alvos) {
    const amostras = historico.get(alvo.id);
    if (!amostras) continue;
    const previsao = preverGargalo(amostras, LIMITE_ESPERA_MIN);
    if (!previsao) continue;
    const alerta = montarAlerta(alvo, previsao);
    if (alerta) resultados.push({ alerta, minutos: previsao.minutosAteLimite ?? Infinity });
  }

  return resultados
    .sort((a, b) => {
      const pesoA = a.alerta.tipo === 'urgente' ? 0 : 1;
      const pesoB = b.alerta.tipo === 'urgente' ? 0 : 1;
      return pesoA - pesoB || a.minutos - b.minutos;
    })
    .map((r) => r.alerta);
}