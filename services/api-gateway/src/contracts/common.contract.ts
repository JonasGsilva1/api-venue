/**
 * Enumerações e primitivos compartilhados entre os contratos do API Gateway.
 * Fonte: PROJECT_CONTEXT.md §4.2 e §5.2.
 */
import { z } from './zod';

export const StatusCorEnum = z
  .enum(['VERDE', 'AMARELO', 'VERMELHO'])
  .openapi('StatusCor', {
    description:
      'Classificação semafórica de pressão operacional: VERDE (< 300s), AMARELO (300s a 720s), VERMELHO (> 720s).',
  });

export const ModoLeituraEnum = z
  .enum(['TEMPO_REAL', 'FALLBACK_502', 'MEDIA_MOVEL_504', 'CONTINGENCIA_503'])
  .openapi('ModoLeitura', {
    description:
      'Origem da leitura: inferência real do ai-engine ou um dos planos de contingência da Matriz de Resiliência (§6).',
  });

export const SensorStatusEnum = z
  .enum(['ONLINE', 'OFFLINE'])
  .openapi('SensorStatus', { description: 'Estado do sensor espacial anônimo no momento da coleta.' });

export const PdvTipoEnum = z
  .enum(['BAR', 'BANHEIRO', 'CATRACA', 'ESTANDE'])
  .openapi('PdvTipo', { description: 'Tipo de zona/microcontexto monitorado.' });

export const NivelCriticoEnum = z
  .enum(['BAIXO', 'MEDIO', 'ALTO', 'CRITICO_PCD_CLIMA'])
  .openapi('NivelCritico', {
    description:
      'Nível de criticidade da intervenção. CRITICO_PCD_CLIMA = desobstrução de rota acessível ou realocação por pico climático.',
  });

export const DispatchStatusEnum = z
  .enum(['PENDENTE', 'EM_ANDAMENTO', 'RESOLVIDO'])
  .openapi('DispatchStatus', { description: 'Ciclo de vida da intervenção operacional humana.' });

export const EstadoOperacionalEnum = z
  .enum(['NORMAL', 'PRESSAO_MODERADA', 'CRITICO'])
  .openapi('EstadoOperacional', { description: 'Estado operacional consolidado do mapa de calor (S06).' });

export const IsoDateTime = z.string().datetime({ offset: true }).openapi({
  description: 'Data/hora em ISO 8601.',
  example: '2026-10-13T22:00:00.000Z',
});

/**
 * Query string vazia e estrita: endpoints GET sem parâmetros rejeitam
 * qualquer query param não mapeado com 400 (Contract-First também na entrada GET).
 */
export const EmptyQueryContract = z.object({}).strict();

export type StatusCor = z.infer<typeof StatusCorEnum>;
export type ModoLeitura = z.infer<typeof ModoLeituraEnum>;
export type SensorStatus = z.infer<typeof SensorStatusEnum>;
export type PdvTipo = z.infer<typeof PdvTipoEnum>;
export type NivelCritico = z.infer<typeof NivelCriticoEnum>;
export type DispatchStatus = z.infer<typeof DispatchStatusEnum>;
export type EstadoOperacional = z.infer<typeof EstadoOperacionalEnum>;
