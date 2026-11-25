/**
 * Tipos e interfaces de dados para Venue Intelligence
 * Alinhados 100% aos contratos Pydantic da API FastAPI.
 */
export const VENUE_VERSION = '2.0.0';
export type StatusAutosservico = 'operacional' | 'atencao' | 'critico' | 'manutencao';
export type StatusInstagramavel = 'ativo' | 'alta_procura' | 'limpeza' | 'pausado';
export type ModoIluminacao = 'Neon Pulsar' | 'Cyber Glow' | 'Golden Hour' | 'Studio Spotlight';

export interface AutosservicoItem {
  id: string;
  codigo: string;
  nome: string;
  tipoInsumo: string;
  setor: string;
  status: StatusAutosservico;
  capacidadeTotalInsumo: number;
  nivelAtualInsumo: number;
  unidadeMedida: 'L' | 'un';
  capacidadeCopos: number;
  nivelCopos: number;
  transacoesAcumuladas: number;
  receitaTotal: number;
  ticketMedio: number;
  tempoMedioAtendimentoSegundos: number;
  pessoasNaFila: number;
  tempoEstimadoEsperaMin: number;
  temperaturaC?: number;
  pressaoPsi?: number;
  posicao3D: [number, number, number];
  ultimoAbastecimento: string;
  consumoPorHora: { hora: string; transacoes: number; receita: number }[];
}

export interface InstagramavelItem {
  id: string;
  codigo: string;
  nome: string;
  patrocinador: string;
  categoriaCenario: string;
  setor: string;
  status: StatusInstagramavel;
  capturasTotais: number;
  compartilhamentosSociaisEstimados: number;
  alcanceEstimadoRedes: number;
  tempoPermanenciaMedioSegundos: number;
  avaliacaoMedia: number;
  npsScore: number;
  pessoasNaFila: number;
  tempoEsperaMin: number;
  iluminacaoCenica: {
    modo: ModoIluminacao;
    corPrincipal: string;
    intensidadePct: number;
  };
  posicao3D: [number, number, number];
  hashtagsPrincipais: string[];
  fotosRecentes: { id: string; timestamp: string; autor: string; likes: number }[];
}

export interface CriarAtracaoRequest {
  tipo: 'instagramavel';
  nome: string;
  setor: string;
  patrocinador?: string | null;
}

export interface SinteseAcumuladaData {
  eventoNome: string;
  dataEvento: string;
  tempoDecorridoHoras: number;
  publicoTotalEstimadoVenue: number;
  totalAtendimentosGerais: number;
  camerasMonitoradasAtivas: number;
  totalCapturasInstagramavel: number;
  alcanceTotalRedes: number;
  vazaoMediaAtendimentosPorMin: number;
  tempoMedioEsperaGlobalMin: number;
  satisfacaoGeralScore: number;
  camerasPorStatus: Record<string, number>;
  instagramavelPorStatus: Record<StatusInstagramavel, number>;
  fluxoPorSetor: { setor: string; volume: number; pct: number }[];
  fluxoHorario: { hora: string; acessosCameras: number; instagramavel: number }[];
  principaisAlertas: {
    id: string;
    tipo: 'aviso' | 'urgente' | 'info';
    mensagem: string;
    hora: string;
    atracao: string;
    atracaoId?: string | null;
    direcionamento: string;
    impactoEstimado?: string | null;
    acaoRapidaLabel?: string | null;
  }[];
}
