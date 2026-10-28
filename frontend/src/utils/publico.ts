import type { PdvStatusItem, PosicaoPlanta, ZonaPublico } from '../types/publico';

// Funções puras (sem rede, sem React): fáceis de testar.

// Aceita "planta(x:120,y:180)", com ou sem espaços e com decimais.
const PLANTA_REGEX = /planta\(\s*x:\s*(-?\d+(?:\.\d+)?)\s*,\s*y:\s*(-?\d+(?:\.\d+)?)\s*\)/i;

/** Extrai a posição de "RAIZ | Frente-Esquerda | planta(x:120,y:180)". */
export function parsePlanta(localizacaoGeo: string): PosicaoPlanta | null {
  const match = PLANTA_REGEX.exec(localizacaoGeo);
  if (!match) return null;
  return { x: Number(match[1]), y: Number(match[2]) };
}

/** Separa "Z1 | Balcão Principal" em código ("Z1") e título ("Balcão Principal"). */
export function separarNome(nome: string): { codigo: string; titulo: string } {
  const [codigo, ...resto] = nome.split('|').map((parte) => parte.trim());
  const titulo = resto.join(' | ');
  return { codigo, titulo: titulo || codigo };
}

/** Converte o item bruto da API em uma zona pronta para os componentes. */
export function toZonaPublico(item: PdvStatusItem): ZonaPublico {
  const { codigo, titulo } = separarNome(item.nome);
  const leitura = item.ultima_leitura;
  const pessoas = leitura?.contagem_pessoas ?? 0;

  return {
    id: item.id,
    codigo,
    titulo,
    tipo: item.tipo,
    capacidade: item.capacidade,
    areaM2: item.area_m2,
    posicao: parsePlanta(item.localizacao_geo),
    pessoas,
    densidadeM2: leitura?.densidade_m2 ?? 0,
    ocupacaoPct: item.capacidade > 0 ? Math.round((pessoas / item.capacidade) * 100) : 0,
    esperaSeg: leitura?.tempo_espera_seg ?? 0,
    statusCor: leitura?.status_cor ?? null,
    modoLeitura: leitura?.modo_leitura ?? null,
    atualizadoEm: leitura?.timestamp ?? null,
  };
}

/** Formata segundos como "5m 18s" (ou "46s" quando menor que 1 minuto). */
export function formatarDuracao(segundos: number): string {
  const total = Math.max(0, Math.round(segundos));
  const min = Math.floor(total / 60);
  const seg = total % 60;
  return min > 0 ? `${min}m ${String(seg).padStart(2, '0')}s` : `${seg}s`;
}
