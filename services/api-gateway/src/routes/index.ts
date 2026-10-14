import { Router } from 'express';
import { insumosRouter } from './insumos.routes';
import { predicoesRouter } from './predicoes.routes';
import { telemetryRouter } from './telemetry.routes';
import { analyticsRouter, opsRouter, pdvRouter, venueRouter } from './venue.routes';

export const apiV1Router = Router();

apiV1Router.use('/telemetry', telemetryRouter);
apiV1Router.use('/pdv', pdvRouter);
apiV1Router.use('/ops', opsRouter);
apiV1Router.use('/analytics', analyticsRouter);
apiV1Router.use('/venue', venueRouter);
apiV1Router.use('/insumos', insumosRouter);
apiV1Router.use('/predicoes', predicoesRouter);
