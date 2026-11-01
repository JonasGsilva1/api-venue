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

export interface PdvStatusResponseV2 {
  total_zonas: number;
  status_operacional_evento: 'ESTAVEL' | 'ACAO_EM_ANDAMENTO';
  atualizado_em: string;
  zonas: ZonaStatusV2[];
}
