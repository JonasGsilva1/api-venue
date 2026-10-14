/**
 * Instância única do Zod estendida com `.openapi()`.
 *
 * TODOS os contratos devem importar `z` deste módulo (e não diretamente de 'zod'),
 * garantindo que o mesmo schema que valida em runtime gere a especificação OpenAPI
 * exibida no Swagger (`/docs`) — PROJECT_CONTEXT.md §1.3.
 */
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

export { z };
