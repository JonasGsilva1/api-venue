/**
 * Exporta o OpenAPI para arquivo (`npm run openapi:export`) — útil para geração de clientes no dashboard.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildOpenApiDocument } from './openapi';

const destino = resolve(process.cwd(), 'openapi.json');
writeFileSync(destino, JSON.stringify(buildOpenApiDocument(), null, 2), 'utf-8');
process.stdout.write(`OpenAPI exportado em ${destino}\n`);
