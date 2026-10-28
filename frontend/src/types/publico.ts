
export type StatusCor = 'VERDE' | 'AMARELO' | 'VERMELHO';
export type PdvTipo = 'BAR' | 'BANHEIRO' | 'CATRACA' | 'ESTANDE';
export type ModoLeitura =
  | 'TEMPO_REAL'
  | 'FALLBACK_502'
  | 'MEDIA_MOVEL_504'
  | 'CONTINGENCIA_503';
export type EstadoOperacional = 'NORMAL' | 'PRESSAO_MODERADA' | 'CRITICO';

export interface TelemetryReading {
  id: number;
  pdv_id: number;
  timestamp: string; 
  contagem_pessoas: number;
  tempo_espera_seg: number;
  densidade_m2: number; 
  status_cor: StatusCor;
  confianca_ia: number; 
  alerta_ruptura_estoque: boolean;
  modo_leitura: ModoLeitura;
}

export interface PdvStatusItem {
  id: number;
  nome: string; 
  tipo: PdvTipo;
  capacidade: number;
  localizacao_geo: string; 
  area_m2: number;
  ultima_leitura: TelemetryReading | null;
  habilitar_redirecionamento_push: boolean;
}

export type PdvStatusResponse = PdvStatusItem[];

export interface MapaCalorGlobal {
  pessoas_presentes: number;
  ocupacao_estimada_pct: number;
  permanencia_media_seg: number;
  densidade_maxima_m2: number;
  velocidade_media_ms: number;
  zonas_atracao: number;
  pontos_criticos: number;
  estado_operacional: EstadoOperacional;
}

export interface Prontidao {
  sensores_ativos: number;
  fontes_online_str: string;
  estoque_inicial_ok: boolean;
  rota_livre_ok: boolean;
  motor_ia_online: boolean;
}

export interface ReadinessHeatmapResponse {
  prontidao: Prontidao;
  mapa_calor_global: MapaCalorGlobal;
}

export interface AcumuladoEvento {
  publico_acumulado: number;
  atendimentos_cortesia: number;
  bebidas_unidades: number;
  autosservico_retiradas: number;
  engajamento_interacoes: number;
}

export interface AnalyticsSummaryResponse {
  janela_tempo_min: number;
  tempo_medio_fila_min: number;
  ponto_densidade_atingido: boolean;
  taxa_abandono_estimada_pct: number;
  pontuacao_esforco_ces: number;
  acumulado_evento: AcumuladoEvento;
}



export interface PosicaoPlanta {
  x: number;
  y: number;
}

export interface ZonaPublico {
  id: number;
  codigo: string; 
  titulo: string; 
  tipo: PdvTipo;
  capacidade: number;
  areaM2: number;
  posicao: PosicaoPlanta | null; 
  pessoas: number;
  densidadeM2: number;
  ocupacaoPct: number; 
  esperaSeg: number;
  statusCor: StatusCor | null; 
  modoLeitura: ModoLeitura | null;
  atualizadoEm: string | null; 
}
