/**
 * Serviço de Insumos, Predições e Estado Operacional da Suíte RaizEvento (PROJECT_CONTEXT.md §8.2 e §8.3).
 */
import type {
  AcionarFluxoRequest,
  AcionarFluxoResponse,
  InsumoItem,
  InsumosStatusResponse,
  PredicaoGargaloResponse,
  ReabastecimentoRequest,
  ReabastecimentoResponse,
  StatusOperacionalEvento,
} from '../contracts';
import { logger } from '../utils/logger';
import { websocketHub } from './websocket.hub';

export class RaizEventoService {
  private statusEvento: StatusOperacionalEvento = 'ESTAVEL';
  private proximoProtocolo = 42;

  private readonly insumos: InsumoItem[] = [
    {
      item_id: 'BAR-83-IPA',
      nome: 'Chopp IPA (Barril 50L)',
      localizacao: 'Bar Principal Norte',
      quantidade_atual: 6,
      quantidade_minima: 20,
      status: 'DEFICIT_CRITICO',
      deficit_estimado: 14,
    },
    {
      item_id: 'BAR-12-PILSEN',
      nome: 'Chopp Pilsen (Barril 50L)',
      localizacao: 'Bar Secundário Sul',
      quantidade_atual: 18,
      quantidade_minima: 25,
      status: 'DEFICIT_CRITICO',
      deficit_estimado: 7,
    },
    {
      item_id: 'BAR-05-AGUA',
      nome: 'Água Mineral 500ml (Fardos)',
      localizacao: 'Autosserviço Lateral Z2',
      quantidade_atual: 4,
      quantidade_minima: 15,
      status: 'DEFICIT_CRITICO',
      deficit_estimado: 11,
    },
  ];

  obterStatusInsumos(): InsumosStatusResponse {
    const itensEmDeficit = this.insumos.filter((i) => i.status === 'DEFICIT_CRITICO').length;
    return {
      total_itens_monitorados: 150,
      itens_em_deficit: itensEmDeficit,
      insumos: [...this.insumos],
    };
  }

  solicitarReabastecimento(req: ReabastecimentoRequest): ReabastecimentoResponse {
    const protocolo = `REAB-2026-${String(this.proximoProtocolo++).padStart(4, '0')}`;
    const timestamp = new Date().toISOString();

    // Notifica via WebSocket
    websocketHub.broadcast({
      tipo: 'alerta_insumo',
      emitido_em: timestamp,
      dados: {
        item_id: req.item_id,
        quantidade_solicitada: req.quantidade_solicitada,
        prioridade: req.prioridade,
        protocolo_id: protocolo,
      },
    });

    logger.info('insumo.reabastecimento_solicitado', {
      protocolo,
      item_id: req.item_id,
      quantidade: req.quantidade_solicitada,
    });

    return {
      protocolo_id: protocolo,
      item_id: req.item_id,
      quantidade_solicitada: req.quantidade_solicitada,
      prioridade: req.prioridade,
      status_pedido: 'SOLICITADO',
      timestamp,
    };
  }

  obterPredicaoGargalo(): PredicaoGargaloResponse {
    return {
      setor: 'Portão Principal / Entrada Norte',
      nivel_predito: 'CRITICO',
      motivo: 'Aumento repentino de fluxo detectado por IA',
      acao_recomendada: 'Acionar 2 filas adicionais',
      tempo_estimado_formacao_fila: '03m 30s',
    };
  }

  acionarFluxo(req: AcionarFluxoRequest): AcionarFluxoResponse {
    const timestamp = new Date().toISOString();
    this.atualizarStatusEvento('ACAO_EM_ANDAMENTO');

    websocketHub.broadcast({
      tipo: 'predicao_critica',
      emitido_em: timestamp,
      dados: {
        alerta_id: req.alerta_id,
        acao_executada: req.acao_executada,
        setor: req.setor,
        status_operacional_evento: this.statusEvento,
      },
    });

    logger.info('fluxo.acionado', {
      alerta_id: req.alerta_id,
      acao_executada: req.acao_executada,
      status_evento: this.statusEvento,
    });

    return {
      alerta_id: req.alerta_id,
      acao_executada: req.acao_executada,
      setor: req.setor,
      status_operacional_evento: 'ACAO_EM_ANDAMENTO',
      timestamp,
    };
  }

  atualizarStatusEvento(novoStatus: StatusOperacionalEvento): void {
    const statusAnterior = this.statusEvento;
    this.statusEvento = novoStatus;

    if (statusAnterior !== novoStatus) {
      websocketHub.broadcast({
        tipo: 'estado_operacional',
        emitido_em: new Date().toISOString(),
        dados: {
          status_operacional_anterior: statusAnterior,
          status_operacional_evento: novoStatus,
        },
      });
      logger.info('evento.transicao_estado', {
        de: statusAnterior,
        para: novoStatus,
      });
    }
  }

  obterStatusEvento(): StatusOperacionalEvento {
    return this.statusEvento;
  }
}

export const raizEventoService = new RaizEventoService();
