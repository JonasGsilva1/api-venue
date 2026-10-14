/**
 * Hub WebSocket (WS /api/v1/live/stream — PROJECT_CONTEXT.md §8.3).
 *
 * Provê conexão bidirecional persistente com latência mínima (< 400ms) para envio instantâneo
 * de alertas de insumos, predições de fluxo e live heatmap diretamente ao Cockpit do operador.
 */
import type { IncomingMessage, Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { logger } from '../utils/logger';

export interface LiveStreamMessage {
  readonly tipo: 'alerta_insumo' | 'predicao_critica' | 'estado_operacional' | 'live_heatmap' | 'despacho_operacional';
  readonly emitido_em: string;
  readonly dados: Record<string, unknown>;
}

class WebSocketHub {
  private wss: WebSocketServer | null = null;
  private readonly clientes = new Set<WebSocket>();

  inicializar(server: Server): void {
    if (this.wss) return;

    this.wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request: IncomingMessage, socket, head) => {
      const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
      if (url.pathname === '/api/v1/live/stream') {
        this.wss?.handleUpgrade(request, socket, head, (ws) => {
          this.wss?.emit('connection', ws, request);
        });
      }
    });

    this.wss.on('connection', (ws: WebSocket) => {
      this.clientes.add(ws);
      logger.info('ws.conectado', { clientes: this.clientes.size });

      // Mensagem de boas-vindas com telemetria inicial
      ws.send(
        JSON.stringify({
          tipo: 'estado_operacional',
          emitido_em: new Date().toISOString(),
          dados: {
            status_operacional_evento: 'ESTAVEL',
            sensores: {
              lidar_fps: 60,
              camaras_neurais_ativas: 12,
              sensores_barris_iot: 54,
              leitor_nfc_status: 'ONLINE',
            },
          },
        }),
      );

      ws.on('close', () => {
        this.clientes.delete(ws);
        logger.info('ws.desconectado', { clientes: this.clientes.size });
      });

      ws.on('error', (err) => {
        logger.warn('ws.erro', { erro: err.message });
      });
    });
  }

  broadcast(mensagem: LiveStreamMessage): void {
    const payload = JSON.stringify(mensagem);
    for (const cliente of this.clientes) {
      if (cliente.readyState === WebSocket.OPEN) {
        cliente.send(payload);
      }
    }
  }

  get totalClientes(): number {
    return this.clientes.size;
  }
}

export const websocketHub = new WebSocketHub();
