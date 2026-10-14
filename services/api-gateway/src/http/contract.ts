/**
 * Utilitários Contract-First para Express.
 *
 * - `parseInput`: única porta de entrada de dados. `req.body`/`req.query` são tratados como
 *   `unknown` e só viram dados tipados após validação Zod `.strict()`.
 * - `sendContract`: toda resposta é revalidada contra o contrato de saída antes do envio.
 * - `asyncHandler`: propaga rejeições de Promises ao error handler (Express 4).
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodType, ZodTypeDef } from 'zod';
import type { ContractViolation } from '../contracts';
import { logger } from '../utils/logger';
import { ContractViolationError, ResponseContractError } from './errors';

export type InputLocation = ContractViolation['local'];

export function parseInput<TOut>(
  schema: ZodType<TOut, ZodTypeDef, unknown>,
  dados: unknown,
  local: InputLocation,
  req: Request,
): TOut {
  const resultado = schema.safeParse(dados);
  if (resultado.success) return resultado.data;

  const violacoes: ContractViolation[] = resultado.error.issues.map((issue) => ({
    local,
    campo: issue.path.join('.'),
    codigo: issue.code,
    mensagem: issue.message,
  }));

  // §6.1 — registro do descarte no log de auditoria (somente metadados; nunca o payload bruto).
  logger.audit('contrato.descartado', {
    metodo: req.method,
    rota: req.originalUrl,
    local,
    total_violacoes: violacoes.length,
    campos: violacoes.map((v) => v.campo || '(raiz)'),
    codigos: violacoes.map((v) => v.codigo),
  });

  throw new ContractViolationError(violacoes);
}

export function sendContract<TOut>(
  res: Response,
  status: number,
  schema: ZodType<TOut, ZodTypeDef, unknown>,
  dados: TOut,
): void {
  const resultado = schema.safeParse(dados);
  if (!resultado.success) {
    throw new ResponseContractError(
      resultado.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    );
  }
  res.status(status).json(resultado.data);
}

type AsyncRoute = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export function asyncHandler(fn: AsyncRoute): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
