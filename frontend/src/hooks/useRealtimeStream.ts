import { useEffect, useRef, useState } from 'react';
import { getSseSnapshot, getWebSocketUrl } from '../services/venueApi';
import type { EventoTempoReal } from '../types/ops';

export interface RealtimeState {
  conectadoWs: boolean;
  sseAtivo: boolean;
  ultimoEvento: EventoTempoReal | null;
}

export function useRealtimeStream(
  token: string,
  onEvento?: (evento: EventoTempoReal) => void,
): RealtimeState {
  const [conectadoWs, setConectadoWs] = useState(false);
  const [sseAtivo, setSseAtivo] = useState(false);
  const [ultimoEvento, setUltimoEvento] = useState<EventoTempoReal | null>(null);
  const onEventoRef = useRef(onEvento);
  onEventoRef.current = onEvento;

  useEffect(() => {
    const controller = new AbortController();
    let ws: WebSocket | null = null;
    let pingTimer: ReturnType<typeof setInterval> | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let active = true;

    void getSseSnapshot(controller.signal)
      .then((snap) => {
        if (!active || !snap) return;
        setSseAtivo(true);
        setUltimoEvento(snap);
      })
      .catch(() => {
        // Ignora erro transitório no snapshot SSE inicial
      });

    const connect = () => {
      if (!active) return;
      try {
        ws = new WebSocket(getWebSocketUrl());
      } catch {
        return;
      }

      ws.onopen = () => {
        if (!active) return;
        setConectadoWs(true);
        pingTimer = setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send('ping');
          }
        }, 25_000);
      };

      ws.onmessage = (msg) => {
        if (!active) return;
        try {
          const evento = JSON.parse(String(msg.data)) as EventoTempoReal;
          setUltimoEvento(evento);
          if (evento.tipo !== 'heartbeat') {
            onEventoRef.current?.(evento);
          }
        } catch {
          // Ignora mensagem malformada
        }
      };

      ws.onclose = () => {
        if (pingTimer) clearInterval(pingTimer);
        if (!active) return;
        setConectadoWs(false);
        reconnectTimer = setTimeout(connect, 5_000);
      };

      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();

    return () => {
      active = false;
      controller.abort();
      if (pingTimer) clearInterval(pingTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [token]);

  return { conectadoWs, sseAtivo, ultimoEvento };
}
