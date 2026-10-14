/**
 * Cliente HTTP do `services/ai-engine` com timeout estrito (Graceful Degradation — §6.3/§6.4).
 *
 * Retorna um resultado discriminado em vez de lançar exceções, para que o pipeline
 * de telemetria decida explicitamente o plano de contingência.
 */
import axios, { type AxiosInstance } from 'axios';
import { config } from '../config/env';
import {
  InferenceRequestContract,
  InferenceResponseContract,
  type InferenceRequest,
  type InferenceResponse,
} from '../contracts';
import { logger } from '../utils/logger';

export type InferenceResult =
  | { readonly tipo: 'OK'; readonly dados: InferenceResponse; readonly latencia_ms: number }
  | { readonly tipo: 'TIMEOUT'; readonly latencia_ms: number }
  | { readonly tipo: 'INDISPONIVEL'; readonly motivo: string; readonly latencia_ms: number };

const INFERENCIA_PATH = '/api/v1/inferencia';
const PING_PATH = '/openapi.json';

export class AiEngineClient {
  private readonly http: AxiosInstance;
  private ultimoEstadoOnline: boolean | null = null;

  constructor(baseURL: string, private readonly timeoutMs: number, private readonly pingTimeoutMs: number) {
    this.http = axios.create({
      baseURL,
      timeout: timeoutMs,
      headers: { 'Content-Type': 'application/json' },
      validateStatus: () => true, // status tratado manualmente
    });
  }

  async inferir(payload: InferenceRequest): Promise<InferenceResult> {
    const corpo = InferenceRequestContract.parse(payload); // contrato também na saída para o Python
    const inicio = Date.now();
    try {
      const resposta = await this.http.post<unknown>(INFERENCIA_PATH, corpo);
      const latencia_ms = Date.now() - inicio;

      if (resposta.status >= 500) {
        return this.indisponivel(`AI_ENGINE_HTTP_${resposta.status}`, latencia_ms);
      }
      if (resposta.status < 200 || resposta.status >= 300) {
        return this.indisponivel(`AI_ENGINE_REJEITOU_CONTRATO_HTTP_${resposta.status}`, latencia_ms);
      }
      const validado = InferenceResponseContract.safeParse(resposta.data);
      if (!validado.success) {
        return this.indisponivel('AI_ENGINE_RESPOSTA_FORA_DO_CONTRATO', latencia_ms);
      }
      if (validado.data.pdv_id !== corpo.pdv_id) {
        return this.indisponivel('AI_ENGINE_PDV_DIVERGENTE', latencia_ms);
      }
      this.ultimoEstadoOnline = true;
      return { tipo: 'OK', dados: validado.data, latencia_ms };
    } catch (erro: unknown) {
      const latencia_ms = Date.now() - inicio;
      if (axios.isAxiosError(erro)) {
        if (erro.code === 'ECONNABORTED' || erro.code === 'ETIMEDOUT') {
          logger.warn('ai_engine.timeout', { limite_ms: this.timeoutMs, latencia_ms });
          return { tipo: 'TIMEOUT', latencia_ms };
        }
        return this.indisponivel(erro.code ?? 'AI_ENGINE_ERRO_REDE', latencia_ms);
      }
      return this.indisponivel('AI_ENGINE_ERRO_DESCONHECIDO', latencia_ms);
    }
  }

  /** Ping leve usado pelo readiness (S01). */
  async ping(): Promise<boolean> {
    try {
      const resposta = await this.http.get<unknown>(PING_PATH, { timeout: this.pingTimeoutMs });
      this.ultimoEstadoOnline = resposta.status >= 200 && resposta.status < 300;
    } catch {
      this.ultimoEstadoOnline = false;
    }
    return this.ultimoEstadoOnline;
  }

  get estadoConhecido(): boolean | null {
    return this.ultimoEstadoOnline;
  }

  private indisponivel(motivo: string, latencia_ms: number): InferenceResult {
    this.ultimoEstadoOnline = false;
    logger.warn('ai_engine.indisponivel', { motivo, latencia_ms });
    return { tipo: 'INDISPONIVEL', motivo, latencia_ms };
  }
}

export const aiEngineClient = new AiEngineClient(
  config.AI_ENGINE_URL,
  config.AI_ENGINE_TIMEOUT_MS,
  config.AI_ENGINE_PING_TIMEOUT_MS,
);
