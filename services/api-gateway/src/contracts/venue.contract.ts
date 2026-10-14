/**
 * Contratos do Endpoint 5 — `GET /api/v1/venue/readiness-heatmap` (PROJECT_CONTEXT.md §5.2).
 */
import { EstadoOperacionalEnum } from './common.contract';
import { z } from './zod';

export const ReadinessContract = z
  .object({
    sensores_ativos: z.number().int().min(0),
    fontes_online_str: z.string().regex(/^\d+\/\d+$/).openapi({ example: '6/6' }),
    estoque_inicial_ok: z.boolean(),
    rota_livre_ok: z.boolean(),
    ai_engine_online: z.boolean(),
  })
  .strict()
  .openapi('Readiness');

export const HeatmapGlobalContract = z
  .object({
    pessoas_presentes: z.number().int().min(0),
    ocupacao_estimada_pct: z.number().min(0),
    permanencia_media_seg: z.number().int().min(0),
    densidade_maxima_m2: z.number().min(0).openapi({ example: 0.78 }),
    velocidade_media_ms: z.number().min(0).openapi({ example: 0.68 }),
    zonas_atracao: z.number().int().min(0),
    hotspots_criticos: z.number().int().min(0),
    estado_operacional: EstadoOperacionalEnum,
  })
  .strict()
  .openapi('HeatmapGlobal');

export const ReadinessHeatmapResponseContract = z
  .object({
    readiness: ReadinessContract,
    heatmap_global: HeatmapGlobalContract,
  })
  .strict()
  .openapi('ReadinessHeatmapResponse');

export type Readiness = z.infer<typeof ReadinessContract>;
export type HeatmapGlobal = z.infer<typeof HeatmapGlobalContract>;
export type ReadinessHeatmapResponse = z.infer<typeof ReadinessHeatmapResponseContract>;
