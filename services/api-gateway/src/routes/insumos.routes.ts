/**
 * Rotas do Produto 1: Métrica de Insumos (PROJECT_CONTEXT.md §8.3).
 */
import { Router } from 'express';
import {
  EmptyQueryContract,
  InsumosStatusResponseContract,
  ReabastecimentoRequestContract,
  ReabastecimentoResponseContract,
} from '../contracts';
import { asyncHandler, parseInput, sendContract } from '../http/contract';
import { authMiddleware, requireRole } from '../middlewares/auth.middleware';
import { raizEventoService } from '../services/raizevento.service';

export const insumosRouter = Router();

// Aplica autenticação Bearer JWT nas rotas de insumos (com suporte a dev-token)
insumosRouter.use(authMiddleware);

/** GET /api/v1/insumos/status */
insumosRouter.get(
  '/status',
  asyncHandler(async (req, res) => {
    parseInput(EmptyQueryContract, req.query as unknown, 'query', req);
    const dados = raizEventoService.obterStatusInsumos();
    sendContract(res, 200, InsumosStatusResponseContract, dados);
  }),
);

/** POST /api/v1/insumos/reabastecimento */
insumosRouter.post(
  '/reabastecimento',
  requireRole(['operador', 'admin']),
  asyncHandler(async (req, res) => {
    parseInput(EmptyQueryContract, req.query as unknown, 'query', req);
    const entrada = parseInput(ReabastecimentoRequestContract, req.body as unknown, 'body', req);
    const resposta = raizEventoService.solicitarReabastecimento(entrada);
    sendContract(res, 201, ReabastecimentoResponseContract, resposta);
  }),
);
