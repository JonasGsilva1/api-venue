/**
 * Contratos do Endpoint 4 — `GET /api/v1/analytics/dropoff-summary` (PROJECT_CONTEXT.md §5.2).
 */
import { z } from './zod';

export const AcumuladoEventoContract = z
  .object({
    publico_acumulado: z.number().int().min(0),
    atendimentos_cortesia: z.number().int().min(0),
    bebidas_unidades: z.number().int().min(0),
    autosservico_retiradas: z.number().int().min(0),
    engajamento_interacoes: z
      .number()
      .int()
      .min(0)
      .openapi({ description: 'Interações físicas (engajamento) — NÃO representam captura de lead comercial.' }),
  })
  .strict()
  .openapi('AcumuladoEvento');

export const AnalyticsSummaryResponseContract = z
  .object({
    window_time_min: z.number().positive().openapi({ description: 'Janela de oportunidade configurada (min).', example: 30 }),
    queue_time_medio_min: z.number().min(0).openapi({ description: 'Tempo médio real de espera na fila (min).' }),
    density_point_atingido: z
      .boolean()
      .openapi({ description: 'true se algum ponto atingiu a barreira psicológica de abandono (status VERMELHO, > 12 min).' }),
    dropoff_rate_estimado_pct: z
      .number()
      .min(0)
      .max(100)
      .openapi({ description: 'Taxa de abandono estimada. Supera 80% quando deslocamento + fila >= 25 min numa janela de 30 min.' }),
    ces_score: z
      .number()
      .min(1)
      .max(5)
      .openapi({ description: 'Customer Effort Score estimado (1 = esforço mínimo, 5 = esforço máximo).' }),
    acumulado_evento: AcumuladoEventoContract,
  })
  .strict()
  .openapi('AnalyticsSummaryResponse');

export type AcumuladoEvento = z.infer<typeof AcumuladoEventoContract>;
export type AnalyticsSummaryResponse = z.infer<typeof AnalyticsSummaryResponseContract>;
