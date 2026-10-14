/**
 * SEED do estande RAIZ (dados 100% sintéticos) — PROJECT_CONTEXT.md §4.1 e §3.3 (Fase 1).
 *
 * - 6 zonas monitoradas (fontes 6/6): Z1, Z2, Z3, Z5, Sanitários e Acessos.
 * - Histórico sintético determinístico dos últimos 15 minutos por zona, permitindo que
 *   FALLBACK_502 (tendência de 15 min) e MEDIA_MOVEL_504 (média de 3 min) funcionem
 *   imediatamente após o boot, sem infraestrutura externa.
 * - Nenhum dado pessoal: apenas contagens agregadas, POS e estoque.
 */
import {
  calcularDensidade,
  classificarStatusCor,
  detectarRupturaEstoque,
  limitar,
} from '../domain/business-rules';
import type { CountersRecord, NewReadingRecord, PdvRecord } from '../domain/types';

export const SEED_PDVS: readonly PdvRecord[] = [
  {
    id: 1,
    codigo_zona: 'Z1',
    nome: 'Z1 | Balcão Principal de Drinks / Brindes',
    tipo: 'BAR',
    capacidade: 40,
    localizacao_geo: 'RAIZ | Frente-Esquerda | planta(x:120,y:180)',
    area_m2: 23,
    permanencia_referencia_seg: 150,
  },
  {
    id: 2,
    codigo_zona: 'Z2',
    nome: 'Z2 | Autosserviço Lateral',
    tipo: 'BAR',
    capacidade: 15,
    localizacao_geo: 'RAIZ | Lateral-Direita | planta(x:820,y:260)',
    area_m2: 12,
    permanencia_referencia_seg: 46, // referência ~46s (§4.1)
  },
  {
    id: 3,
    codigo_zona: 'Z3',
    nome: 'Z3 | Lounge e Mesas de Reunião',
    tipo: 'ESTANDE',
    capacidade: 24,
    localizacao_geo: 'RAIZ | Fundo-Centro | planta(x:500,y:780)',
    area_m2: 36,
    permanencia_referencia_seg: 261, // ponto médio de 3m24s (204s) a 5m18s (318s)
  },
  {
    id: 4,
    codigo_zona: 'Z5',
    nome: 'Z5 | Espaço Instagramável',
    tipo: 'ESTANDE',
    capacidade: 12,
    localizacao_geo: 'RAIZ | Frente-Direita | planta(x:760,y:150)',
    area_m2: 16,
    permanencia_referencia_seg: 95,
  },
  {
    id: 5,
    codigo_zona: 'SAN',
    nome: 'Sanitários | Bloco de Apoio',
    tipo: 'BANHEIRO',
    capacidade: 8,
    localizacao_geo: 'RAIZ | Apoio-Traseiro | planta(x:930,y:900)',
    area_m2: 14,
    permanencia_referencia_seg: 180,
  },
  {
    id: 6,
    codigo_zona: 'ACS',
    nome: 'Acessos | Catraca de Entrada',
    tipo: 'CATRACA',
    capacidade: 30,
    localizacao_geo: 'RAIZ | Entrada-Principal | planta(x:60,y:500)',
    area_m2: 20,
    permanencia_referencia_seg: 8,
  },
];

/** Perfis sintéticos usados para gerar o histórico determinístico de cada zona. */
interface ZoneProfile {
  readonly pdv_id: number;
  readonly paxBase: number;
  readonly paxAmp: number;
  readonly tempoBase: number;
  readonly tempoAmp: number;
  readonly txBase: number;
  readonly estoqueBase: number;
  readonly confidence: number;
}

const ZONE_PROFILES: readonly ZoneProfile[] = [
  // Z1: pico de 3,8 min (228s) → VERDE com push habilitado (> 180s); densidade 0,78 p/m².
  { pdv_id: 1, paxBase: 18, paxAmp: 4, tempoBase: 228, tempoAmp: 30, txBase: 9, estoqueBase: 72, confidence: 0.91 },
  { pdv_id: 2, paxBase: 4, paxAmp: 2, tempoBase: 46, tempoAmp: 10, txBase: 14, estoqueBase: 85, confidence: 0.9 },
  { pdv_id: 3, paxBase: 11, paxAmp: 3, tempoBase: 35, tempoAmp: 10, txBase: 3, estoqueBase: 100, confidence: 0.88 },
  { pdv_id: 4, paxBase: 6, paxAmp: 2, tempoBase: 95, tempoAmp: 20, txBase: 5, estoqueBase: 100, confidence: 0.87 },
  { pdv_id: 5, paxBase: 3, paxAmp: 1, tempoBase: 60, tempoAmp: 20, txBase: 6, estoqueBase: 100, confidence: 0.86 },
  { pdv_id: 6, paxBase: 5, paxAmp: 3, tempoBase: 20, tempoAmp: 8, txBase: 40, estoqueBase: 100, confidence: 0.93 },
];

const HISTORICO_MINUTOS = 15;

/**
 * Gera o histórico dos últimos 15 minutos (1 leitura/min, a mais recente há 15s).
 * Determinístico (senoidal) para que testes sejam reprodutíveis.
 */
export function buildSeedReadings(agoraMs: number): NewReadingRecord[] {
  const leituras: NewReadingRecord[] = [];
  for (const perfil of ZONE_PROFILES) {
    const pdv = SEED_PDVS.find((p) => p.id === perfil.pdv_id);
    if (!pdv) continue;
    for (let i = HISTORICO_MINUTOS - 1; i >= 0; i -= 1) {
      const onda = Math.sin(i * 0.6);
      const pax = Math.max(0, Math.round(perfil.paxBase + perfil.paxAmp * onda));
      const tempo = Math.max(0, Math.round(perfil.tempoBase + perfil.tempoAmp * onda));
      const tx = Math.max(0, Math.round(perfil.txBase + 2 * Math.sin(i * 0.9)));
      const estoque = limitar(perfil.estoqueBase + (perfil.estoqueBase < 100 ? i : 0), 0, 100);
      const timestampMs = agoraMs - (i * 60_000 + 15_000);
      leituras.push({
        pdv_id: pdv.id,
        timestamp: new Date(timestampMs).toISOString(),
        pax_count: pax,
        tempo_espera_seg: tempo,
        densidade_m2: calcularDensidade(pax, pdv.area_m2),
        status_cor: classificarStatusCor(tempo),
        ia_confidence: perfil.confidence,
        alerta_ruptura_estoque: detectarRupturaEstoque(pax, tx, estoque),
        modo_leitura: 'TEMPO_REAL',
        transacoes_pos_ultimos_3m: tx,
        estoque_percentual: estoque,
        sensor_status: 'ONLINE',
      });
    }
  }
  return leituras;
}

/** Acumulado sintético D1-D3 do evento (síntese S10). */
export const SEED_COUNTERS: CountersRecord = {
  publico_acumulado: 3184,
  atendimentos_cortesia: 1426,
  bebidas_unidades: 2210,
  autosservico_retiradas: 968,
  engajamento_interacoes: 1735,
};
