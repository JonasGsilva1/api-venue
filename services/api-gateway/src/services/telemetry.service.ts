/**
 * Pipeline do Endpoint 1 — `POST /api/v1/telemetry/frame-analysis`.
 *
 * Fluxo: contrato validado → (sensor OFFLINE? → 502) → ai-engine (timeout 2500ms → 504;
 * ECONNREFUSED/5xx/resposta fora do contrato → 503) → persistência → SSE.
 */
import type { ModoLeitura, TelemetryAnalysisRequest, TelemetryAnalysisResponse } from '../contracts';
import { classificarStatusCor, detectarRupturaEstoque, habilitarRedirecionamentoPush } from '../domain/business-rules';
import { toReadingContract } from '../domain/mappers';
import type { CountersRecord, PdvRecord, ReadingRecord } from '../domain/types';
import { NotFoundError } from '../http/errors';
import type { VenueRepository } from '../repositories/venue.repository';
import { logger } from '../utils/logger';
import type { AiEngineClient } from './ai-engine.client';
import {
  JANELA_FALLBACK_502_MS,
  JANELA_MEDIA_MOVEL_504_MS,
  estimarContingencia503,
  estimarFallback502,
  estimarMediaMovel504,
} from './resilience.service';
import { sseHub } from './sse.hub';

export type FrameAnalysisHttpStatus = 201 | 502 | 503 | 504;

export interface FrameAnalysisResult {
  readonly httpStatus: FrameAnalysisHttpStatus;
  readonly body: TelemetryAnalysisResponse;
}

interface LeituraCalculada {
  readonly contagem_pessoas: number;
  readonly tempo_espera_seg: number;
  readonly densidade_m2: number;
  readonly confianca_ia: number;
  readonly status_cor: ReadingRecord['status_cor'];
  readonly alerta_ruptura_estoque: boolean;
  readonly modo_leitura: ModoLeitura;
  readonly httpStatus: FrameAnalysisHttpStatus;
  readonly aviso: string | null;
}

export class TelemetryService {
  constructor(
    private readonly repo: VenueRepository,
    private readonly ai: AiEngineClient,
  ) {}

  async analisarFrame(entrada: TelemetryAnalysisRequest): Promise<FrameAnalysisResult> {
    const pdv = this.repo.getPdv(entrada.pdv_id);
    if (!pdv) throw new NotFoundError(`Zona/PDV ${entrada.pdv_id} não existe no seed do estande.`);

    const agoraMs = Date.now();
    const calculada =
      entrada.sensor_status === 'OFFLINE'
        ? this.fallback502(pdv, entrada, agoraMs)
        : await this.inferirComResiliencia(pdv, entrada, agoraMs);

    const anterior = this.repo.getLatestReading(pdv.id);
    const registro = this.repo.addReading({
      pdv_id: pdv.id,
      timestamp: new Date(agoraMs).toISOString(),
      contagem_pessoas: calculada.contagem_pessoas,
      tempo_espera_seg: calculada.tempo_espera_seg,
      densidade_m2: calculada.densidade_m2,
      status_cor: calculada.status_cor,
      confianca_ia: calculada.confianca_ia,
      alerta_ruptura_estoque: calculada.alerta_ruptura_estoque,
      modo_leitura: calculada.modo_leitura,
      transacoes_pos_ultimos_3m: entrada.transacoes_pos_ultimos_3m,
      estoque_percentual: entrada.estoque_percentual,
      sensor_status: entrada.sensor_status,
    });

    this.repo.incrementCounters(this.deltaAcumulado(pdv, entrada.transacoes_pos_ultimos_3m));
    this.publicarSse(registro, anterior);

    if (calculada.modo_leitura !== 'TEMPO_REAL') {
      logger.audit('telemetria.contingencia', {
        pdv_id: pdv.id,
        modo_leitura: calculada.modo_leitura,
        http_status: calculada.httpStatus,
        tempo_espera_seg: registro.tempo_espera_seg,
      });
    }

    return {
      httpStatus: calculada.httpStatus,
      body: {
        sucesso: calculada.modo_leitura === 'TEMPO_REAL',
        aviso_contingencia: calculada.aviso,
        leitura: toReadingContract(registro),
      },
    };
  }

  private async inferirComResiliencia(
    pdv: PdvRecord,
    entrada: TelemetryAnalysisRequest,
    agoraMs: number,
  ): Promise<LeituraCalculada> {
    const resultado = await this.ai.inferir({
      pdv_id: entrada.pdv_id,
      coordenadas_simuladas: entrada.coordenadas_simuladas,
      transacoes_pos_ultimos_3m: entrada.transacoes_pos_ultimos_3m,
      estoque_percentual: entrada.estoque_percentual,
    });

    switch (resultado.tipo) {
      case 'OK': {
        const d = resultado.dados;
        return {
          contagem_pessoas: d.contagem_pessoas,
          tempo_espera_seg: d.tempo_espera_seg,
          densidade_m2: d.densidade_m2,
          confianca_ia: d.confianca_ia,
          status_cor: d.status_cor,
          alerta_ruptura_estoque: d.alerta_ruptura_estoque,
          modo_leitura: 'TEMPO_REAL',
          httpStatus: 201,
          aviso: null,
        };
      }
      case 'TIMEOUT': {
        const historico = this.repo.getReadingsSince(pdv.id, agoraMs - JANELA_MEDIA_MOVEL_504_MS);
        const est = estimarMediaMovel504(pdv, historico, entrada.coordenadas_simuladas.length, entrada.transacoes_pos_ultimos_3m);
        return this.montar(est, entrada, 'MEDIA_MOVEL_504', 504,
          `ai-engine excedeu o limite de latência (${resultado.latencia_ms}ms). Projeção de curto prazo aplicada: ${est.base_calculo}.`);
      }
      case 'INDISPONIVEL': {
        const est = estimarContingencia503(pdv, entrada.coordenadas_simuladas.length, entrada.transacoes_pos_ultimos_3m);
        return this.montar(est, entrada, 'CONTINGENCIA_503', 503,
          `Modo de Contingência ativo: ai-engine indisponível (${resultado.motivo}). Leitura heurística: ${est.base_calculo}.`);
      }
    }
  }

  private fallback502(pdv: PdvRecord, entrada: TelemetryAnalysisRequest, agoraMs: number): LeituraCalculada {
    const historico = this.repo.getReadingsSince(pdv.id, agoraMs - JANELA_FALLBACK_502_MS);
    const est = estimarFallback502(pdv, historico, entrada.transacoes_pos_ultimos_3m, agoraMs);
    return this.montar(est, entrada, 'FALLBACK_502', 502,
      `Sensor OFFLINE na zona ${pdv.codigo_zona}. Densidade e espera interpoladas: ${est.base_calculo}.`);
  }

  private montar(
    est: { contagem_pessoas: number; tempo_espera_seg: number; densidade_m2: number; confianca_ia: number },
    entrada: TelemetryAnalysisRequest,
    modo: ModoLeitura,
    httpStatus: FrameAnalysisHttpStatus,
    aviso: string,
  ): LeituraCalculada {
    return {
      contagem_pessoas: est.contagem_pessoas,
      tempo_espera_seg: est.tempo_espera_seg,
      densidade_m2: est.densidade_m2,
      confianca_ia: est.confianca_ia,
      status_cor: classificarStatusCor(est.tempo_espera_seg),
      alerta_ruptura_estoque: detectarRupturaEstoque(est.contagem_pessoas, entrada.transacoes_pos_ultimos_3m, entrada.estoque_percentual),
      modo_leitura: modo,
      httpStatus,
      aviso,
    };
  }

  /**
   * Acumulado do evento a partir do POS (contagens agregadas, sem identificação):
   * catraca → público; Z1 → cortesia + bebidas; Z2 → retiradas; Z3/Z5 → engajamento (não é lead).
   */
  private deltaAcumulado(pdv: PdvRecord, tx: number): Partial<CountersRecord> {
    if (tx === 0) return {};
    if (pdv.tipo === 'CATRACA') return { publico_acumulado: tx };
    switch (pdv.codigo_zona) {
      case 'Z1':
        return { atendimentos_cortesia: tx, bebidas_unidades: tx };
      case 'Z2':
        return { autosservico_retiradas: tx };
      case 'Z3':
      case 'Z5':
        return { engajamento_interacoes: tx };
      default:
        return {};
    }
  }

  private publicarSse(registro: ReadingRecord, anterior: ReadingRecord | undefined): void {
    const emitido_em = new Date().toISOString();
    sseHub.broadcast({
      tipo: 'leitura',
      emitido_em,
      leitura: toReadingContract(registro),
      habilitar_redirecionamento_push: habilitarRedirecionamentoPush(registro.tempo_espera_seg),
    });
    const corAnterior = anterior?.status_cor ?? null;
    if (corAnterior !== registro.status_cor) {
      sseHub.broadcast({
        tipo: 'mudanca_cor',
        emitido_em,
        pdv_id: registro.pdv_id,
        cor_anterior: corAnterior,
        cor_atual: registro.status_cor,
      });
    }
  }
}
