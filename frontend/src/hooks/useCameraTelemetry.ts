import { useCallback, useEffect, useState } from 'react';
import { HARDWARE_CAMERAS } from '../components/Venue3DScene';
import type { HardwareCamera } from '../components/Venue3DScene';
import { CAMERA_PDV_MAP } from '../config/cameraPdvMap';
import { getCamerasTelemetry, getPdvStatus, mensagemDeErro } from '../services/venueApi';
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
 * Lê a telemetria das 7 câmeras diretamente do endpoint dedicado (/api/v1/venue/cameras),
 * com fallback para /api/v1/pdv/status caso necessário.
 */
export function useCameraTelemetry(intervaloMs: number = INTERVALO_PADRAO_MS): CameraTelemetryState {
  const [zonasPorCamera, setZonasPorCamera] = useState<Record<string, PdvStatusItem>>({});
  const [zonasFallback, setZonasFallback] = useState<PdvStatusItem[]>([]);
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
        const mapaCameras = await getCamerasTelemetry(signal);
        if (signal.aborted) return;
        setZonasPorCamera(mapaCameras);
        setAtualizadoEm(new Date());
        setError(null);
      } catch {
        if (signal.aborted) return;
        try {
          const dados = await getPdvStatus(signal);
          if (signal.aborted) return;
          setZonasFallback(dados);
          setAtualizadoEm(new Date());
          setError(null);
        } catch (err) {
          if (signal.aborted) return;
          setError(mensagemDeErro(err));
        }
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

  const cameras: CameraTelemetria[] = HARDWARE_CAMERAS.map((camera) => {
    const zonaDireta = zonasPorCamera[camera.id];
    if (zonaDireta) {
      return { camera, zona: zonaDireta };
    }
    const pdvId = CAMERA_PDV_MAP[camera.id] ?? null;
    return {
      camera,
      zona: pdvId === null ? null : (zonasFallback.find((z) => z.id === pdvId) ?? null),
    };
  });

  return { cameras, loading, error, atualizadoEm, refetch };
}
