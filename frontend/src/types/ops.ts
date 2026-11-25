// Tipos das ações operacionais da API (despacho e telemetria de venda).
// Espelham o contrato OpenAPI: nomes em snake_case, como a API envia.

export type NivelCritico = 'BAIXO' | 'MEDIO' | 'ALTO' | 'CRITICO' | 'CRITICO_PCD_CLIMA';
export type DispatchStatus = 'PENDENTE' | 'EM_ANDAMENTO' | 'RESOLVIDO';

export interface OperationalDispatchRequest {
  pdv_id: number;
  nivel_critico: NivelCritico;
  /** Entre 5 e 500 caracteres. */
  sugestao_acao: string;
}

export interface OperationalDispatchResponse {
  id: number;
  pdv_id: number;
  /** Só a API nova envia o nome da zona. */
  nome_zona?: string;
  nivel_critico: NivelCritico;
  sugestao_acao: string;
  status: DispatchStatus;
  criado_em: string;
}

// Formato das zonas na API nova (v2): vêm dentro de um objeto e a contagem se chama pax_count.
export interface LeituraV2 {
  id: number;
  pdv_id: number;
  timestamp: string;
  pax_count: number;
  contagem_pessoas?: number | null;
  tempo_espera_seg: number;
  tempo_espera_fmt?: string;
  densidade_m2: number;
  status_cor: 'VERDE' | 'AMARELO' | 'VERMELHO';
  confianca_ia: number;
  alerta_ruptura_estoque: boolean;
  modo_leitura: 'TEMPO_REAL' | 'FALLBACK_502' | 'MEDIA_MOVEL_504' | 'CONTINGENCIA_503';
}

export interface ZonaStatusV2 {
  id: number;
  codigo_zona: string;
  nome: string;
  tipo: 'BAR' | 'BANHEIRO' | 'CATRACA' | 'ESTANDE';
  area_m2: number;
  capacidade: number;
  ultima_leitura?: LeituraV2 | null;
  habilitar_redirecionamento_push: boolean;
  localizacao_geo?: string | null;
}

// GET /api/v1/venue/cameras: cada câmera de hardware já vem com a zona e a última leitura dela.
export interface CameraApiItem {
  id: string;
  codigo: string;
  nome: string;
  tipo: 'entrada_perimetro' | 'fluxo_interno' | 'fb_liquid';
  setor: string;
  posicao?: number[];
  alvo?: number[];
  status: 'operacional' | 'atencao' | 'critico';
  fps: number;
  metricas?: {
    rotulo: string;
    valor: string;
    detalhe?: string | null;
  };
  zona: ZonaStatusV2;
}

export interface CamerasResponseV2 {
  total_cameras: number;
  cameras_online: number;
  atualizado_em: string;
  cameras: CameraApiItem[];
}

export interface PdvStatusResponseV2 {
  total_zonas: number;
  status_operacional_evento: 'ESTAVEL' | 'ACAO_EM_ANDAMENTO';
  atualizado_em: string;
  zonas: ZonaStatusV2[];
}

export interface CoordinatePoint {
  x: number;
  y: number;
}

export interface FrameAnalysisRequest {
  pdv_id: number;
  sensor_status: 'ONLINE' | 'OFFLINE';
  coordenadas_simuladas: CoordinatePoint[];
  transacoes_pos_ultimos_3m: number;
  taxa_nfc_seg_por_pessoa?: number | null;
  simular_falha_ia?: 'NENHUMA' | 'TIMEOUT_504' | 'DOWN_503';
}

export interface FrameAnalysisResponse {
  sucesso: boolean;
  http_status: 201 | 502 | 503 | 504;
  modo_leitura: 'TEMPO_REAL' | 'FALLBACK_502' | 'MEDIA_MOVEL_504' | 'CONTINGENCIA_503';
  aviso_contingencia?: string | null;
  leitura: LeituraV2;
}

export interface DispatchListResponse {
  total_ordens: number;
  status_operacional_evento: 'ESTAVEL' | 'ACAO_EM_ANDAMENTO';
  ordens: OperationalDispatchResponse[];
}

export interface PredicaoGargaloApiResponse {
  setor: string;
  nivel_predito: 'BAIXO' | 'MEDIO' | 'ALTO' | 'CRITICO';
  motivo: string;
  acao_recomendada: string;
  tempo_estimado_formacao_fila: string;
}

export interface AcionarFluxoRequest {
  alerta_id: string;
  acao_executada: string;
  setor: string;
}

export interface AcionarFluxoResponse {
  alerta_id: string;
  acao_executada: string;
  setor: string;
  status_operacional_anterior: 'ESTAVEL' | 'ACAO_EM_ANDAMENTO';
  status_operacional_evento: 'ACAO_EM_ANDAMENTO';
  registrado_em: string;
}

export interface InferenceRequest {
  pdv_id: number;
  coordenadas_simuladas: CoordinatePoint[];
  transacoes_pos_ultimos_3m: number;
  taxa_nfc_seg_por_pessoa?: number | null;
}

export interface InferenceResponse {
  pdv_id: number;
  pax_count: number;
  tempo_espera_seg: number;
  tempo_espera_fmt: string;
  densidade_m2: number;
  status_cor: 'VERDE' | 'AMARELO' | 'VERMELHO';
  confianca_ia: number;
  anomalias: ('NFC_LENTO' | 'SATURACAO')[];
}

export interface YoloScanRequest {
  video_origem?: string;
  frame_indice?: number;
  pdv_fila_id?: number;
  pdv_estande_id?: number;
  pessoas_fila_simuladas?: number | null;
  pessoas_estande_simuladas?: number | null;
}

export interface YoloScanResponse {
  motor_visao: 'YOLOv8n_REAL' | 'SIMULACAO_OPTICA_BORDA';
  resolucao_frame: string;
  frame_processado: number;
  pessoas_detectadas_total: number;
  pessoas_zona_fila: number;
  pessoas_zona_estande: number;
  alerta_assistido_ativo: boolean;
  coordenadas_fila: CoordinatePoint[];
  coordenadas_estande: CoordinatePoint[];
  leitura_fila: LeituraV2;
  leitura_estande: LeituraV2;
}

export interface HealthResponse {
  status: 'ok';
  servico: string;
  versao: string;
  timestamp: string;
  status_operacional_evento: 'ESTAVEL' | 'ACAO_EM_ANDAMENTO';
  motor_ia_online: boolean;
  conexoes_tempo_real: number;
}

export interface EventoTempoReal {
  tipo: 'snapshot' | 'leitura' | 'mudanca_cor' | 'dispatch' | 'acionamento_preditivo' | 'heartbeat';
  emitido_em: string;
  status_operacional_evento: 'ESTAVEL' | 'ACAO_EM_ANDAMENTO';
  mensagem?: string | null;
  leitura?: LeituraV2 | null;
  dispatch?: OperationalDispatchResponse | null;
  acionamento?: AcionarFluxoResponse | null;
}
