/**
 * Hub de Server-Sent Events (Endpoint 6 — §5.2).
 * Todo evento é validado contra `SseEventContract` antes de ser escrito no stream.
 */
import type { Response } from 'express';
import { SseEventContract, type SseEvent } from '../contracts';
import { logger } from '../utils/logger';

const HEARTBEAT_MS = 15_000;

class SseHub {
  private readonly clientes = new Set<Response>();
  private heartbeat: NodeJS.Timeout | null = null;

  registrar(res: Response): void {
    this.clientes.add(res);
    this.iniciarHeartbeat();
    logger.info('sse.conectado', { clientes: this.clientes.size });
    res.on('close', () => {
      this.clientes.delete(res);
      logger.info('sse.desconectado', { clientes: this.clientes.size });
      if (this.clientes.size === 0) this.pararHeartbeat();
    });
  }

  enviar(res: Response, evento: SseEvent): void {
    const validado = SseEventContract.parse(evento);
    res.write(`event: ${validado.tipo}\ndata: ${JSON.stringify(validado)}\n\n`);
  }

  broadcast(evento: SseEvent): void {
    const validado = SseEventContract.parse(evento);
    const frame = `event: ${validado.tipo}\ndata: ${JSON.stringify(validado)}\n\n`;
    for (const cliente of this.clientes) cliente.write(frame);
  }

  get totalClientes(): number {
    return this.clientes.size;
  }

  encerrarTodos(): void {
    for (const cliente of this.clientes) cliente.end();
    this.clientes.clear();
    this.pararHeartbeat();
  }

  private iniciarHeartbeat(): void {
    if (this.heartbeat) return;
    this.heartbeat = setInterval(() => {
      for (const cliente of this.clientes) cliente.write(`: heartbeat ${new Date().toISOString()}\n\n`);
    }, HEARTBEAT_MS);
    this.heartbeat.unref();
  }

  private pararHeartbeat(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }
}

export const sseHub = new SseHub();
