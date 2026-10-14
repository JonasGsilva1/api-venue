/**
 * Contratos do Produto 1: Métrica de Insumos (PROJECT_CONTEXT.md §8.3).
 * Todos os schemas são Zod .strict().
 */
import { IsoDateTime } from './common.contract';
import { z } from './zod';

export const InsumoStatusEnum = z
  .enum(['NORMAL', 'ATENCAO', 'DEFICIT_CRITICO'])
  .openapi('InsumoStatus', { description: 'Classificação de disponibilidade do insumo.' });

export const InsumoItemContract = z
  .object({
    item_id: z.string().openapi({ example: 'BAR-83-IPA' }),
    nome: z.string().openapi({ example: 'Chopp IPA (Barril 50L)' }),
    localizacao: z.string().openapi({ example: 'Bar Principal Norte' }),
    quantidade_atual: z.number().int().min(0).openapi({ example: 6 }),
    quantidade_minima: z.number().int().min(0).openapi({ example: 20 }),
    status: InsumoStatusEnum.openapi({ example: 'DEFICIT_CRITICO' }),
    deficit_estimado: z.number().int().min(0).openapi({ example: 14 }),
  })
  .strict()
  .openapi('InsumoItem');

export const InsumosStatusResponseContract = z
  .object({
    total_itens_monitorados: z.number().int().min(0).openapi({ example: 150 }),
    itens_em_deficit: z.number().int().min(0).openapi({ example: 3 }),
    insumos: z.array(InsumoItemContract),
  })
  .strict()
  .openapi('InsumosStatusResponse', {
    example: {
      total_itens_monitorados: 150,
      itens_em_deficit: 3,
      insumos: [
        {
          item_id: 'BAR-83-IPA',
          nome: 'Chopp IPA (Barril 50L)',
          localizacao: 'Bar Principal Norte',
          quantidade_atual: 6,
          quantidade_minima: 20,
          status: 'DEFICIT_CRITICO',
          deficit_estimado: 14,
        },
      ],
    },
  });

export const PrioridadeReabastecimentoEnum = z
  .enum(['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'])
  .openapi('PrioridadeReabastecimento', { description: 'Nível de prioridade da logística de reabastecimento.' });

export const ReabastecimentoRequestContract = z
  .object({
    item_id: z.string().openapi({ example: 'BAR-83-IPA' }),
    quantidade_solicitada: z.number().int().positive().openapi({ example: 14 }),
    prioridade: PrioridadeReabastecimentoEnum.openapi({ example: 'ALTA' }),
  })
  .strict()
  .openapi('ReabastecimentoRequest', {
    example: {
      item_id: 'BAR-83-IPA',
      quantidade_solicitada: 14,
      prioridade: 'ALTA',
    },
  });

export const ReabastecimentoResponseContract = z
  .object({
    protocolo_id: z.string().openapi({ example: 'REAB-2026-0042' }),
    item_id: z.string().openapi({ example: 'BAR-83-IPA' }),
    quantidade_solicitada: z.number().int().positive().openapi({ example: 14 }),
    prioridade: z.string().openapi({ example: 'ALTA' }),
    status_pedido: z.literal('SOLICITADO').openapi({ example: 'SOLICITADO' }),
    timestamp: IsoDateTime,
  })
  .strict()
  .openapi('ReabastecimentoResponse', {
    example: {
      protocolo_id: 'REAB-2026-0042',
      item_id: 'BAR-83-IPA',
      quantidade_solicitada: 14,
      prioridade: 'ALTA',
      status_pedido: 'SOLICITADO',
      timestamp: '2026-10-13T23:00:00.000Z',
    },
  });

export type InsumoItem = z.infer<typeof InsumoItemContract>;
export type InsumosStatusResponse = z.infer<typeof InsumosStatusResponseContract>;
export type ReabastecimentoRequest = z.infer<typeof ReabastecimentoRequestContract>;
export type ReabastecimentoResponse = z.infer<typeof ReabastecimentoResponseContract>;
