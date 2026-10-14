/**
 * Contratos dos eventos SSE — Endpoint 6 (`GET /api/v1/telemetry/stream`).
 * Cada evento enviado no `text/event-stream` é validado por estes schemas antes do envio.
 */
import { IsoDateTime, StatusCorEnum } from './common.contract';
import { OperationalDispatchResponseContract } from './dispatch.contract';
import { PdvStatusResponseContract } from './pdv.contract';
import { TelemetryReadingContract } from './telemetry.contract';
import { z } from './zod';

export const SseSnapshotEventContract = z
  .object({
    tipo: z.literal('snapshot'),
    emitido_em: IsoDateTime,
    zonas: PdvStatusResponseContract,
  })
  .strict()
  .openapi('SseSnapshotEvent', { description: 'Primeiro evento da conexão: fotografia completa das zonas.' });

export const SseLeituraEventContract = z
  .object({
    tipo: z.literal('leitura'),
    emitido_em: IsoDateTime,
    leitura: TelemetryReadingContract,
    habilitar_redirecionamento_push: z.boolean(),
  })
  .strict()
  .openapi('SseLeituraEvent', { description: 'Nova leitura registrada (qualquer modo_leitura).' });

export const SseMudancaCorEventContract = z
  .object({
    tipo: z.literal('mudanca_cor'),
    emitido_em: IsoDateTime,
    pdv_id: z.number().int().positive(),
    cor_anterior: StatusCorEnum.nullable(),
    cor_atual: StatusCorEnum,
  })
  .strict()
  .openapi('SseMudancaCorEvent', { description: 'Mudança de status_cor de uma zona.' });

export const SseDispatchEventContract = z
  .object({
    tipo: z.literal('dispatch'),
    emitido_em: IsoDateTime,
    dispatch: OperationalDispatchResponseContract,
  })
  .strict()
  .openapi('SseDispatchEvent', { description: 'Nova intervenção operacional registrada.' });

export const SseEventContract = z
  .discriminatedUnion('tipo', [
    SseSnapshotEventContract,
    SseLeituraEventContract,
    SseMudancaCorEventContract,
    SseDispatchEventContract,
  ])
  .openapi('SseEvent');

export type SseEvent = z.infer<typeof SseEventContract>;
export type SseEventTipo = SseEvent['tipo'];
