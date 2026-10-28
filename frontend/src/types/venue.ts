/**
 * Tipos e interfaces de dados para Venue Intelligence
 * Gestão de Eventos, Atrações (Autosserviço e Instagramável) e Síntese Acumulada
 */
export const VENUE_VERSION = '1.0.0';
export type StatusAutosservico = 'operacional' | 'atencao' | 'critico' | 'manutencao';
export type StatusInstagramavel = 'ativo' | 'alta_procura' | 'limpeza' | 'pausado';

export interface AutosservicoItem {
  id: string;
  codigo: string;
  nome: string;
  tipoInsumo: string;
  setor: string;
  status: StatusAutosservico;
  capacidadeTotalInsumo: number; // em litros ou un
  nivelAtualInsumo: number; // em litros ou un
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
  avaliacaoMedia: number; // 0 a 5
  npsScore: number;
  pessoasNaFila: number;
  tempoEsperaMin: number;
  iluminacaoCenica: {
    modo: 'Neon Pulsar' | 'Cyber Glow' | 'Golden Hour' | 'Studio Spotlight';
    corPrincipal: string;
    intensidadePct: number;
  };
  posicao3D: [number, number, number];
  hashtagsPrincipais: string[];
  fotosRecentes: { id: string; timestamp: string; autor: string; likes: number }[];
}

export interface SinteseAcumuladaData {
  eventoNome: string;
  dataEvento: string;
  tempoDecorridoHoras: number;
  publicoTotalEstimadoVenue: number;
  totalAtendimentosGerais: number;
  receitaTotalAutosservico: number;
  totalCapturasInstagramavel: number;
  alcanceTotalRedes: number;
  ticketMedioGeral: number;
  vazaoMediaAtendimentosPorMin: number;
  tempoMedioEsperaGlobalMin: number;
  satisfacaoGeralScore: number;
  autosservicoPorStatus: Record<StatusAutosservico, number>;
  instagramavelPorStatus: Record<StatusInstagramavel, number>;
  faturamentoPorSetor: { setor: string; receita: number; volume: number; pct: number }[];
  fluxoHorario: { hora: string; autosservico: number; instagramavel: number; receita: number }[];
  principaisAlertas: {
    id: string;
    tipo: 'aviso' | 'urgente' | 'info';
    mensagem: string;
    hora: string;
    atracao: string;
    atracaoId?: string;
    direcionamento: string;
    impactoEstimado?: string;
    acaoRapidaLabel?: string;
  }[];
}