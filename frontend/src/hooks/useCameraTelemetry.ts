import { useCallback, useEffect, useState } from 'react';
import { HARDWARE_CAMERAS } from '../components/Venue3DScene';
import type { HardwareCamera } from '../components/Venue3DScene';
import { getCameras, mensagemDeErro } from '../services/venueApi';
import type { PdvStatusItem } from '../types/publico';

const INTERVALO_PADRAO_MS = 10_000;

export interface CameraTelemetria {
  camera: HardwareCamera;
  /** Zona da API que representa esta câmera, ou null se não houver. */
  zona: PdvStatusItem | null;
}

export interface CameraTelemetryState {
  cameras: CameraTelemetria[];
  loading: boolean;
  error: string | null;
  atualizadoEm: Date | null;
  refetch: () => void;
}

/**
 * Lê a telemetria das 7 câmeras na API (GET /api/v1/venue/cameras), que já liga cada câmera à sua zona.
 * Repete a busca sozinho, pausa com a aba escondida e mantém os últimos dados em caso de erro.
 */
export function useCameraTelemetry(intervaloMs: number = INTERVALO_PADRAO_MS): CameraTelemetryState {
  const [zonas, setZonas] = useState<Record<string, PdvStatusItem>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const [tentativa, setTentativa] = useState(0);

  const refetch = useCallback(() => setTentativa((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const agendar = () => {
      timer = setTimeout(() => {
        if (document.hidden) agendar();
        else void carregar();
      }, intervaloMs);
    };

    async function carregar() {
      try {
        const dados = await getCameras(signal);
        if (signal.aborted) return;
        setZonas(dados);
        setAtualizadoEm(new Date());
        setError(null);
      } catch (err) {
        if (signal.aborted) return;
        setError(mensagemDeErro(err));
      }
      setLoading(false);
      agendar();
    }

    void carregar();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [intervaloMs, tentativa]);

  const cameras: CameraTelemetria[] = HARDWARE_CAMERAS.map((camera) => ({
    camera,
    zona: zonas[camera.id] ?? null,
  }));

  return { cameras, loading, error, atualizadoEm, refetch };
}
