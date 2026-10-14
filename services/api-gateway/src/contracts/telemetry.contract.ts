/**
 * Contratos de telemetria — Endpoint 1 (`POST /api/v1/telemetry/frame-analysis`)
 * e leitura consolidada reutilizada por Endpoint 2 e pelo SSE (Endpoint 6).
 * Fonte: PROJECT_CONTEXT.md §5.2.
 *
 * Guardrail de anonimato (§1.4 / §2): nenhum campo de identificação pessoal,
 * biometria ou rastreamento individual existe nestes contratos; `.strict()`
 * rejeita qualquer tentativa de injetar tais campos.
 */
import { IsoDateTime, ModoLeituraEnum, SensorStatusEnum, StatusCorEnum } from './common.contract';
import { z } from './zod';

/** Limite defensivo de pontos por frame (proteção contra payloads abusivos). */
export const MAX_COORDENADAS_POR_FRAME = 5000;

export const CoordinateContract = z
  .object({
    x: z.number().min(0).max(1000).openapi({ description: 'Coordenada X anônima na planta do estande (0..1000).', example: 412.5 }),
    y: z.number().min(0).max(1000).openapi({ description: 'Coordenada Y anônima na planta do estande (0..1000).', example: 233.1 }),
  })
  .strict()
  .openapi('Coordinate');

export const TelemetryAnalysisRequestContract = z
  .object({
    pdv_id: z.number().int().positive().openapi({ description: 'ID da zona/ponto monitorado.', example: 1 }),
    sensor_status: SensorStatusEnum,
    coordenadas_simuladas: z
      .array(CoordinateContract)
      .max(MAX_COORDENADAS_POR_FRAME)
      .openapi({ description: 'Posições anônimas e agregadas detectadas na zona.' }),
    transacoes_pos_ultimos_3m: z
      .number()
      .int()
      .min(0)
      .openapi({ description: 'Vendas/retiradas registradas pelo POS nos últimos 3 minutos.', example: 4 }),
    estoque_percentual: z
      .number()
      .int()
      .min(0)
      .max(100)
      .default(100)
      .openapi({ description: 'Nível atual do estoque da zona (0..100). Default 100.', example: 42 }),
  })
  .strict()
  .openapi('TelemetryAnalysisRequest', {
    example: {
      pdv_id: 1,
      sensor_status: 'ONLINE',
      coordenadas_simuladas: [
        { x: 120.5, y: 180.2 },
        { x: 122.0, y: 184.7 },
        { x: 125.3, y: 179.9 },
      ],
      transacoes_pos_ultimos_3m: 4,
      estoque_percentual: 42,
    },
  });

export const TelemetryReadingContract = z
  .object({
    id: z.number().int().positive(),
    pdv_id: z.number().int().positive(),
    timestamp: IsoDateTime,
    pax_count: z.number().int().min(0).openapi({ description: 'Pessoas contabilizadas (contagem agregada, anônima).' }),
    tempo_espera_seg: z.number().int().min(0).openapi({ description: 'Tempo de espera estimado em segundos.' }),
    densidade_m2: z.number().min(0).openapi({ description: 'Densidade em pessoas/m².', example: 0.78 }),
    status_cor: StatusCorEnum,
    ia_confidence: z.number().min(0).max(1).openapi({ description: 'Confiança da leitura (0..1).' }),
    alerta_ruptura_estoque: z
      .boolean()
      .openapi({ description: 'true se fila estagnada (pax >= 6 e POS = 0 em 3 min) ou estoque < 45%.' }),
    modo_leitura: ModoLeituraEnum,
  })
  .strict()
  .openapi('TelemetryReading');

export const TelemetryAnalysisResponseContract = z
  .object({
    sucesso: z
      .boolean()
      .openapi({ description: 'true apenas para leitura TEMPO_REAL; false quando um plano de contingência foi aplicado.' }),
    aviso_contingencia: z
      .string()
      .nullable()
      .openapi({ description: 'Mensagem operacional do plano de contingência aplicado (null em TEMPO_REAL).' }),
    leitura: TelemetryReadingContract,
  })
  .strict()
  .openapi('TelemetryAnalysisResponse');

export type Coordinate = z.infer<typeof CoordinateContract>;
export type TelemetryAnalysisRequest = z.infer<typeof TelemetryAnalysisRequestContract>;
export type TelemetryReading = z.infer<typeof TelemetryReadingContract>;
export type TelemetryAnalysisResponse = z.infer<typeof TelemetryAnalysisResponseContract>;
