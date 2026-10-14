/**
 * Registro OpenAPI 3.0 gerado a partir dos MESMOS contratos Zod usados em runtime
 * (PROJECT_CONTEXT.md §1.3 e §8.3). Exposto em `/openapi.json` e `/docs` (Swagger UI).
 */
import { OpenAPIRegistry, OpenApiGeneratorV3, type RouteConfig } from '@asteasolutions/zod-to-openapi';
import { config } from '../config/env';
import {
  AcionarFluxoRequestContract,
  AcionarFluxoResponseContract,
  AnalyticsSummaryResponseContract,
  ErrorResponseContract,
  InferenceRequestContract,
  InferenceResponseContract,
  InsumosStatusResponseContract,
  OperationalDispatchListResponseContract,
  OperationalDispatchRequestContract,
  OperationalDispatchResponseContract,
  PdvStatusResponseContract,
  PredicaoGargaloResponseContract,
  ReabastecimentoRequestContract,
  ReabastecimentoResponseContract,
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
  401: erro('Não autorizado: Bearer Token JWT ausente ou inválido. Use "dev-token" para testes locais.'),
  403: erro('Acesso negado por controle de acesso baseado em papéis (RBAC).'),
  500: erro('Erro interno inesperado (registrado em log). O servidor permanece estável.'),
};

const TAGS = {
  telemetria: 'Telemetria & Resiliência',
  zonas: 'Zonas & Roteamento',
  ops: 'Operações (Staff)',
  analytics: 'Analytics de Negócio',
  venue: 'Prontidão & Mapa de Calor',
  insumos: 'Métrica de Insumos (Produto 1)',
  predicoes: 'Acionamento Preditivo (Produto 2)',
  realtime: 'Tempo Real (WebSocket & SSE)',
} as const;

export function buildOpenApiDocument(): ReturnType<OpenApiGeneratorV3['generateDocument']> {
  const registry = new OpenAPIRegistry();

  // Registro de Segurança Bearer JWT + RBAC (§8.1)
  registry.registerComponent('securitySchemes', 'BearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description:
      'Autenticação Bearer Token JWT com RBAC. Para testes diretos no Swagger, digite "dev-token" no campo de autorização.',
  });

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
    summary: 'Registrar intervenção operacional humana (Altera estado para ACAO_EM_ANDAMENTO)',
    description:
      'Registra realocação de Staff Móvel, reposição lateral de estoque, liberação de rota PCD ou contingência climática (`CRITICO_PCD_CLIMA`). Atualiza o estado operacional global do evento de ESTAVEL para ACAO_EM_ANDAMENTO (§8.2). Emite eventos SSE e WebSocket.',
    security: [{ BearerAuth: [] }],
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
    summary: 'Janela de Tempo, Fila Média, Abandono de Consumo (Drop-off Rate), Esforço (CES) e Síntese D1-D3',
    description: [
      '- `tempo_medio_fila_min`: média das esperas atuais em zonas de fila (BAR, BANHEIRO, CATRACA).',
      `- \`taxa_abandono_estimada_pct\`: razão r = (deslocamento ${config.DESLOCAMENTO_MEDIO_MIN} min + fila) / janela_tempo_min. Se r >= 25/30 → > 80% (linear até 100%); abaixo, 80·(r/(25/30))².`,
      '- `pontuacao_esforco_ces`: 1 + 4·r (limitado a 1..5; 5 = esforço crítico).',
      '- `ponto_densidade_atingido`: alguma zona em nível crítico VERMELHO (> 12 min).',
    ].join('\n'),
    responses: {
      200: { description: 'Métricas consolidadas de negócio.', content: json(AnalyticsSummaryResponseContract) },
      ...ERROS_PADRAO,
    },
  });

  // ── Endpoint 5 ────────────────────────────────────────────────────────────
  registry.registerPath({
    method: 'get',
    path: '/api/v1/venue/readiness-heatmap',
    operationId: 'readinessHeatmap',
    tags: [TAGS.venue],
    summary: 'Prontidão pós-montagem (S01) e Mapa de Calor global (S06)',
    description:
      'Prontidão: sensores ONLINE, estoque dos BARs >= 45%, rota livre (sem chamado CRITICO_PCD_CLIMA pendente e acessos fora do VERMELHO) e ping ao motor de IA. Mapa de calor: agregados anônimos das leituras atuais (velocidade calculada via modelo de Greenshields).',
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
    tags: [TAGS.realtime],
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

  // ── Produto 1: Métrica de Insumos (§8.3) ──────────────────────────────────
  registry.registerPath({
    method: 'get',
    path: '/api/v1/insumos/status',
    operationId: 'obterStatusInsumos',
    tags: [TAGS.insumos],
    summary: 'Métrica de Insumos: Níveis e Alertas de Déficit Crítico',
    description:
      'Retorna a listagem consolidada de insumos monitorados nos bares, quantidades atuais, mínimas e alertas de déficit crítico (ex: BAR-83-IPA). Requer autenticação JWT.',
    security: [{ BearerAuth: [] }],
    responses: {
      200: { description: 'Status consolidado dos insumos.', content: json(InsumosStatusResponseContract) },
      ...ERROS_PADRAO,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/insumos/reabastecimento',
    operationId: 'solicitarReabastecimentoInsumo',
    tags: [TAGS.insumos],
    summary: 'Solicitação Urgente de Reabastecimento de Insumos',
    description:
      'Registra a solicitação de reabastecimento urgente de insumos (ex: 14 barris de Chopp IPA para o Bar Principal Norte) e dispara alerta instantâneo via WebSocket.',
    security: [{ BearerAuth: [] }],
    request: { body: { required: true, content: json(ReabastecimentoRequestContract) } },
    responses: {
      201: { description: 'Solicitação registrada com sucesso.', content: json(ReabastecimentoResponseContract) },
      ...ERROS_PADRAO,
    },
  });

  // ── Produto 2: Acionamento Preditivo (§8.3) ───────────────────────────────
  registry.registerPath({
    method: 'get',
    path: '/api/v1/predicoes/gargalos',
    operationId: 'obterPredicoesGargalos',
    tags: [TAGS.predicoes],
    summary: 'Predição de Gargalos de Fluxo e Recomendações de IA',
    description:
      'Consulta predições de saturação e recomendações preditivas geradas pelo motor de IA (ex: Portão Principal / Entrada Norte, acionar 2 filas adicionais). Requer autenticação JWT.',
    security: [{ BearerAuth: [] }],
    responses: {
      200: { description: 'Predição ativa de gargalo.', content: json(PredicaoGargaloResponseContract) },
      ...ERROS_PADRAO,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/predicoes/acionar-fluxo',
    operationId: 'acionarFluxoPreditivo',
    tags: [TAGS.predicoes],
    summary: 'Execução de Medida Preditiva de Fluxo (Altera estado para ACAO_EM_ANDAMENTO)',
    description:
      'Executa a recomendação preditiva da IA para mitigar gargalos (ex: alerta PRED-9921 no Portão Principal). Atualiza o estado global do evento para ACAO_EM_ANDAMENTO e notifica o painel via WebSocket.',
    security: [{ BearerAuth: [] }],
    request: { body: { required: true, content: json(AcionarFluxoRequestContract) } },
    responses: {
      200: { description: 'Ação executada com sucesso.', content: json(AcionarFluxoResponseContract) },
      ...ERROS_PADRAO,
    },
  });

  // ── Canal WebSocket (§8.3) ────────────────────────────────────────────────
  registry.registerPath({
    method: 'get',
    path: '/api/v1/live/stream',
    operationId: 'canalWebSocketLiveStream',
    tags: [TAGS.realtime],
    summary: 'Canal WebSocket de Baixa Latência (WS /api/v1/live/stream)',
    description: [
      'Conexão WebSocket persistente (`ws://` ou `wss://`) para push instantâneo (latência 10ms a 400ms):',
      '',
      '- **Alertas de Déficit:** Notificação instantânea ao solicitar reabastecimento (`tipo: "alerta_insumo"`).',
      '- **Predições Críticas:** Alertas preditivos de gargalos e transição para `ACAO_EM_ANDAMENTO` (`tipo: "predicao_critica"`).',
      '- **Estado Operacional:** Notificações de mudança de estado global (`tipo: "estado_operacional"`).',
      '- **Telemetria de Campo:** Métricas de malha LiDAR (60 FPS), 12 câmeras neurais, 54 sensores IoT de barris e leitores NFC.',
      '',
      'Para conectar via cliente WebSocket (ex: Postman, wscat ou front-end): `ws://localhost:3000/api/v1/live/stream`',
    ].join('\n'),
    responses: {
      101: { description: 'Troca de protocolo para WebSocket (101 Switching Protocols).' },
    },
  });

  return new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'Venue Intelligence Core — API Gateway (Suíte RaizEvento)',
      version: '0.2.0',
      description:
        'Gateway de orquestração do estande e arena RAIZ. **Contract-First**: todos os contratos Zod são `.strict()` — campos não mapeados retornam 400. Inclui governança ética (anonimato total), RBAC (Bearer Token JWT), resiliência 400/502/503/504, Métrica de Insumos (Produto 1), Acionamento Preditivo (Produto 2), SSE e WebSocket.',
    },
    servers: [
      { url: '/', description: 'Servidor atual (automático / Render / produção / local)' },
      { url: `http://localhost:${config.PORT}`, description: 'Desenvolvimento local explícito' },
    ],
    tags: [
      { name: TAGS.telemetria, description: 'Ingestão de telemetria, Matriz de Resiliência e SSE.' },
      { name: TAGS.zonas, description: 'Status das zonas e Paradoxo do Roteamento.' },
      { name: TAGS.ops, description: 'Intervenções humanas assistidas e Staff Móvel.' },
      { name: TAGS.analytics, description: 'Abandono de consumo (Drop-off Rate), esforço (CES) e acumulados.' },
      { name: TAGS.venue, description: 'Prontidão pós-montagem (S01) e Mapa de Calor (S06).' },
      { name: TAGS.insumos, description: 'Produto 1: Níveis de estoque, déficits críticos e reabastecimento.' },
      { name: TAGS.predicoes, description: 'Produto 2: Detecção preditiva de gargalos e acionamento de fluxo.' },
      { name: TAGS.realtime, description: 'Canais em tempo real: WebSocket (WS) e Server-Sent Events (SSE).' },
    ],
  });
}
