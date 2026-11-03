import axios from 'axios';
import { api } from './api';
import type { PdvStatusItem, PdvStatusResponse, TelemetryReading } from '../types/publico';
import type { AutosservicoItem } from '../types/venue';
import type {
  OperationalDispatchRequest,
  OperationalDispatchResponse,
  PdvStatusResponseV2,
  ZonaStatusV2,
} from '../types/ops';

// O servidor gratuito do Render "dorme" e pode levar cerca de 1 minuto para acordar.
const TIMEOUT_MS = 60_000;

/**
 * Token Bearer das rotas protegidas. Vem do login (localStorage) ou, em desenvolvimento,
 * de VITE_API_TOKEN no .env.local (o token de desenvolvimento está no Swagger da API, em /docs).
 */
function authHeaders(): Record<string, string> {
  const token =
    localStorage.getItem('@venue-intelligence:token') ||
    (import.meta.env.VITE_API_TOKEN as string | undefined);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// A API nova (v2) devolve as zonas dentro de um objeto e chama a contagem de "pax_count".
// Aqui convertemos para o formato único que o resto do front usa (PdvStatusItem).
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

/** Zonas do estande com a última leitura de cada uma (aceita a API nova e a antiga). */
export async function getPdvStatus(signal?: AbortSignal): Promise<PdvStatusResponse> {
  const { data } = await api.get<PdvStatusResponse | PdvStatusResponseV2>('/api/v1/pdv/status', {
    signal,
    headers: authHeaders(),
    timeout: TIMEOUT_MS,
  });
  return Array.isArray(data) ? data : data.zonas.map(normalizarZona);
}

/** Registra uma intervenção operacional humana. */
export async function postDespacho(
  body: OperationalDispatchRequest,
): Promise<OperationalDispatchResponse> {
  const { data } = await api.post<OperationalDispatchResponse>('/api/v1/ops/dispatch', body, {
    headers: authHeaders(),
    timeout: TIMEOUT_MS,
  });
  return data;
}

/** Registra uma venda no totem de autosserviço (Venda Express) e devolve o totem atualizado. */
export async function postTransacaoAutosservico(id: string, valor: number): Promise<AutosservicoItem> {
  const { data } = await api.post<AutosservicoItem>(
    `/api/v1/venue/autosservico/${encodeURIComponent(id)}/transacao`,
    { valor },
    { headers: authHeaders(), timeout: TIMEOUT_MS },
  );
  return data;
}

/** Traduz um erro de chamada à API para uma frase clara em português. */
export function mensagemDeErro(err: unknown): string {
  if (axios.isAxiosError(err)) {
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return 'O servidor demorou para responder. Ele pode estar iniciando; tente de novo em instantes.';
    }
    if (err.response) {
      const { status } = err.response;
      if (status === 401) return 'Sem autorização: informe o token da API (VITE_API_TOKEN no .env.local).';
      if (status === 403) return 'Acesso negado para esta ação (permissão insuficiente).';
      if (status === 404) return 'Recurso não encontrado nesta API (zona ou totem inexistente).';
      if (status === 400) return 'A API recusou os dados enviados (contrato inválido).';
      return `O servidor respondeu com erro ${status}.`;
    }
    return 'Sem resposta do servidor. Verifique a internet, a URL da API (VITE_API_BASE_URL) e o CORS.';
  }
  return 'Erro inesperado ao falar com a API.';
}
