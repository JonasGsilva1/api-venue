/**
 * Contratos do Endpoint 2 — `GET /api/v1/pdv/status` (PROJECT_CONTEXT.md §5.2).
 */
import { PdvTipoEnum } from './common.contract';
import { TelemetryReadingContract } from './telemetry.contract';
import { z } from './zod';

export const PdvStatusItemContract = z
  .object({
    id: z.number().int().positive(),
    nome: z.string(),
    tipo: PdvTipoEnum,
    capacidade: z.number().int().min(0),
    localizacao_geo: z.string(),
    area_m2: z.number().positive(),
    ultima_leitura: TelemetryReadingContract.nullable(),
    habilitar_redirecionamento_push: z
      .boolean()
      .openapi({ description: 'true EXCLUSIVAMENTE quando ultima_leitura.tempo_espera_seg > 180 (Paradoxo do Roteamento).' }),
  })
  .strict()
  .openapi('PdvStatusItem');

export const PdvStatusResponseContract = z.array(PdvStatusItemContract).openapi('PdvStatusResponse');

export type PdvStatusItem = z.infer<typeof PdvStatusItemContract>;
export type PdvStatusResponse = z.infer<typeof PdvStatusResponseContract>;
