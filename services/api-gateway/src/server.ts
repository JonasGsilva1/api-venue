/**
 * Entry point do API Gateway (porta 3000).
 */
import { createApp } from './app';
import { config } from './config/env';
import { venueRepository } from './repositories/venue.repository';
import { sseHub } from './services/sse.hub';
import { logger } from './utils/logger';

const app = createApp();

const server = app.listen(config.PORT, () => {
  logger.info('gateway.iniciado', {
    porta: config.PORT,
    swagger: `http://localhost:${config.PORT}/docs`,
    openapi: `http://localhost:${config.PORT}/openapi.json`,
    ai_engine_url: config.AI_ENGINE_URL,
    ai_engine_timeout_ms: config.AI_ENGINE_TIMEOUT_MS,
    zonas_seed: venueRepository.listPdvs().length,
  });
});

function encerrar(sinal: string): void {
  logger.info('gateway.encerrando', { sinal });
  sseHub.encerrarTodos();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', () => encerrar('SIGINT'));
process.on('SIGTERM', () => encerrar('SIGTERM'));
process.on('unhandledRejection', (motivo: unknown) => {
  logger.error('processo.unhandled_rejection', { motivo: motivo instanceof Error ? motivo.message : String(motivo) });
});
