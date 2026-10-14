/**
 * Mappers domínio → contrato. Selecionam campos EXPLICITAMENTE (nunca spread),
 * impedindo que dados internos (POS, estoque, sensor) vazem nas respostas.
 */
import type { OperationalDispatchResponse, TelemetryReading } from '../contracts';
import type { DispatchRecord, ReadingRecord } from './types';

export function toReadingContract(r: ReadingRecord): TelemetryReading {
  return {
    id: r.id,
    pdv_id: r.pdv_id,
    timestamp: r.timestamp,
    pax_count: r.pax_count,
    tempo_espera_seg: r.tempo_espera_seg,
    densidade_m2: r.densidade_m2,
    status_cor: r.status_cor,
    ia_confidence: r.ia_confidence,
    alerta_ruptura_estoque: r.alerta_ruptura_estoque,
    modo_leitura: r.modo_leitura,
  };
}

export function toDispatchContract(d: DispatchRecord): OperationalDispatchResponse {
  return {
    id: d.id,
    pdv_id: d.pdv_id,
    nivel_critico: d.nivel_critico,
    sugestao_acao: d.sugestao_acao,
    status: d.status,
    criado_em: d.criado_em,
  };
}
