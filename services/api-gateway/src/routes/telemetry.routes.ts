/**
 * Rotas de telemetria — Endpoints 1 e 6.
 */
import { Router } from 'express';
import { EmptyQueryContract, TelemetryAnalysisRequestContract, TelemetryAnalysisResponseContract } from '../contracts';
import { telemetryService, venueQueryService } from '../container';
import { asyncHandler, parseInput, sendContract } from '../http/contract';
import { sseHub } from '../services/sse.hub';

export const telemetryRouter = Router();

/** Endpoint 1 — Ingestão e resiliência. */
telemetryRouter.post(
  '/frame-analysis',
  asyncHandler(async (req, res) => {
    parseInput(EmptyQueryContract, req.query as unknown, 'query', req);
    const entrada = parseInput(TelemetryAnalysisRequestContract, req.body as unknown, 'body', req);
    const resultado = await telemetryService.analisarFrame(entrada);
    sendContract(res, resultado.httpStatus, TelemetryAnalysisResponseContract, resultado.body);
  }),
);

/** Endpoint 6 — Server-Sent Events. */
telemetryRouter.get('/stream', (req, res, next) => {
  try {
    parseInput(EmptyQueryContract, req.query as unknown, 'query', req);
  } catch (erro: unknown) {
    next(erro);
    return;
  }
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write('retry: 3000\n\n');

  sseHub.registrar(res);
  sseHub.enviar(res, {
    tipo: 'snapshot',
    emitido_em: new Date().toISOString(),
    zonas: venueQueryService.statusPdvs(),
  });
});
