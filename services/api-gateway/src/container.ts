/**
 * Composição de dependências (container simples).
 */
import { venueRepository } from './repositories/venue.repository';
import { aiEngineClient } from './services/ai-engine.client';
import { TelemetryService } from './services/telemetry.service';
import { VenueQueryService } from './services/venue-query.service';

export const telemetryService = new TelemetryService(venueRepository, aiEngineClient);
export const venueQueryService = new VenueQueryService(venueRepository, aiEngineClient);
