/**
 * Contratos do Endpoint 3 — `POST|GET /api/v1/ops/dispatch` (PROJECT_CONTEXT.md §5.2).
 */
import { DispatchStatusEnum, IsoDateTime, NivelCriticoEnum } from './common.contract';
import { z } from './zod';

export const OperationalDispatchRequestContract = z
  .object({
    pdv_id: z.number().int().positive().openapi({ example: 1 }),
    nivel_critico: NivelCriticoEnum,
    sugestao_acao: z
      .string()
      .trim()
      .min(5)
      .max(500)
      .openapi({ description: 'Ação sugerida ao staff (mínimo 5 caracteres).', example: 'Acionar reposição lateral de chopp no Z1' }),
  })
  .strict()
  .openapi('OperationalDispatchRequest');

export const OperationalDispatchResponseContract = z
  .object({
    id: z.number().int().positive(),
    pdv_id: z.number().int().positive(),
    nivel_critico: NivelCriticoEnum,
    sugestao_acao: z.string(),
    status: DispatchStatusEnum,
    criado_em: IsoDateTime,
  })
  .strict()
  .openapi('OperationalDispatchResponse');

export const OperationalDispatchListResponseContract = z
  .array(OperationalDispatchResponseContract)
  .openapi('OperationalDispatchListResponse');

export type OperationalDispatchRequest = z.infer<typeof OperationalDispatchRequestContract>;
export type OperationalDispatchResponse = z.infer<typeof OperationalDispatchResponseContract>;
