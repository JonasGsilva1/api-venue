/**
 * Error handler central — garante que TODO erro saia no `ErrorResponseContract` (§6)
 * e que o servidor permaneça estável.
 */
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ErrorResponseContract, type ErrorCode, type ErrorResponse } from '../contracts';
import { logger } from '../utils/logger';
import { HttpError, ResponseContractError } from './errors';

function buildError(codigo: ErrorCode, mensagem: string, violacoes: ErrorResponse['violacoes'] = []): ErrorResponse {
  return ErrorResponseContract.parse({
    sucesso: false,
    erro: codigo,
    mensagem,
    violacoes,
    timestamp: new Date().toISOString(),
  });
}

interface BodyParserError {
  readonly type: string;
  readonly status: number;
}

function isBodyParserError(err: unknown): err is BodyParserError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    typeof (err as { type: unknown }).type === 'string' &&
    'status' in err
  );
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json(buildError('ROTA_NAO_ENCONTRADA', `Rota não encontrada: ${req.method} ${req.path}`));
};

export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  if (res.headersSent) return;

  if (err instanceof HttpError) {
    res.status(err.status).json(buildError(err.codigo, err.message, [...err.violacoes]));
    return;
  }

  if (isBodyParserError(err)) {
    if (err.type === 'entity.parse.failed') {
      logger.audit('contrato.descartado', { metodo: req.method, rota: req.originalUrl, local: 'body', motivo: 'JSON_MALFORMADO' });
      res.status(400).json(buildError('JSON_MALFORMADO', 'Corpo da requisição não é um JSON válido.'));
      return;
    }
    if (err.type === 'entity.too.large') {
      logger.audit('contrato.descartado', { metodo: req.method, rota: req.originalUrl, local: 'body', motivo: 'PAYLOAD_EXCEDIDO' });
      res.status(413).json(buildError('PAYLOAD_EXCEDIDO', 'Payload excede o tamanho máximo permitido.'));
      return;
    }
  }

  const mensagem = err instanceof Error ? err.message : 'Erro desconhecido';
  logger.error('erro.interno', {
    metodo: req.method,
    rota: req.originalUrl,
    tipo: err instanceof ResponseContractError ? 'CONTRATO_SAIDA' : 'EXCECAO',
    mensagem,
  });
  res.status(500).json(buildError('ERRO_INTERNO', 'Erro interno no API Gateway. A ocorrência foi registrada.'));
};
