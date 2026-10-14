/**
 * Erros HTTP tipados tratados pelo error handler central.
 */
import type { ContractViolation, ErrorCode } from '../contracts';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly codigo: ErrorCode,
    mensagem: string,
    public readonly violacoes: readonly ContractViolation[] = [],
  ) {
    super(mensagem);
    this.name = 'HttpError';
  }
}

export class ContractViolationError extends HttpError {
  constructor(violacoes: readonly ContractViolation[]) {
    super(400, 'CONTRATO_VIOLADO', 'Payload rejeitado: violação do contrato estrito.', violacoes);
    this.name = 'ContractViolationError';
  }
}

export class NotFoundError extends HttpError {
  constructor(mensagem: string) {
    super(404, 'RECURSO_NAO_ENCONTRADO', mensagem);
    this.name = 'NotFoundError';
  }
}

/** Falha ao validar a PRÓPRIA resposta do gateway contra o contrato — bug interno, nunca vaza dado fora do schema. */
export class ResponseContractError extends Error {
  constructor(public readonly detalhes: string) {
    super(`Resposta do gateway violou o contrato de saída: ${detalhes}`);
    this.name = 'ResponseContractError';
  }
}
