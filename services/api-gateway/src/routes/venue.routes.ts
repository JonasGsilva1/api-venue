/**
 * Rotas operacionais — Endpoints 2, 3, 4 e 5.
 */
import { Router } from 'express';
import {
  AnalyticsSummaryResponseContract,
  EmptyQueryContract,
  OperationalDispatchListResponseContract,
  OperationalDispatchRequestContract,
  OperationalDispatchResponseContract,
  PdvStatusResponseContract,
  ReadinessHeatmapResponseContract,
} from '../contracts';
import { venueQueryService } from '../container';
import { asyncHandler, parseInput, sendContract } from '../http/contract';
import { raizEventoService } from '../services/raizevento.service';
import { websocketHub } from '../services/websocket.hub';

export const pdvRouter = Router();
export const opsRouter = Router();
export const analyticsRouter = Router();
export const venueRouter = Router();

/** Endpoint 2 */
pdvRouter.get(
  '/status',
  asyncHandler(async (req, res) => {
    parseInput(EmptyQueryContract, req.query as unknown, 'query', req);
    sendContract(res, 200, PdvStatusResponseContract, venueQueryService.statusPdvs());
  }),
);

/** Endpoint 3 — POST */
opsRouter.post(
  '/dispatch',
  asyncHandler(async (req, res) => {
    parseInput(EmptyQueryContract, req.query as unknown, 'query', req);
    const entrada = parseInput(OperationalDispatchRequestContract, req.body as unknown, 'body', req);
    const resultado = venueQueryService.criarDispatch(entrada);
    raizEventoService.atualizarStatusEvento('ACAO_EM_ANDAMENTO');

    websocketHub.broadcast({
      tipo: 'despacho_operacional',
      emitido_em: new Date().toISOString(),
      dados: {
        id: resultado.id,
        pdv_id: resultado.pdv_id,
        nivel_critico: resultado.nivel_critico,
        sugestao_acao: resultado.sugestao_acao,
        status: resultado.status,
        status_operacional_evento: raizEventoService.obterStatusEvento(),
      },
    });

    sendContract(res, 201, OperationalDispatchResponseContract, resultado);
  }),
);

/** Endpoint 3 — GET */
opsRouter.get(
  '/dispatch',
  asyncHandler(async (req, res) => {
    parseInput(EmptyQueryContract, req.query as unknown, 'query', req);
    sendContract(res, 200, OperationalDispatchListResponseContract, venueQueryService.listarDispatches());
  }),
);

/** Endpoint 4 */
analyticsRouter.get(
  '/dropoff-summary',
  asyncHandler(async (req, res) => {
    parseInput(EmptyQueryContract, req.query as unknown, 'query', req);
    sendContract(res, 200, AnalyticsSummaryResponseContract, venueQueryService.resumoDropoff());
  }),
);

/** Endpoint 5 */
venueRouter.get(
  '/readiness-heatmap',
  asyncHandler(async (req, res) => {
    parseInput(EmptyQueryContract, req.query as unknown, 'query', req);
    sendContract(res, 200, ReadinessHeatmapResponseContract, await venueQueryService.readinessHeatmap());
  }),
);
