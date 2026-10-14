/**
 * Registro OpenAPI 3.0 gerado a partir dos MESMOS contratos Zod usados em runtime
 * (PROJECT_CONTEXT.md §1.3). Exposto em `/openapi.json` e `/docs` (Swagger UI).
 */
import { OpenAPIRegistry, OpenApiGeneratorV3, type RouteConfig } from '@asteasolutions/zod-to-openapi';
import { config } from '../config/env';
import {
  AnalyticsSummaryResponseContract,
  ErrorResponseContract,
  InferenceRequestContract,
  InferenceResponseContract,
  OperationalDispatchListResponseContract,
  OperationalDispatchRequestContract,
  OperationalDispatchResponseContract,
  PdvStatusResponseContract,
  ReadinessHeatmapResponseContract,
  SseEventContract,
  TelemetryAnalysisRequestContract,
  TelemetryAnalysisResponseContract,
  z,
} from '../contracts';

type Responses = RouteConfig['responses'];

const json = <T extends z.ZodTypeAny>(schema: T) => ({ 'application/json': { schema } });

const erro = (description: string): Responses[number] => ({ description, content: json(ErrorResponseContract) });

const ERROS_PADRAO: Responses = {
  400: erro('Violação do contrato estrito (.strict()): campos extras, tipos errados, limites ou JSON malformado.'),
  500: erro('Erro interno inesperado (registrado em log). O servidor permanece estável.'),
};

const TAGS = {
  telemetria: 'Telemetria & Resiliência',
  zonas: 'Zonas & Roteamento',
  ops: 'Operações (Staff)',
  analytics: 'Analytics de Negócio',
  venue: 'Readiness & Heatmap',
} as const;

export function buildOpenApiDocument(): ReturnType<OpenApiGeneratorV3['generateDocument']> {
  const registry = new OpenAPIRegistry();

  // Componentes auxiliares (referência para integrações).
  registry.register('AiEngineInferenceRequest', InferenceRequestContract);
  registry.register('AiEngineInferenceResponse', InferenceResponseContract);
  registry.register('SseEvent', SseEventContract);

  // ── Endpoint 1 ────────────────────────────────────────────────────────────
  registry.registerPath({
    method: 'post',
    path: '/api/v1/telemetry/frame-analysis',
    operationId: 'analisarFrameTelemetria',
    tags: [TAGS.telemetria],
    summary: 'Ingestão de telemetria com resiliência (400/502/503/504)',
    description: [
      'Valida o lote de telemetria anônima com contrato `.strict()`, consulta o `ai-engine` (timeout estrito de',
      `${config.AI_ENGINE_TIMEOUT_MS}ms) e aplica a Matriz de Resiliência:`,
      '',
      '- **201** `TEMPO_REAL` — inferência do ai-engine.',
      '- **502** `FALLBACK_502` — `sensor_status = OFFLINE`; interpolação da tendência dos últimos 15 min × POS.',
      '- **504** `MEDIA_MOVEL_504` — ai-engine excedeu o timeout; média móvel dos últimos 3 min.',
      '- **503** `CONTINGENCIA_503` — ai-engine fora (ECONNREFUSED/5xx/resposta fora do contrato); heurística POS + contagem bruta.',
      '',
      'Em 502/503/504 o corpo continua sendo `TelemetryAnalysisResponse` com `sucesso=false` e `aviso_contingencia` preenchido.',
    ].join('\n'),
    request: { body: { required: true, content: json(TelemetryAnalysisRequestContract) } },
    responses: {
      201: { description: 'Leitura em TEMPO_REAL registrada.', content: json(TelemetryAnalysisResponseContract) },
      ...ERROS_PADRAO,
      404: erro('pdv_id inexistente no seed do estande.'),
      413: erro('Payload excede o tamanho máximo.'),
      502: { description: 'Sensor OFFLINE — leitura estimada (FALLBACK_502).', content: json(TelemetryAnalysisResponseContract) },
      503: { description: 'ai-engine indisponível — Modo de Contingência (CONTINGENCIA_503).', content: json(TelemetryAnalysisResponseContract) },
      504: { description: 'Timeout do ai-engine — média móvel de 3 min (MEDIA_MOVEL_504).', content: json(TelemetryAnalysisResponseContract) },
    },
  });

  // ── Endpoint 2 ────────────────────────────────────────────────────────────
  registry.registerPath({
    method: 'get',
    path: '/api/v1/pdv/status',
    operationId: 'listarStatusPdvs',
    tags: [TAGS.zonas],
    summary: 'Fotografia em tempo real das zonas do estande',
    description:
      'Retorna todas as zonas com a última leitura e `habilitar_redirecionamento_push` (true EXCLUSIVAMENTE quando `tempo_espera_seg > 180`). Não aceita query params.',
    responses: {
      200: { description: 'Estado operacional das zonas.', content: json(PdvStatusResponseContract) },
      ...ERROS_PADRAO,
    },
  });

  // ── Endpoint 3 ────────────────────────────────────────────────────────────
  registry.registerPath({
    method: 'post',
    path: '/api/v1/ops/dispatch',
    operationId: 'criarDispatchOperacional',
    tags: [TAGS.ops],
    summary: 'Registrar intervenção operacional humana',
    description:
      'Registra realocação de Staff Móvel, reposição lateral de estoque, liberação de rota PCD ou contingência climática (`CRITICO_PCD_CLIMA`). Status inicial `PENDENTE`. Emite evento SSE `dispatch`.',
    request: { body: { required: true, content: json(OperationalDispatchRequestContract) } },
    responses: {
      201: { description: 'Intervenção registrada.', content: json(OperationalDispatchResponseContract) },
      ...ERROS_PADRAO,
      404: erro('pdv_id inexistente no seed do estande.'),
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/ops/dispatch',
    operationId: 'listarDispatchesOperacionais',
    tags: [TAGS.ops],
    summary: 'Listar intervenções operacionais',
    description: 'Lista as intervenções registradas (mais recentes primeiro).',
    responses: {
      200: { description: 'Lista de intervenções.', content: json(OperationalDispatchListResponseContract) },
      ...ERROS_PADRAO,
    },
  });

  // ── Endpoint 4 ────────────────────────────────────────────────────────────
  registry.registerPath({
    method: 'get',
    path: '/api/v1/analytics/dropoff-summary',
    operationId: 'resumoDropoff',
    tags: [TAGS.analytics],
    summary: 'Window Time, Queue Time, Density Point, Drop-off Rate, CES e síntese D1-D3',
    description: [
      '- `queue_time_medio_min`: média das esperas atuais em zonas de fila (BAR, BANHEIRO, CATRACA).',
      `- \`dropoff_rate_estimado_pct\`: razão r = (deslocamento ${config.DESLOCAMENTO_MEDIO_MIN} min + fila) / window. Se r >= 25/30 → > 80% (linear até 100%); abaixo, 80·(r/(25/30))².`,
      '- `ces_score`: 1 + 4·r (limitado a 1..5; 5 = esforço máximo).',
      '- `density_point_atingido`: alguma zona em VERMELHO (> 12 min).',
    ].join('\n'),
    responses: {
      200: { description: 'Métricas consolidadas.', content: json(AnalyticsSummaryResponseContract) },
      ...ERROS_PADRAO,
    },
  });

  // ── Endpoint 5 ────────────────────────────────────────────────────────────
  registry.registerPath({
    method: 'get',
    path: '/api/v1/venue/readiness-heatmap',
    operationId: 'readinessHeatmap',
    tags: [TAGS.venue],
    summary: 'Readiness pós-montagem (S01) e Mapa de Calor global (S06)',
    description:
      'Readiness: sensores ONLINE, estoque dos BARs >= 45%, rota livre (sem dispatch CRITICO_PCD_CLIMA pendente e acessos fora do VERMELHO) e ping ao ai-engine. Heatmap: agregados anônimos das leituras atuais (velocidade via modelo de Greenshields).',
    responses: {
      200: { description: 'Indicadores de prontidão e mapa de calor.', content: json(ReadinessHeatmapResponseContract) },
      ...ERROS_PADRAO,
    },
  });

  // ── Endpoint 6 ────────────────────────────────────────────────────────────
  registry.registerPath({
    method: 'get',
    path: '/api/v1/telemetry/stream',
    operationId: 'streamTelemetria',
    tags: [TAGS.telemetria],
    summary: 'Canal Server-Sent Events (SSE) em tempo real',
    description: [
      'Conexão `text/event-stream` persistente. Cada mensagem tem `event: <tipo>` e `data: <JSON>` validado pelo componente `SseEvent`:',
      '',
      '- `snapshot` — enviado ao conectar (todas as zonas).',
      '- `leitura` — nova leitura (qualquer `modo_leitura`).',
      '- `mudanca_cor` — mudança de `status_cor` de uma zona.',
      '- `dispatch` — nova intervenção operacional.',
      '',
      'Heartbeat (comentário SSE) a cada 15s. **O Swagger UI não renderiza streams**; teste com `curl -N` ou `EventSource`.',
    ].join('\n'),
    responses: {
      200: {
        description: 'Stream SSE aberto.',
        content: {
          'text/event-stream': {
            schema: z.string().openapi({
              example: 'event: mudanca_cor\ndata: {"tipo":"mudanca_cor","emitido_em":"2026-10-13T22:00:00.000Z","pdv_id":1,"cor_anterior":"VERDE","cor_atual":"AMARELO"}\n\n',
            }),
          },
        },
      },
      400: erro('Query params não permitidos.'),
    },
  });

  return new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'Venue Intelligence Core — API Gateway',
      version: '0.1.0',
      description:
        'Gateway de orquestração do estande RAIZ. **Contract-First**: todos os contratos são Zod `.strict()` — campos não mapeados retornam 400. Dados 100% sintéticos e anônimos (sem identificação individual ou biometria).',
    },
    servers: [
      { url: '/', description: 'Servidor atual (automático / Render / produção / local)' },
      { url: `http://localhost:${config.PORT}`, description: 'Desenvolvimento local explícito' },
    ],
    tags: [
      { name: TAGS.telemetria, description: 'Ingestão, Matriz de Resiliência e SSE.' },
      { name: TAGS.zonas, description: 'Status das zonas e Paradoxo do Roteamento.' },
      { name: TAGS.ops, description: 'Intervenções humanas assistidas.' },
      { name: TAGS.analytics, description: 'Drop-off Rate, CES e acumulados.' },
      { name: TAGS.venue, description: 'Readiness S01 e Heatmap S06.' },
    ],
  });
}
