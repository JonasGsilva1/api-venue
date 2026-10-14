/**
 * Espelho estrito dos contratos do `services/ai-engine` (100% em português).
 *
 * O Gateway valida a resposta do Python com `.strict()` antes de usá-la:
 * resposta fora do contrato é tratada como falha da inferência (→ CONTINGENCIA_503).
 */
import { StatusCorEnum } from './common.contract';
import { CoordinateContract } from './telemetry.contract';
import { z } from './zod';

export const InferenceRequestContract = z
  .object({
    pdv_id: z.number().int().positive(),
    coordenadas_simuladas: z.array(CoordinateContract),
    transacoes_pos_ultimos_3m: z.number().int().min(0),
    estoque_percentual: z.number().int().min(0).max(100),
  })
  .strict()
  .openapi('AiEngineInferenceRequest', {
    description: 'Payload enviado pelo Gateway ao ai-engine (POST /api/v1/inferencia).',
  });

export const InferenceResponseContract = z
  .object({
    pdv_id: z.number().int().positive(),
    contagem_pessoas: z.number().int().min(0),
    tempo_espera_seg: z.number().int().min(0),
    densidade_m2: z.number().min(0),
    status_cor: StatusCorEnum,
    confianca_ia: z.number().min(0).max(1),
    alerta_ruptura_estoque: z.boolean(),
    tempo_estimado_reposicao_min: z.number().int().min(0).nullable().optional(),
  })
  .strict()
  .openapi('AiEngineInferenceResponse', {
    description: 'Resposta esperada do ai-engine. Validada com .strict() em runtime pelo Gateway.',
  });

export type InferenceRequest = z.infer<typeof InferenceRequestContract>;
export type InferenceResponse = z.infer<typeof InferenceResponseContract>;
