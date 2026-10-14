/**
 * Contratos do Produto 2: Acionamento Preditivo de Eventos Críticos (PROJECT_CONTEXT.md §8.3).
 * Todos os schemas são Zod .strict().
 */
import { IsoDateTime } from './common.contract';
import { z } from './zod';

export const NivelPreditoEnum = z
  .enum(['BAIXO', 'MEDIO', 'ALTO', 'CRITICO'])
  .openapi('NivelPredito', { description: 'Gravidade predita para a formação de gargalo.' });

export const PredicaoGargaloResponseContract = z
  .object({
    setor: z.string().openapi({ example: 'Portão Principal / Entrada Norte' }),
    nivel_predito: NivelPreditoEnum.openapi({ example: 'CRITICO' }),
    motivo: z.string().openapi({ example: 'Aumento repentino de fluxo detectado por IA' }),
    acao_recomendada: z.string().openapi({ example: 'Acionar 2 filas adicionais' }),
    tempo_estimado_formacao_fila: z.string().openapi({ example: '03m 30s' }),
  })
  .strict()
  .openapi('PredicaoGargaloResponse', {
    example: {
      setor: 'Portão Principal / Entrada Norte',
      nivel_predito: 'CRITICO',
      motivo: 'Aumento repentino de fluxo detectado por IA',
      acao_recomendada: 'Acionar 2 filas adicionais',
      tempo_estimado_formacao_fila: '03m 30s',
    },
  });

export const AcionarFluxoRequestContract = z
  .object({
    alerta_id: z.string().openapi({ example: 'PRED-9921' }),
    acao_executada: z.string().openapi({ example: 'ACIONAR_DUAS_FILAS_ADICIONAIS' }),
    setor: z.string().openapi({ example: 'Portão Principal' }),
  })
  .strict()
  .openapi('AcionarFluxoRequest', {
    example: {
      alerta_id: 'PRED-9921',
      acao_executada: 'ACIONAR_DUAS_FILAS_ADICIONAIS',
      setor: 'Portão Principal',
    },
  });

export const StatusOperacionalEventoEnum = z
  .enum(['ESTAVEL', 'ACAO_EM_ANDAMENTO', 'PRESSAO_MODERADA', 'CRITICO'])
  .openapi('StatusOperacionalEvento', { description: 'Estado operacional global do evento.' });

export const AcionarFluxoResponseContract = z
  .object({
    alerta_id: z.string().openapi({ example: 'PRED-9921' }),
    acao_executada: z.string().openapi({ example: 'ACIONAR_DUAS_FILAS_ADICIONAIS' }),
    setor: z.string().openapi({ example: 'Portão Principal' }),
    status_operacional_evento: z.literal('ACAO_EM_ANDAMENTO').openapi({ example: 'ACAO_EM_ANDAMENTO' }),
    timestamp: IsoDateTime,
  })
  .strict()
  .openapi('AcionarFluxoResponse', {
    example: {
      alerta_id: 'PRED-9921',
      acao_executada: 'ACIONAR_DUAS_FILAS_ADICIONAIS',
      setor: 'Portão Principal',
      status_operacional_evento: 'ACAO_EM_ANDAMENTO',
      timestamp: '2026-10-13T23:00:00.000Z',
    },
  });

export type PredicaoGargaloResponse = z.infer<typeof PredicaoGargaloResponseContract>;
export type AcionarFluxoRequest = z.infer<typeof AcionarFluxoRequestContract>;
export type AcionarFluxoResponse = z.infer<typeof AcionarFluxoResponseContract>;
export type StatusOperacionalEvento = z.infer<typeof StatusOperacionalEventoEnum>;
