/**
 * Rotas do Produto 2: Acionamento Preditivo de Eventos Críticos (PROJECT_CONTEXT.md §8.3).
 */
import { Router } from 'express';
import {
  AcionarFluxoRequestContract,
  AcionarFluxoResponseContract,
  EmptyQueryContract,
  PredicaoGargaloResponseContract,
} from '../contracts';
import { asyncHandler, parseInput, sendContract } from '../http/contract';
import { authMiddleware, requireRole } from '../middlewares/auth.middleware';
import { raizEventoService } from '../services/raizevento.service';

export const predicoesRouter = Router();

// Aplica autenticação Bearer JWT nas rotas preditivas (com suporte a dev-token)
predicoesRouter.use(authMiddleware);

/** GET /api/v1/predicoes/gargalos */
predicoesRouter.get(
  '/gargalos',
  asyncHandler(async (req, res) => {
    parseInput(EmptyQueryContract, req.query as unknown, 'query', req);
    const predicao = raizEventoService.obterPredicaoGargalo();
    sendContract(res, 200, PredicaoGargaloResponseContract, predicao);
  }),
);

/** POST /api/v1/predicoes/acionar-fluxo */
predicoesRouter.post(
  '/acionar-fluxo',
  requireRole(['operador', 'admin']),
  asyncHandler(async (req, res) => {
    parseInput(EmptyQueryContract, req.query as unknown, 'query', req);
    const entrada = parseInput(AcionarFluxoRequestContract, req.body as unknown, 'body', req);
    const resposta = raizEventoService.acionarFluxo(entrada);
    sendContract(res, 200, AcionarFluxoResponseContract, resposta);
  }),
);
