/**
 * Configuração de ambiente validada por Zod (falha rápida em boot se inválida).
 */
import { z } from 'zod';

const EnvContract = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  AI_ENGINE_URL: z.string().url().default('http://localhost:8000'),
  AI_ENGINE_TIMEOUT_MS: z.coerce.number().int().positive().default(2500),
  AI_ENGINE_PING_TIMEOUT_MS: z.coerce.number().int().positive().default(800),
  WINDOW_TIME_MIN: z.coerce.number().positive().default(30),
  DESLOCAMENTO_MEDIO_MIN: z.coerce.number().min(0).default(8),
  CORS_ORIGINS: z.string().default('*'),
});

export type AppConfig = z.infer<typeof EnvContract>;

function loadConfig(): AppConfig {
  const parsed = EnvContract.safeParse({
    PORT: process.env.PORT,
    AI_ENGINE_URL: process.env.AI_ENGINE_URL,
    AI_ENGINE_TIMEOUT_MS: process.env.AI_ENGINE_TIMEOUT_MS,
    AI_ENGINE_PING_TIMEOUT_MS: process.env.AI_ENGINE_PING_TIMEOUT_MS,
    WINDOW_TIME_MIN: process.env.WINDOW_TIME_MIN,
    DESLOCAMENTO_MEDIO_MIN: process.env.DESLOCAMENTO_MEDIO_MIN,
    CORS_ORIGINS: process.env.CORS_ORIGINS,
  });
  if (!parsed.success) {
    const detalhes = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuração de ambiente inválida: ${detalhes}`);
  }
  return parsed.data;
}

export const config: AppConfig = loadConfig();
