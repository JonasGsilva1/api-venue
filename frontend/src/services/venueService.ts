import { api } from './api';
import type { AutosservicoItem, InstagramavelItem, SinteseAcumuladaData } from '../types/venue';
import type { PdvStatusItem, ReadinessHeatmapResponse, AnalyticsSummaryResponse } from '../types/publico';

export interface GuicheItem {
  id: string;
  codigo: string;
  nome: string;
  tipo: string;
  atendente: string;
  pessoasNaFila: number;
  capacidadeFila: number;
  tempoMedioAtendimentoSeg: number;
  status: 'NORMAL' | 'PRESSAO' | 'CRITICO';
  atendimentosConcluidos: number;
}

export interface InsumoItem {
  item_id: string;
  nome: string;
  localizacao: string;
  quantidade_atual: number;
  quantidade_minima: number;
  status: 'ESTAVEL' | 'ATENCAO' | 'DEFICIT_CRITICO';
  deficit_estimado: number;
}

export interface InsumosStatusResponse {
  total_itens_monitorados: number;
  itens_em_deficit: number;
  insumos: InsumoItem[];
}

export interface DispatchItem {
  id: number;
  pdv_id: number;
  nome_zona: string;
  nivel_critico: string;
  sugestao_acao: string;
  status: string;
  criado_em: string;
  status_operacional_evento: string;
}

export interface PredicaoGargalo {
  setor: string;
  nivel_predito: string;
  motivo: string;
  acao_recomendada: string;
  tempo_estimado_formacao_fila: string;
}

export const venueService = {
  // Autosserviço
  async getAutosservico(): Promise<AutosservicoItem[]> {
    const res = await api.get('/api/v1/venue/autosservico');
    return res.data;
  },

  async simularTransacao(id: string, valor = 30): Promise<AutosservicoItem> {
    const res = await api.post(`/api/v1/venue/autosservico/${id}/transacao`, { valor });
    return res.data;
  },

  async reabastecerTotem(id: string): Promise<AutosservicoItem> {
    const res = await api.post(`/api/v1/venue/autosservico/${id}/reabastecer`);
    return res.data;
  },

  async toggleManutencao(id: string): Promise<AutosservicoItem> {
    const res = await api.post(`/api/v1/venue/autosservico/${id}/manutencao`);
    return res.data;
  },

  // Instagramáveis
  async getInstagramavel(): Promise<InstagramavelItem[]> {
    const res = await api.get('/api/v1/venue/instagramavel');
    return res.data;
  },

  async registrarCaptura(id: string): Promise<InstagramavelItem> {
    const res = await api.post(`/api/v1/venue/instagramavel/${id}/captura`);
    return res.data;
  },

  async mudarModoLuz(id: string, modo: string): Promise<InstagramavelItem> {
    const res = await api.post(`/api/v1/venue/instagramavel/${id}/modo-luz`, { modo });
    return res.data;
  },

  async toggleStatusInstagramavel(id: string): Promise<InstagramavelItem> {
    const res = await api.post(`/api/v1/venue/instagramavel/${id}/toggle-status`);
    return res.data;
  },

  // Criar Atração
  async criarAtracao(payload: {
    tipo: 'autosservico' | 'instagramavel';
    nome: string;
    setor: string;
    insumoOuPatrocinador?: string;
  }): Promise<any> {
    const res = await api.post('/api/v1/venue/atracao', payload);
    return res.data;
  },

  // Síntese Acumulada
  async getSintese(): Promise<SinteseAcumuladaData> {
    const res = await api.get('/api/v1/venue/sintese');
    return res.data;
  },

  async simularPico(): Promise<{ status: string; mensagem: string }> {
    const res = await api.post('/api/v1/venue/simular-pico');
    return res.data;
  },

  // Guichês Balcão
  async getGuiches(): Promise<GuicheItem[]> {
    const res = await api.get('/api/v1/venue/guiches');
    return res.data;
  },

  async atualizarFilaGuiche(id: string, delta: number): Promise<GuicheItem> {
    const res = await api.post(`/api/v1/venue/guiches/${id}/fila`, { delta });
    return res.data;
  },

  // Módulos A, B, C, D
  async getPdvStatus(): Promise<PdvStatusItem[]> {
    const res = await api.get('/api/v1/pdv/status');
    if (res.data && Array.isArray(res.data.zonas)) {
      return res.data.zonas;
    }
    return Array.isArray(res.data) ? res.data : [];
  },

  async getReadinessHeatmap(): Promise<ReadinessHeatmapResponse> {
    const res = await api.get('/api/v1/venue/readiness-heatmap');
    return {
      prontidao: res.data.prontidao || res.data.readiness,
      mapa_calor_global: res.data.mapa_calor_global || res.data.heatmap_global,
    };
  },

  async getDropoffSummary(): Promise<AnalyticsSummaryResponse> {
    const res = await api.get('/api/v1/analytics/dropoff-summary');
    return {
      janela_tempo_min: res.data.janela_tempo_min ?? res.data.window_time_min,
      tempo_medio_fila_min: res.data.tempo_medio_fila_min ?? res.data.queue_time_medio_min,
      ponto_densidade_atingido: res.data.ponto_densidade_atingido ?? res.data.density_point_atingido,
      taxa_abandono_estimada_pct: res.data.taxa_abandono_estimada_pct ?? res.data.dropoff_rate_estimado_pct,
      pontuacao_esforco_ces: res.data.pontuacao_esforco_ces ?? res.data.ces_score,
      acumulado_evento: res.data.acumulado_evento,
    };
  },

  async getInsumosStatus(): Promise<InsumosStatusResponse> {
    const res = await api.get('/api/v1/insumos/status');
    return res.data;
  },

  async reabastecerInsumo(
    item_id: string,
    quantidade_solicitada = 14,
    prioridade: 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE' = 'ALTA'
  ): Promise<any> {
    const res = await api.post('/api/v1/insumos/reabastecimento', {
      item_id,
      quantidade_solicitada,
      prioridade,
    });
    return res.data;
  },

  async getPredicoesGargalos(): Promise<PredicaoGargalo> {
    const res = await api.get('/api/v1/predicoes/gargalos');
    return res.data;
  },

  async acionarFluxo(alerta_id: string, acao_executada: string, setor: string): Promise<any> {
    const res = await api.post('/api/v1/predicoes/acionar-fluxo', {
      alerta_id,
      acao_executada,
      setor,
    });
    return res.data;
  },

  async getDispatches(): Promise<DispatchItem[]> {
    const res = await api.get('/api/v1/ops/dispatch');
    return res.data.ordens || [];
  },

  async criarDispatch(pdv_id: number, nivel_critico: string, sugestao_acao: string): Promise<DispatchItem> {
    const res = await api.post('/api/v1/ops/dispatch', {
      pdv_id,
      nivel_critico,
      sugestao_acao,
    });
    return res.data;
  },

  async pingHealth(): Promise<{ status: string; latencyMs: number; status_operacional: string }> {
    const start = performance.now();
    const res = await api.get('/health');
    const latencyMs = Math.round(performance.now() - start);
    return {
      status: res.data.status,
      latencyMs,
      status_operacional: res.data.status_operacional_evento,
    };
  },
};
