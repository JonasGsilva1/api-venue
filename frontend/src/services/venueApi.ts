import axios from 'axios';
import { api } from './api';
import type {
  AuthResponse,
  LoginCredentials,
  TokenIssueRequest,
  TokenIssueResponse,
} from '../types/auth';
import type {
  AnalyticsSummaryResponse,
  PdvStatusItem,
  PdvStatusResponse,
  ReadinessHeatmapResponse,
  TelemetryReading,
} from '../types/publico';
import type {
  CriarAtracaoRequest,
  InstagramavelItem,
  ModoIluminacao,
  SinteseAcumuladaData,
} from '../types/venue';
import type {
  AcionarFluxoRequest,
  AcionarFluxoResponse,
  CameraApiItem,
  CamerasResponseV2,
  DispatchListResponse,
  EventoTempoReal,
  FrameAnalysisRequest,
  FrameAnalysisResponse,
  HealthResponse,
  InferenceRequest,
  InferenceResponse,
  OperationalDispatchRequest,
  OperationalDispatchResponse,
  PdvStatusResponseV2,
  PredicaoGargaloApiResponse,
  YoloScanRequest,
  YoloScanResponse,
  ZonaStatusV2,
} from '../types/ops';

const TIMEOUT_MS = 60_000;
const DEFAULT_DEV_TOKEN = 'dev-raiz-token-2026';

export function getActiveToken(): string {
  return (
    localStorage.getItem('@venue-intelligence:token') ||
    (import.meta.env.VITE_API_TOKEN as string | undefined) ||
    DEFAULT_DEV_TOKEN
  );
}

export function getApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (configured !== undefined) return configured;
  return import.meta.env.PROD ? '' : 'http://localhost:8000';
}

export function getWebSocketUrl(): string {
  const base = getApiBaseUrl();
  const token = encodeURIComponent(getActiveToken());
  if (!base) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/api/v1/live/stream?token=${token}`;
  }
  const wsBase = base.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:').replace(/\/$/, '');
  return `${wsBase}/api/v1/live/stream?token=${token}`;
}

function authHeaders(): Record<string, string> {
  const token = getActiveToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function normalizarZona(zona: ZonaStatusV2): PdvStatusItem {
  const leitura = zona.ultima_leitura;
  const jaTemCodigo = zona.nome.trim().toLowerCase().startsWith(zona.codigo_zona.trim().toLowerCase());
  const ultimaLeitura: TelemetryReading | null = leitura
    ? {
        id: leitura.id,
        pdv_id: leitura.pdv_id,
        timestamp: leitura.timestamp,
        contagem_pessoas: leitura.contagem_pessoas ?? leitura.pax_count,
        tempo_espera_seg: leitura.tempo_espera_seg,
        densidade_m2: leitura.densidade_m2,
        status_cor: leitura.status_cor,
        confianca_ia: leitura.confianca_ia,
        alerta_ruptura_estoque: leitura.alerta_ruptura_estoque,
        modo_leitura: leitura.modo_leitura,
      }
    : null;

  return {
    id: zona.id,
    nome: jaTemCodigo ? zona.nome : `${zona.codigo_zona} | ${zona.nome}`,
    tipo: zona.tipo,
    capacidade: zona.capacidade,
    localizacao_geo: zona.localizacao_geo ?? '',
    area_m2: zona.area_m2,
    ultima_leitura: ultimaLeitura,
    habilitar_redirecionamento_push: zona.habilitar_redirecionamento_push,
  };
}

// ── Sistema ──────────────────────────────────────────────────────────────────
export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const { data } = await api.get<HealthResponse>('/health', { signal, timeout: TIMEOUT_MS });
  return data;
}

export async function pingStatusPdvs(signal?: AbortSignal): Promise<number> {
  const inicio = performance.now();
  await api.get('/status-pdvs', { signal, timeout: TIMEOUT_MS });
  return Math.max(1, Math.round(performance.now() - inicio));
}

// ── Login & Token ────────────────────────────────────────────────────────────
export async function postLogin(credentials: LoginCredentials): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/api/v1/auth/login', credentials, {
    timeout: TIMEOUT_MS,
  });
  return data;
}

export async function postGerarToken(body: TokenIssueRequest): Promise<TokenIssueResponse> {
  const { data } = await api.post<TokenIssueResponse>('/api/v1/auth/token', body, {
    timeout: TIMEOUT_MS,
  });
  return data;
}

// ── Mapa & Arena · Telemetria das Câmeras ────────────────────────────────────
export async function getPdvStatus(signal?: AbortSignal): Promise<PdvStatusResponse> {
  const { data } = await api.get<PdvStatusResponse | PdvStatusResponseV2>('/api/v1/pdv/status', {
    signal,
    headers: authHeaders(),
    timeout: TIMEOUT_MS,
  });
  return Array.isArray(data) ? data : data.zonas.map(normalizarZona);
}

export async function getCameras(signal?: AbortSignal): Promise<Record<string, PdvStatusItem>> {
  const { data } = await api.get<CamerasResponseV2>('/api/v1/venue/cameras', {
    signal,
    headers: authHeaders(),
    timeout: TIMEOUT_MS,
  });
  return Object.fromEntries(data.cameras.map((c) => [c.id, normalizarZona(c.zona)]));
}

export async function getCameraById(cameraId: string, signal?: AbortSignal): Promise<CameraApiItem> {
  const { data } = await api.get<CameraApiItem>(`/api/v1/venue/cameras/${encodeURIComponent(cameraId)}`, {
    signal,
    headers: authHeaders(),
    timeout: TIMEOUT_MS,
  });
  return data;
}

export async function postFrameAnalysis(
  body: FrameAnalysisRequest,
  signal?: AbortSignal,
): Promise<FrameAnalysisResponse> {
  const { data } = await api.post<FrameAnalysisResponse>('/api/v1/telemetry/frame-analysis', body, {
    signal,
    headers: authHeaders(),
    timeout: TIMEOUT_MS,
  });
  return data;
}

export async function postYoloScan(
  body: YoloScanRequest = {},
  signal?: AbortSignal,
): Promise<YoloScanResponse> {
  const { data } = await api.post<YoloScanResponse>('/api/v1/telemetry/yolo-scan', body, {
    signal,
    headers: authHeaders(),
    timeout: TIMEOUT_MS,
  });
  return data;
}

// ── Despacho Ops ─────────────────────────────────────────────────────────────
export async function getDispatches(signal?: AbortSignal): Promise<DispatchListResponse> {
  const { data } = await api.get<DispatchListResponse>('/api/v1/ops/dispatch', {
    signal,
    headers: authHeaders(),
    timeout: TIMEOUT_MS,
  });
  return data;
}

export async function postDespacho(
  body: OperationalDispatchRequest,
): Promise<OperationalDispatchResponse> {
  const { data } = await api.post<OperationalDispatchResponse>('/api/v1/ops/dispatch', body, {
    headers: authHeaders(),
    timeout: TIMEOUT_MS,
  });
  return data;
}

// ── Predições de Gargalos (IA) ───────────────────────────────────────────────
export async function getPredicaoGargalos(signal?: AbortSignal): Promise<PredicaoGargaloApiResponse> {
  const { data } = await api.get<PredicaoGargaloApiResponse>('/api/v1/predicoes/gargalos', {
    signal,
    headers: authHeaders(),
    timeout: TIMEOUT_MS,
  });
  return data;
}

export async function postAcionarFluxo(body: AcionarFluxoRequest): Promise<AcionarFluxoResponse> {
  const { data } = await api.post<AcionarFluxoResponse>('/api/v1/predicoes/acionar-fluxo', body, {
    headers: authHeaders(),
    timeout: TIMEOUT_MS,
  });
  return data;
}

export async function postInferencia(body: InferenceRequest): Promise<InferenceResponse> {
  const { data } = await api.post<InferenceResponse>('/api/v1/inferencia', body, {
    headers: authHeaders(),
    timeout: TIMEOUT_MS,
  });
  return data;
}

// ── Instagramáveis ───────────────────────────────────────────────────────────
export async function getInstagramaveis(signal?: AbortSignal): Promise<InstagramavelItem[]> {
  const { data } = await api.get<InstagramavelItem[]>('/api/v1/venue/instagramavel', {
    signal,
    headers: authHeaders(),
    timeout: TIMEOUT_MS,
  });
  return data;
}

export async function postCapturaInstagramavel(id: string): Promise<InstagramavelItem> {
  const { data } = await api.post<InstagramavelItem>(
    `/api/v1/venue/instagramavel/${encodeURIComponent(id)}/captura`,
    undefined,
    { headers: authHeaders(), timeout: TIMEOUT_MS },
  );
  return data;
}

export async function postModoLuzInstagramavel(
  id: string,
  modo: ModoIluminacao,
): Promise<InstagramavelItem> {
  const { data } = await api.post<InstagramavelItem>(
    `/api/v1/venue/instagramavel/${encodeURIComponent(id)}/modo-luz`,
    { modo },
    { headers: authHeaders(), timeout: TIMEOUT_MS },
  );
  return data;
}

export async function postToggleStatusInstagramavel(id: string): Promise<InstagramavelItem> {
  const { data } = await api.post<InstagramavelItem>(
    `/api/v1/venue/instagramavel/${encodeURIComponent(id)}/toggle-status`,
    undefined,
    { headers: authHeaders(), timeout: TIMEOUT_MS },
  );
  return data;
}

export async function postCriarAtracao(body: CriarAtracaoRequest): Promise<InstagramavelItem> {
  const { data } = await api.post<InstagramavelItem>('/api/v1/venue/atracao', body, {
    headers: authHeaders(),
    timeout: TIMEOUT_MS,
  });
  return data;
}

// ── Síntese Acumulada ────────────────────────────────────────────────────────
export async function getSintese(signal?: AbortSignal): Promise<SinteseAcumuladaData> {
  const { data } = await api.get<SinteseAcumuladaData>('/api/v1/venue/sintese', {
    signal,
    headers: authHeaders(),
    timeout: TIMEOUT_MS,
  });
  return data;
}

export async function postSimularPico(): Promise<{ status: string; mensagem: string }> {
  const { data } = await api.post<{ status: string; mensagem: string }>(
    '/api/v1/venue/simular-pico',
    undefined,
    { headers: authHeaders(), timeout: TIMEOUT_MS },
  );
  return data;
}

export async function getReadinessHeatmap(signal?: AbortSignal): Promise<ReadinessHeatmapResponse> {
  const { data } = await api.get<ReadinessHeatmapResponse>('/api/v1/venue/readiness-heatmap', {
    signal,
    headers: authHeaders(),
    timeout: TIMEOUT_MS,
  });
  return data;
}

export async function getDropoffSummary(signal?: AbortSignal): Promise<AnalyticsSummaryResponse> {
  const { data } = await api.get<AnalyticsSummaryResponse>('/api/v1/analytics/dropoff-summary', {
    signal,
    headers: authHeaders(),
    timeout: TIMEOUT_MS,
  });
  return data;
}

// ── Tempo Real (SSE snapshot inicial) ────────────────────────────────────────
export async function getSseSnapshot(signal?: AbortSignal): Promise<EventoTempoReal | null> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/v1/telemetry/stream?limite_eventos=1`, {
    headers: authHeaders(),
    signal,
  });
  if (!res.ok) return null;
  const text = await res.text();
  const dataLine = text
    .split(/\r?\n/)
    .find((line) => line.startsWith('data:'));
  if (!dataLine) return null;
  try {
    return JSON.parse(dataLine.slice(5).trim()) as EventoTempoReal;
  } catch {
    return null;
  }
}

export function mensagemDeErro(err: unknown): string {
  if (axios.isAxiosError(err)) {
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return 'O servidor demorou para responder. Ele pode estar iniciando; tente de novo em instantes.';
    }
    if (err.response) {
      const { status } = err.response;
      if (status === 401) return 'Sem autorização: faça login ou verifique o token de acesso.';
      if (status === 403) return 'Acesso negado para esta ação (permissão insuficiente).';
      if (status === 404) return 'Recurso não encontrado nesta API.';
      if (status === 400) return 'A API recusou os dados enviados (verifique os campos).';
      return `O servidor respondeu com erro ${status}.`;
    }
    return 'Sem resposta do servidor. Verifique a conexão e a URL da API.';
  }
  return 'Erro inesperado ao falar com a API.';
}
