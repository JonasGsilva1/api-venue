/**
 * Contratos do Endpoint 5 — `GET /api/v1/venue/readiness-heatmap` (100% em português).
 */
import { EstadoOperacionalEnum } from './common.contract';
import { z } from './zod';

export const ProntidaoContract = z
  .object({
    sensores_ativos: z.number().int().min(0).openapi({ description: 'Quantidade de sensores com status ONLINE.', example: 6 }),
    fontes_online_str: z.string().regex(/^\d+\/\d+$/).openapi({ description: 'Proporção de fontes de dados online.', example: '6/6' }),
    estoque_inicial_ok: z.boolean().openapi({ description: 'true se todos os bares têm estoque >= 45%.' }),
    rota_livre_ok: z.boolean().openapi({ description: 'true se não há obstrução em catracas, banheiros ou rota PCD.' }),
    motor_ia_online: z.boolean().openapi({ description: 'true se o motor de inteligência artificial respondeu ao ping.' }),
  })
  .strict()
  .openapi('Prontidao');

export const MapaCalorGlobalContract = z
  .object({
    pessoas_presentes: z.number().int().min(0).openapi({ description: 'Total de pessoas presentes no estande no momento.' }),
    ocupacao_estimada_pct: z.number().min(0).openapi({ description: 'Percentual de ocupação em relação à capacidade total.' }),
    permanencia_media_seg: z.number().int().min(0).openapi({ description: 'Tempo médio de permanência estimado em segundos.' }),
    densidade_maxima_m2: z.number().min(0).openapi({ description: 'Densidade máxima observada em pessoas/m².', example: 0.78 }),
    velocidade_media_ms: z.number().min(0).openapi({ description: 'Velocidade média calculada de fluxo em m/s.', example: 0.68 }),
    zonas_atracao: z.number().int().min(0).openapi({ description: 'Quantidade de zonas com densidade de atração ativa.' }),
    pontos_criticos: z.number().int().min(0).openapi({ description: 'Quantidade de zonas em nível VERMELHO ou com ruptura de estoque.' }),
    estado_operacional: EstadoOperacionalEnum,
  })
  .strict()
  .openapi('MapaCalorGlobal');

export const ReadinessHeatmapResponseContract = z
  .object({
    prontidao: ProntidaoContract,
    mapa_calor_global: MapaCalorGlobalContract,
  })
  .strict()
  .openapi('ReadinessHeatmapResponse');

export type Prontidao = z.infer<typeof ProntidaoContract>;
export type MapaCalorGlobal = z.infer<typeof MapaCalorGlobalContract>;
export type ReadinessHeatmapResponse = z.infer<typeof ReadinessHeatmapResponseContract>;
