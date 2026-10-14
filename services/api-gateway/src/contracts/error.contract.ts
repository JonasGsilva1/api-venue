/**
 * ErrorResponseContract — contrato de erro padronizado (PROJECT_CONTEXT.md §6).
 * Todo erro não-fallback (400, 404, 413, 500) é devolvido exclusivamente neste formato.
 */
import { IsoDateTime } from './common.contract';
import { z } from './zod';

export const ErrorCodeEnum = z
  .enum([
    'CONTRATO_VIOLADO',
    'JSON_MALFORMADO',
    'PAYLOAD_EXCEDIDO',
    'RECURSO_NAO_ENCONTRADO',
    'ROTA_NAO_ENCONTRADA',
    'ERRO_INTERNO',
  ])
  .openapi('ErrorCode');

export const ContractViolationContract = z
  .object({
    local: z.enum(['body', 'query', 'params']).openapi({ description: 'Parte da requisição que violou o contrato.' }),
    campo: z.string().openapi({ description: 'Caminho do campo (dot-notation).', example: 'coordenadas_simuladas.0.x' }),
    codigo: z.string().openapi({ description: 'Código da violação Zod.', example: 'too_big' }),
    mensagem: z.string().openapi({ example: 'Number must be less than or equal to 1000' }),
  })
  .strict()
  .openapi('ContractViolation');

export const ErrorResponseContract = z
  .object({
    sucesso: z.literal(false),
    erro: ErrorCodeEnum,
    mensagem: z.string(),
    violacoes: z.array(ContractViolationContract),
    timestamp: IsoDateTime,
  })
  .strict()
  .openapi('ErrorResponse', {
    example: {
      sucesso: false,
      erro: 'CONTRATO_VIOLADO',
      mensagem: 'Payload rejeitado: violação do contrato estrito.',
      violacoes: [
        { local: 'body', campo: 'coordenadas_simuladas.0.x', codigo: 'too_big', mensagem: 'Number must be less than or equal to 1000' },
        { local: 'body', campo: '', codigo: 'unrecognized_keys', mensagem: "Unrecognized key(s) in object: 'rosto_id'" },
      ],
      timestamp: '2026-10-13T22:00:00.000Z',
    },
  });

export type ErrorCode = z.infer<typeof ErrorCodeEnum>;
export type ContractViolation = z.infer<typeof ContractViolationContract>;
export type ErrorResponse = z.infer<typeof ErrorResponseContract>;
