/**
 * Montagem da aplicação Express (sem `listen`, para facilitar testes).
 */
import cors from 'cors';
import express, { type Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import { config } from './config/env';
import { buildOpenApiDocument } from './docs/openapi';
import { errorHandler, notFoundHandler } from './http/error-handler';
import { apiV1Router } from './routes';

export function createApp(): Express {
  const app = express();
  const openApiDocument = buildOpenApiDocument();

  app.disable('x-powered-by');
  app.use(
    cors({
      origin: config.CORS_ORIGINS === '*' ? '*' : config.CORS_ORIGINS.split(',').map((o) => o.trim()),
    }),
  );
  app.use(express.json({ limit: '512kb', strict: true }));

  // Swagger obrigatório (PROJECT_CONTEXT.md §1.3)
  app.get('/openapi.json', (_req, res) => {
    res.json(openApiDocument);
  });
  app.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, {
      customSiteTitle: 'Venue Intelligence Core — API Gateway',
      swaggerOptions: { displayRequestDuration: true, tryItOutEnabled: true },
    }),
  );
  app.get('/', (_req, res) => {
    res.redirect(302, '/docs');
  });

  app.use('/api/v1', apiV1Router);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
