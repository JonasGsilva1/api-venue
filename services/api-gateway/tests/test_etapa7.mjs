import http from 'node:http';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';

const GATEWAY_URL = 'http://localhost:3000';
const AI_ENGINE_URL = 'http://localhost:8000';

const results = [];
function check(nome, cond, extra = '') {
  results.push({ nome, ok: !!cond });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${nome}${extra ? '  → ' + extra : ''}`);
}

async function req(url, method, path, body, headers = {}) {
  const r = await fetch(url + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* ignore non-json */ }
  return { status: r.status, json, text, headers: r.headers };
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  console.log('=== TESTE INTEGRADO ETAPA 7: SUÍTE RAIZEVENTO ===\n');

  // 1. Iniciar FastAPI em background
  console.log('[1/4] Iniciando FastAPI ai-engine na porta 8000...');
  const pythonProc = spawn('py', ['-m', 'uvicorn', 'app.main:app', '--port', '8000', '--host', '127.0.0.1'], {
    cwd: 'c:\\api-venue-inteligence\\services\\ai-engine',
    stdio: 'pipe',
  });

  pythonProc.stderr.on('data', (d) => {
    // console.log(`[FastAPI] ${d}`);
  });

  let pythonReady = false;
  for (let i = 0; i < 20; i++) {
    try {
      const h = await fetch(`${AI_ENGINE_URL}/health`);
      if (h.status === 200) {
        pythonReady = true;
        break;
      }
    } catch {
      await sleep(300);
    }
  }
  check('FastAPI ai-engine inicializado', pythonReady);

  // 2. Iniciar API Gateway em background
  console.log('[2/4] Iniciando API Gateway Node.js na porta 3000...');
  const gatewayProc = spawn('node', ['dist/server.js'], {
    cwd: 'c:\\api-venue-inteligence\\services\\api-gateway',
    env: { ...process.env, PORT: '3000', AI_ENGINE_URL: 'http://localhost:8000', NODE_ENV: 'development' },
    stdio: 'pipe',
  });

  gatewayProc.stderr.on('data', (d) => {
    // console.log(`[Gateway Err] ${d}`);
  });

  let gatewayReady = false;
  for (let i = 0; i < 20; i++) {
    try {
      const h = await fetch(`${GATEWAY_URL}/health`);
      if (h.status === 200) {
        gatewayReady = true;
        break;
      }
    } catch {
      await sleep(300);
    }
  }
  check('API Gateway inicializado', gatewayReady);

  // 3. Testes do FastAPI
  console.log('\n--- Testes Diretos no FastAPI (ai-engine) ---');
  let r = await req(AI_ENGINE_URL, 'GET', '/health');
  check('FastAPI /health 200', r.status === 200 && r.json?.status === 'ok');

  r = await req(AI_ENGINE_URL, 'GET', '/api/v1/insumos/status');
  check('FastAPI Produto 1 GET /insumos/status 200', r.status === 200 && r.json?.total_itens_monitorados === 150);
  check('FastAPI Produto 1 contém BAR-83-IPA com deficit 14', r.json?.insumos?.some((i) => i.item_id === 'BAR-83-IPA' && i.deficit_estimado === 14));

  r = await req(AI_ENGINE_URL, 'POST', '/api/v1/insumos/reabastecimento', {
    item_id: 'BAR-83-IPA',
    quantidade_solicitada: 14,
    prioridade: 'ALTA',
  });
  check('FastAPI Produto 1 POST /insumos/reabastecimento 200', r.status === 200 && r.json?.protocolo_id === 'REAB-2026-0042' && r.json?.status_pedido === 'SOLICITADO');

  // Teste de contrato estrito no FastAPI (extra="forbid")
  r = await req(AI_ENGINE_URL, 'POST', '/api/v1/insumos/reabastecimento', {
    item_id: 'BAR-83-IPA',
    quantidade_solicitada: 14,
    prioridade: 'ALTA',
    campo_nao_permitido: 'hacker',
  });
  check('FastAPI extra="forbid" rejeita campo não permitido com 422', r.status === 422);

  r = await req(AI_ENGINE_URL, 'GET', '/api/v1/predicoes/gargalos');
  check('FastAPI Produto 2 GET /predicoes/gargalos 200', r.status === 200 && r.json?.nivel_predito === 'CRITICO' && r.json?.tempo_estimado_formacao_fila === '03m 30s');

  r = await req(AI_ENGINE_URL, 'POST', '/api/v1/predicoes/acionar-fluxo', {
    alerta_id: 'PRED-9921',
    acao_executada: 'ACIONAR_DUAS_FILAS_ADICIONAIS',
    setor: 'Portão Principal',
  });
  check('FastAPI Produto 2 POST /predicoes/acionar-fluxo 200', r.status === 200 && r.json?.status_operacional_evento === 'ACAO_EM_ANDAMENTO');

  // 4. Testes do API Gateway (Swagger, RBAC, WS, Insumos, Predições, Dispatch)
  console.log('\n--- Testes no API Gateway (Node.js) ---');
  
  // Swagger & OpenAPI
  r = await req(GATEWAY_URL, 'GET', '/openapi.json');
  check('Gateway /openapi.json 200', r.status === 200 && r.json?.openapi === '3.0.3');
  check('Gateway OpenAPI possui BearerAuth securitySchemes', !!r.json?.components?.securitySchemes?.BearerAuth);
  check('Gateway OpenAPI possui rotas de Insumos', !!r.json?.paths?.['/api/v1/insumos/status'] && !!r.json?.paths?.['/api/v1/insumos/reabastecimento']);
  check('Gateway OpenAPI possui rotas de Predições', !!r.json?.paths?.['/api/v1/predicoes/gargalos'] && !!r.json?.paths?.['/api/v1/predicoes/acionar-fluxo']);
  check('Gateway OpenAPI possui rota WebSocket documentada', !!r.json?.paths?.['/api/v1/live/stream']);

  // Health check e estado inicial
  r = await req(GATEWAY_URL, 'GET', '/health');
  check('Gateway GET /health 200 com status inicial ESTAVEL', r.status === 200 && r.json?.status_operacional_evento === 'ESTAVEL');

  // Conexão WebSocket
  console.log('\n--- Teste de WebSocket WS /api/v1/live/stream ---');
  const wsEvents = [];
  const ws = new WebSocket('ws://localhost:3000/api/v1/live/stream');
  let wsConnected = false;

  await new Promise((resolve) => {
    ws.on('open', () => {
      wsConnected = true;
      resolve();
    });
    ws.on('message', (data) => {
      try {
        const ev = JSON.parse(data.toString());
        wsEvents.push(ev);
      } catch { /* ignore */ }
    });
  });
  check('WebSocket WS /api/v1/live/stream conectado', wsConnected);
  await sleep(150);
  check('WebSocket recebeu mensagem inicial de telemetria operacional', wsEvents.some((e) => e.tipo === 'estado_operacional'));

  // Autenticação e RBAC (Bearer dev-token)
  console.log('\n--- Testes de Autenticação e RBAC ---');
  // Com dev-token
  r = await req(GATEWAY_URL, 'GET', '/api/v1/insumos/status', null, { Authorization: 'Bearer dev-token' });
  check('Gateway GET /insumos/status com Bearer dev-token 200', r.status === 200 && r.json?.total_itens_monitorados === 150);
  check('Gateway retorno de insumos contém BAR-83-IPA com status DEFICIT_CRITICO', r.json?.insumos?.some((i) => i.item_id === 'BAR-83-IPA' && i.status === 'DEFICIT_CRITICO'));

  // Sem token (permitido em dev com aviso)
  r = await req(GATEWAY_URL, 'GET', '/api/v1/insumos/status');
  check('Gateway GET /insumos/status sem token (modo dev) 200', r.status === 200);

  // Token inválido (formato não-dev e não-jwt)
  r = await req(GATEWAY_URL, 'GET', '/api/v1/insumos/status', null, { Authorization: 'Bearer token-invalido-proibido' });
  check('Gateway com token explicitamente forjado/inválido retorna 401', r.status === 401 && r.json?.erro === 'CONTRATO_VIOLADO');

  // Testes de Contrato Estrito Produto 1
  console.log('\n--- Testes Produto 1: Métrica de Insumos no Gateway ---');
  r = await req(GATEWAY_URL, 'POST', '/api/v1/insumos/reabastecimento', {
    item_id: 'BAR-83-IPA',
    quantidade_solicitada: 14,
    prioridade: 'ALTA',
  }, { Authorization: 'Bearer dev-token' });
  check('Gateway POST /insumos/reabastecimento 201 com protocolo canônico REAB-2026-0042', r.status === 201 && r.json?.protocolo_id === 'REAB-2026-0042' && r.json?.status_pedido === 'SOLICITADO');
  await sleep(150);
  check('WebSocket recebeu evento alerta_insumo (push instantâneo)', wsEvents.some((e) => e.tipo === 'alerta_insumo'));

  // Teste Zod .strict() no Produto 1
  r = await req(GATEWAY_URL, 'POST', '/api/v1/insumos/reabastecimento', {
    item_id: 'BAR-83-IPA',
    quantidade_solicitada: 14,
    prioridade: 'ALTA',
    propriedade_estranha: true,
  });
  check('Gateway Zod .strict() rejeita propriedade extra no reabastecimento com 400', r.status === 400 && r.json?.erro === 'CONTRATO_VIOLADO');

  // Testes Produto 2: Acionamento Preditivo
  console.log('\n--- Testes Produto 2: Acionamento Preditivo no Gateway ---');
  r = await req(GATEWAY_URL, 'GET', '/api/v1/predicoes/gargalos', null, { Authorization: 'Bearer dev-token' });
  check('Gateway GET /predicoes/gargalos 200 com nível CRITICO e 03m 30s', r.status === 200 && r.json?.nivel_predito === 'CRITICO' && r.json?.tempo_estimado_formacao_fila === '03m 30s');

  r = await req(GATEWAY_URL, 'POST', '/api/v1/predicoes/acionar-fluxo', {
    alerta_id: 'PRED-9921',
    acao_executada: 'ACIONAR_DUAS_FILAS_ADICIONAIS',
    setor: 'Portão Principal',
  }, { Authorization: 'Bearer dev-token' });
  check('Gateway POST /predicoes/acionar-fluxo 200 com status_operacional_evento ACAO_EM_ANDAMENTO', r.status === 200 && r.json?.status_operacional_evento === 'ACAO_EM_ANDAMENTO');
  await sleep(150);
  check('WebSocket recebeu evento predicao_critica (push instantâneo)', wsEvents.some((e) => e.tipo === 'predicao_critica'));

  // Teste Zod .strict() no Produto 2
  r = await req(GATEWAY_URL, 'POST', '/api/v1/predicoes/acionar-fluxo', {
    alerta_id: 'PRED-9921',
    acao_executada: 'ACIONAR_DUAS_FILAS_ADICIONAIS',
    setor: 'Portão Principal',
    campo_nao_permitido: 123,
  });
  check('Gateway Zod .strict() rejeita propriedade extra em acionar-fluxo com 400', r.status === 400 && r.json?.erro === 'CONTRATO_VIOLADO');

  // Teste POST /api/v1/ops/dispatch atualizando estado operacional para ACAO_EM_ANDAMENTO
  console.log('\n--- Teste POST /api/v1/ops/dispatch e Transição de Estado ---');
  r = await req(GATEWAY_URL, 'POST', '/api/v1/ops/dispatch', {
    pdv_id: 1,
    nivel_critico: 'CRITICO_PCD_CLIMA',
    sugestao_acao: 'Acionar equipe de apoio e contingência no portão norte',
  }, { Authorization: 'Bearer dev-token' });
  check('Gateway POST /ops/dispatch 201 com status PENDENTE', r.status === 201 && r.json?.status === 'PENDENTE');
  
  // Verifica transição global de estado operacional
  const rHealth = await req(GATEWAY_URL, 'GET', '/health');
  check('Gateway /health confirma transição global para ACAO_EM_ANDAMENTO', rHealth.status === 200 && rHealth.json?.status_operacional_evento === 'ACAO_EM_ANDAMENTO');

  await sleep(150);
  check('WebSocket recebeu evento despacho_operacional', wsEvents.some((e) => e.tipo === 'despacho_operacional'));

  // Teste de rotas existentes do Gateway para garantir não-regressão
  console.log('\n--- Testes de Não-Regressão das Rotas Existentes ---');
  r = await req(GATEWAY_URL, 'GET', '/api/v1/pdv/status');
  check('Não-regressão: GET /pdv/status 200 com 6 zonas', r.status === 200 && r.json?.length === 6);

  r = await req(GATEWAY_URL, 'GET', '/api/v1/analytics/dropoff-summary');
  check('Não-regressão: GET /analytics/dropoff-summary 200', r.status === 200 && typeof r.json?.taxa_abandono_estimada_pct === 'number');

  r = await req(GATEWAY_URL, 'GET', '/api/v1/venue/readiness-heatmap');
  check('Não-regressão: GET /venue/readiness-heatmap 200', r.status === 200 && typeof r.json?.prontidao?.sensores_ativos === 'number');

  // Limpeza
  ws.close();
  gatewayProc.kill();
  pythonProc.kill();

  const falhas = results.filter((x) => !x.ok).length;
  console.log(`\n==================================================`);
  console.log(`Resultado: ${results.length - falhas}/${results.length} verificações aprovadas.`);
  console.log(`==================================================\n`);
  process.exit(falhas ? 1 : 0);
})();
