/**
 * Repositório In-Memory tipado (Fase 1 — PROJECT_CONTEXT.md §3.3).
 *
 * A interface `VenueRepository` é o ponto de troca para a Fase 2 (PostgreSQL/TimescaleDB + Redis):
 * basta uma nova implementação, sem alterar contratos nem rotas.
 */
import type { NivelCritico, SensorStatus } from '../contracts';
import type { CountersRecord, DispatchRecord, NewReadingRecord, PdvRecord, ReadingRecord } from '../domain/types';
import { SEED_COUNTERS, SEED_PDVS, buildSeedReadings } from './seed';

/** Retenção da série temporal em memória (min). */
const RETENCAO_LEITURAS_MS = 60 * 60_000;

export interface VenueRepository {
  listPdvs(): readonly PdvRecord[];
  getPdv(id: number): PdvRecord | undefined;

  addReading(leitura: NewReadingRecord): ReadingRecord;
  getLatestReading(pdvId: number): ReadingRecord | undefined;
  getReadingsSince(pdvId: number, desdeMs: number): readonly ReadingRecord[];

  getSensorStatus(pdvId: number): SensorStatus;
  getEstoque(pdvId: number): number;

  createDispatch(pdvId: number, nivel: NivelCritico, sugestao: string): DispatchRecord;
  listDispatches(): readonly DispatchRecord[];

  getCounters(): CountersRecord;
  incrementCounters(delta: Partial<CountersRecord>): void;
}

export class InMemoryVenueRepository implements VenueRepository {
  private readonly pdvs = new Map<number, PdvRecord>();
  private readonly leituras = new Map<number, ReadingRecord[]>();
  private readonly dispatches: DispatchRecord[] = [];
  private counters: CountersRecord;
  private nextReadingId = 1;
  private nextDispatchId = 1;

  constructor(pdvs: readonly PdvRecord[], seedReadings: readonly NewReadingRecord[], counters: CountersRecord) {
    for (const pdv of pdvs) {
      this.pdvs.set(pdv.id, pdv);
      this.leituras.set(pdv.id, []);
    }
    for (const leitura of seedReadings) this.addReading(leitura);
    this.counters = { ...counters };
  }

  listPdvs(): readonly PdvRecord[] {
    return [...this.pdvs.values()].sort((a, b) => a.id - b.id);
  }

  getPdv(id: number): PdvRecord | undefined {
    return this.pdvs.get(id);
  }

  addReading(leitura: NewReadingRecord): ReadingRecord {
    const registro: ReadingRecord = { ...leitura, id: this.nextReadingId++ };
    const serie = this.leituras.get(leitura.pdv_id) ?? [];
    serie.push(registro);
    serie.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    const limite = Date.now() - RETENCAO_LEITURAS_MS;
    while (serie.length > 0 && Date.parse(serie[0]?.timestamp ?? '') < limite) serie.shift();
    this.leituras.set(leitura.pdv_id, serie);
    return registro;
  }

  getLatestReading(pdvId: number): ReadingRecord | undefined {
    const serie = this.leituras.get(pdvId);
    return serie && serie.length > 0 ? serie[serie.length - 1] : undefined;
  }

  getReadingsSince(pdvId: number, desdeMs: number): readonly ReadingRecord[] {
    return (this.leituras.get(pdvId) ?? []).filter((l) => Date.parse(l.timestamp) >= desdeMs);
  }

  getSensorStatus(pdvId: number): SensorStatus {
    return this.getLatestReading(pdvId)?.sensor_status ?? 'ONLINE';
  }

  getEstoque(pdvId: number): number {
    return this.getLatestReading(pdvId)?.estoque_percentual ?? 100;
  }

  createDispatch(pdvId: number, nivel: NivelCritico, sugestao: string): DispatchRecord {
    const registro: DispatchRecord = {
      id: this.nextDispatchId++,
      pdv_id: pdvId,
      nivel_critico: nivel,
      sugestao_acao: sugestao,
      status: 'PENDENTE',
      criado_em: new Date().toISOString(),
    };
    this.dispatches.push(registro);
    return registro;
  }

  listDispatches(): readonly DispatchRecord[] {
    return [...this.dispatches].sort((a, b) => b.id - a.id);
  }

  getCounters(): CountersRecord {
    return { ...this.counters };
  }

  incrementCounters(delta: Partial<CountersRecord>): void {
    this.counters = {
      publico_acumulado: this.counters.publico_acumulado + (delta.publico_acumulado ?? 0),
      atendimentos_cortesia: this.counters.atendimentos_cortesia + (delta.atendimentos_cortesia ?? 0),
      bebidas_unidades: this.counters.bebidas_unidades + (delta.bebidas_unidades ?? 0),
      autosservico_retiradas: this.counters.autosservico_retiradas + (delta.autosservico_retiradas ?? 0),
      engajamento_interacoes: this.counters.engajamento_interacoes + (delta.engajamento_interacoes ?? 0),
    };
  }
}

/** Instância singleton carregada com o seed RAIZ no boot. */
export const venueRepository: VenueRepository = new InMemoryVenueRepository(
  SEED_PDVS,
  buildSeedReadings(Date.now()),
  SEED_COUNTERS,
);
