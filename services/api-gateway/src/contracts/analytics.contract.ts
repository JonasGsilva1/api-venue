/**
 * Contratos do Endpoint 4 — `GET /api/v1/analytics/dropoff-summary` (100% em português).
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
      .openapi({ description: 'Interações físicas de engajamento (não configuram lead comercial).' }),
  })
  .strict()
  .openapi('AcumuladoEvento');

export const AnalyticsSummaryResponseContract = z
  .object({
    janela_tempo_min: z.number().positive().openapi({ description: 'Janela de oportunidade de consumo configurada (minutos).', example: 30 }),
    tempo_medio_fila_min: z.number().min(0).openapi({ description: 'Tempo médio de espera na fila (minutos).' }),
    ponto_densidade_atingido: z
      .boolean()
      .openapi({ description: 'true se algum ponto atingiu a barreira psicológica de abandono (status VERMELHO, > 12 min).' }),
    taxa_abandono_estimada_pct: z
      .number()
      .min(0)
      .max(100)
      .openapi({ description: 'Taxa estimada de abandono de consumo (Drop-off Rate %). Supera 80% quando deslocamento + fila >= 25 min.' }),
    pontuacao_esforco_ces: z
      .number()
      .min(1)
      .max(5)
      .openapi({ description: 'Customer Effort Score estimado (1 = esforço mínimo, 5 = esforço crítico).' }),
    acumulado_evento: AcumuladoEventoContract,
  })
  .strict()
  .openapi('AnalyticsSummaryResponse');

export type AcumuladoEvento = z.infer<typeof AcumuladoEventoContract>;
export type AnalyticsSummaryResponse = z.infer<typeof AnalyticsSummaryResponseContract>;
