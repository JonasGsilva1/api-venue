/**
 * Tipos internos de domínio do repositório In-Memory.
 *
 * `ReadingRecord` estende o contrato público `TelemetryReading` com o contexto POS/estoque
 * necessário para os fallbacks (§6). Esses campos extras NUNCA saem pela API:
 * os mappers selecionam explicitamente os campos do contrato e a resposta é revalidada com `.strict()`.
 */
import type {
  AcumuladoEvento,
  DispatchStatus,
  NivelCritico,
  PdvTipo,
  SensorStatus,
  TelemetryReading,
} from '../contracts';

export interface PdvRecord {
  readonly id: number;
  readonly codigo_zona: string;
  readonly nome: string;
  readonly tipo: PdvTipo;
  readonly capacidade: number;
  readonly localizacao_geo: string;
  readonly area_m2: number;
  /** Permanência média de referência da zona (seg), usada no heatmap S06. */
  readonly permanencia_referencia_seg: number;
}

export interface ReadingRecord extends TelemetryReading {
  readonly transacoes_pos_ultimos_3m: number;
  readonly estoque_percentual: number;
  readonly sensor_status: SensorStatus;
}

export type NewReadingRecord = Omit<ReadingRecord, 'id'>;

export interface DispatchRecord {
  readonly id: number;
  readonly pdv_id: number;
  readonly nivel_critico: NivelCritico;
  readonly sugestao_acao: string;
  status: DispatchStatus;
  readonly criado_em: string;
}

export type CountersRecord = AcumuladoEvento;
