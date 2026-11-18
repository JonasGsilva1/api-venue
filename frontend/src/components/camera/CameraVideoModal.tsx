import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Camera,
  CheckCircle2,
  Cpu,
  Pause,
  Play,
  RotateCcw,
  Send,
  Upload,
  X,
} from 'lucide-react';
import type { CameraTelemetria } from '../../hooks/useCameraTelemetry';
import { mensagemDeErro, postDespacho, postFrameAnalysis } from '../../services/venueApi';
import type { FrameAnalysisResponse, LeituraV2 } from '../../types/ops';
import {
  DEFAULT_ZONA_ESTANDE,
  DEFAULT_ZONA_FILA,
  SimplePersonTracker,
  detectPeopleInFrame,
  getYoloBackend,
  loadYoloModel,
  toApiCoordinate,
  type PersonDetection,
  type Point2D,
  type TrackerStats,
} from '../../services/yoloBrowser';
import { formatarDuracao } from '../../utils/publico';

interface CameraVideoModalProps {
  item: CameraTelemetria | null;
  onClose: () => void;
  onTelemetrySynced: () => void;
}

interface TimelineSample {
  timeSec: number;
  fila: number;
  estande: number;
  esperaSeg: number;
}

interface DragTarget {
  zone: 'fila' | 'estande';
  index: number;
}

const COR_SEMAFORO: Record<LeituraV2['status_cor'], string> = {
  VERDE: 'border-emerald-500/40 bg-emerald-950/60 text-emerald-300',
  AMARELO: 'border-amber-500/40 bg-amber-950/60 text-amber-300',
  VERMELHO: 'border-rose-500/40 bg-rose-950/60 text-rose-300',
};

const CAMERA_DEFAULT_PDV_ID: Record<string, { pdvId: number; areaM2: number; capacidade: number; tempoServicoSeg: number }> = {
  'cam-ent-01': { pdvId: 101, areaM2: 45, capacidade: 80, tempoServicoSeg: 5 },
  'cam-ent-02': { pdvId: 102, areaM2: 30, capacidade: 40, tempoServicoSeg: 5 },
  'cam-ent-03': { pdvId: 103, areaM2: 60, capacidade: 120, tempoServicoSeg: 5 },
  'cam-ent-04': { pdvId: 104, areaM2: 40, capacidade: 60, tempoServicoSeg: 6 },
  'cam-fluxo-01': { pdvId: 5, areaM2: 120, capacidade: 300, tempoServicoSeg: 12 },
  'cam-fluxo-02': { pdvId: 1, areaM2: 23, capacidade: 40, tempoServicoSeg: 38 },
  'cam-fluxo-03': { pdvId: 2, areaM2: 12, capacidade: 15, tempoServicoSeg: 23 },
};

function clonePolygon(poly: Point2D[]): Point2D[] {
  return poly.map((p) => ({ x: p.x, y: p.y }));
}

export const CameraVideoModal: React.FC<CameraVideoModalProps> = ({
  item,
  onClose,
  onTelemetrySynced,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const trackerRef = useRef<SimplePersonTracker>(new SimplePersonTracker());
  const rafRef = useRef<number | null>(null);
  const processingRef = useRef(false);
  const lastInferenceAtRef = useRef(0);
  const lastApiSyncAtRef = useRef(0);
  const frameCounterRef = useRef(0);
  const dragRef = useRef<DragTarget | null>(null);

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoName, setVideoName] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoEnded, setVideoEnded] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);

  const [modelState, setModelState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [modelError, setModelError] = useState<string | null>(null);
  const [backendName, setBackendName] = useState<'webgpu' | 'wasm'>('wasm');
  const [confThreshold, setConfThreshold] = useState(0.35);

  const [zonaFila, setZonaFila] = useState<Point2D[]>(() => clonePolygon(DEFAULT_ZONA_FILA));
  const [zonaEstande, setZonaEstande] = useState<Point2D[]>(() => clonePolygon(DEFAULT_ZONA_ESTANDE));
  const zonaFilaRef = useRef(zonaFila);
  const zonaEstandeRef = useRef(zonaEstande);
  zonaFilaRef.current = zonaFila;
  zonaEstandeRef.current = zonaEstande;

  const [detections, setDetections] = useState<PersonDetection[]>([]);
  const detectionsRef = useRef<PersonDetection[]>([]);
  detectionsRef.current = detections;

  const [trackerStats, setTrackerStats] = useState<TrackerStats>({
    entradas: 0,
    saidas: 0,
    permanenciaMediaSeg: 0,
    ativos: 0,
  });
  const [apiResult, setApiResult] = useState<FrameAnalysisResponse | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineSample[]>([]);
  const [dispatchBusy, setDispatchBusy] = useState(false);
  const [dispatchFeedback, setDispatchFeedback] = useState<string | null>(null);

  const fallbackConfig = item ? CAMERA_DEFAULT_PDV_ID[item.camera.id] : undefined;
  const pdvId = item?.zona?.id ?? fallbackConfig?.pdvId ?? 1;
  const zonaAreaM2 = item?.zona?.area_m2 ?? fallbackConfig?.areaM2 ?? 35;
  const zonaCapacidade = item?.zona?.capacidade ?? fallbackConfig?.capacidade ?? 40;
  const zonaTempoServico = fallbackConfig?.tempoServicoSeg ?? 25;

  // Pré-carrega o modelo YOLOv8n ONNX ao abrir o modal
  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    setModelState('loading');
    setModelError(null);

    loadYoloModel()
      .then(() => {
        if (cancelled) return;
        setBackendName(getYoloBackend());
        setModelState('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setModelState('error');
        setModelError(err instanceof Error ? err.message : 'Falha ao carregar YOLOv8n ONNX.');
      });

    return () => {
      cancelled = true;
    };
  }, [item]);

  // Limpa recursos de vídeo ao trocar de câmera ou fechar modal
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  const drawOverlay = useCallback((dets: PersonDetection[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const drawZone = (poly: Point2D[], stroke: string, fill: string, label: string) => {
      if (poly.length < 3) return;
      ctx.beginPath();
      poly.forEach((p, idx) => {
        const px = p.x * W;
        const py = p.y * H;
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = stroke;
      ctx.stroke();

      // Rótulo da zona no primeiro vértice
      const labelX = poly[0].x * W + 6;
      const labelY = Math.max(16, poly[0].y * H - 6);
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.fillStyle = stroke;
      ctx.fillText(label, labelX, labelY);

      // Alças arrastáveis nos vértices
      poly.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x * W, p.y * H, 5.5, 0, Math.PI * 2);
        ctx.fillStyle = '#070c18';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = stroke;
        ctx.stroke();
      });
    };

    drawZone(zonaEstandeRef.current, '#10b981', 'rgba(16, 185, 129, 0.12)', 'ESTANDE');
    drawZone(zonaFilaRef.current, '#f43f5e', 'rgba(244, 63, 94, 0.14)', 'FILA');

    // Caixas delimitadoras + ponto nos pés
    for (const d of dets) {
      const x = d.x1 * W;
      const y = d.y1 * H;
      const w = (d.x2 - d.x1) * W;
      const h = (d.y2 - d.y1) * H;
      const color =
        d.zona === 'fila' ? '#fb7185' : d.zona === 'estande' ? '#34d399' : '#94a3b8';

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);

      const tag = `#${d.trackId} ${Math.round(d.confidence * 100)}%`;
      ctx.font = 'bold 10px ui-monospace, monospace';
      const tw = ctx.measureText(tag).width + 8;
      ctx.fillStyle = color;
      ctx.fillRect(x, Math.max(0, y - 16), tw, 16);
      ctx.fillStyle = '#070c18';
      ctx.fillText(tag, x + 4, Math.max(11, y - 4));

      // Ponto dos pés
      ctx.beginPath();
      ctx.arc(d.footX * W, d.footY * H, 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }, []);

  // Redesenha o overlay sempre que os polígonos forem calibrados (mesmo pausado)
  useEffect(() => {
    drawOverlay(detectionsRef.current);
  }, [zonaFila, zonaEstande, drawOverlay]);

  const syncWithApi = useCallback(
    async (dets: PersonDetection[], stats: TrackerStats, videoSec: number) => {
      const filaCoords = dets
        .filter((d) => d.zona === 'fila')
        .map((d) => toApiCoordinate({ x: d.footX, y: d.footY }));
      const estandeCoords = dets
        .filter((d) => d.zona === 'estande')
        .map((d) => toApiCoordinate({ x: d.footX, y: d.footY }));

      // Para câmeras de fluxo/fila envia coords da fila; para entradas/estandes envia total nas zonas
      const isFilaZone = item?.camera.tipo === 'fluxo_densidade' || pdvId === 1 || pdvId === 5;
      const coordsToSend = isFilaZone ? filaCoords : [...filaCoords, ...estandeCoords];

      try {
        const res = await postFrameAnalysis({
          pdv_id: pdvId,
          sensor_status: 'ONLINE',
          coordenadas_simuladas: coordsToSend,
          transacoes_pos_ultimos_3m: Math.max(stats.saidas, estandeCoords.length),
          taxa_nfc_seg_por_pessoa: null,
          simular_falha_ia: 'NENHUMA',
        });
        setApiResult(res);
        setApiError(null);
        setTimeline((prev) => [
          ...prev.slice(-59),
          {
            timeSec: videoSec,
            fila: filaCoords.length,
            estande: estandeCoords.length,
            esperaSeg: res.leitura.tempo_espera_seg,
          },
        ]);
        onTelemetrySynced();
      } catch (err) {
        // Fallback local caso a API esteja offline ou inacessível, mantendo as métricas visíveis
        const pax = coordsToSend.length;
        const esperaEst = Math.round(pax * zonaTempoServico);
        const densidadeEst = Number((pax / Math.max(1, zonaAreaM2)).toFixed(2));
        const corEst: LeituraV2['status_cor'] =
          esperaEst < 300 ? 'VERDE' : esperaEst <= 720 ? 'AMARELO' : 'VERMELHO';
        setApiResult({
          sucesso: false,
          http_status: 503,
          modo_leitura: 'CONTINGENCIA_503',
          aviso_contingencia: mensagemDeErro(err),
          leitura: {
            id: 0,
            pdv_id: pdvId,
            timestamp: new Date().toISOString(),
            pax_count: pax,
            contagem_pessoas: pax,
            tempo_espera_seg: esperaEst,
            densidade_m2: densidadeEst,
            status_cor: corEst,
            confianca_ia: 0.9,
            alerta_ruptura_estoque: false,
            modo_leitura: 'CONTINGENCIA_503',
          },
        });
        setTimeline((prev) => [
          ...prev.slice(-59),
          {
            timeSec: videoSec,
            fila: filaCoords.length,
            estande: estandeCoords.length,
            esperaSeg: esperaEst,
          },
        ]);
        setApiError(mensagemDeErro(err));
      }
    },
    [pdvId, item?.camera.tipo, zonaTempoServico, zonaAreaM2, onTelemetrySynced],
  );

  // Loop de análise em tempo real durante a reprodução do vídeo
  useEffect(() => {
    if (!isPlaying || modelState !== 'ready') return;
    let active = true;

    const tick = async () => {
      if (!active) return;
      const video = videoRef.current;
      if (video && !video.paused && !video.ended && video.readyState >= 2) {
        setCurrentTimeSec(video.currentTime);
        const now = performance.now();

        if (!processingRef.current && now - lastInferenceAtRef.current >= 140) {
          processingRef.current = true;
          lastInferenceAtRef.current = now;
          frameCounterRef.current += 1;

          try {
            const raw = await detectPeopleInFrame(video, confThreshold);
            if (!active) return;

            const tracked = trackerRef.current.update(
              raw,
              now,
              zonaFilaRef.current,
              zonaEstandeRef.current,
            );
            setDetections(tracked.detections);
            setTrackerStats(tracked.stats);
            drawOverlay(tracked.detections);

            if (now - lastApiSyncAtRef.current >= 800) {
              lastApiSyncAtRef.current = now;
              void syncWithApi(tracked.detections, tracked.stats, video.currentTime);
            }
          } catch (err) {
            if (active) {
              setApiError(err instanceof Error ? err.message : 'Erro na inferência YOLOv8.');
            }
          } finally {
            processingRef.current = false;
          }
        }
      }

      if (active) {
        rafRef.current = requestAnimationFrame(() => {
          void tick();
        });
      }
    };

    rafRef.current = requestAnimationFrame(() => {
      void tick();
    });

    return () => {
      active = false;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPlaying, modelState, confThreshold, drawOverlay, syncWithApi]);

  const handleVideoFile = (file: File) => {
    if (!file.type.startsWith('video/')) {
      setApiError('Selecione um arquivo de vídeo válido (.mp4, .webm ou .mov).');
      return;
    }
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const url = URL.createObjectURL(file);
    trackerRef.current.reset();
    frameCounterRef.current = 0;
    lastApiSyncAtRef.current = 0;
    setVideoUrl(url);
    setVideoName(file.name);
    setVideoEnded(false);
    setIsPlaying(false);
    setDetections([]);
    setTimeline([]);
    setApiResult(null);
    setApiError(null);
    setTrackerStats({ entradas: 0, saidas: 0, permanenciaMediaSeg: 0, ativos: 0 });
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;
    if (video.paused || video.ended) {
      if (video.ended) {
        video.currentTime = 0;
        trackerRef.current.reset();
        setTimeline([]);
        setVideoEnded(false);
      }
      void video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const handleRestart = () => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    trackerRef.current.reset();
    setTimeline([]);
    setVideoEnded(false);
    setDetections([]);
    drawOverlay([]);
    void video.play();
    setIsPlaying(true);
  };

  const getRelativeCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>): Point2D => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pt = getRelativeCanvasPoint(e);
    const hitRadius = 0.035;

    for (let i = 0; i < zonaFila.length; i++) {
      if (Math.hypot(pt.x - zonaFila[i].x, pt.y - zonaFila[i].y) <= hitRadius) {
        dragRef.current = { zone: 'fila', index: i };
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
    }
    for (let i = 0; i < zonaEstande.length; i++) {
      if (Math.hypot(pt.x - zonaEstande[i].x, pt.y - zonaEstande[i].y) <= hitRadius) {
        dragRef.current = { zone: 'estande', index: i };
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const target = dragRef.current;
    if (!target) return;
    const pt = getRelativeCanvasPoint(e);
    if (target.zone === 'fila') {
      setZonaFila((prev) => prev.map((p, idx) => (idx === target.index ? pt : p)));
    } else {
      setZonaEstande((prev) => prev.map((p, idx) => (idx === target.index ? pt : p)));
    }
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  const handleDispatchFromModal = async () => {
    setDispatchBusy(true);
    setDispatchFeedback(null);
    try {
      const espera = apiResult?.leitura.tempo_espera_seg ?? 0;
      const nivel = apiResult?.leitura.status_cor === 'VERMELHO' ? 'CRITICO' : 'ALTO';
      const resp = await postDespacho({
        pdv_id: pdvId,
        nivel_critico: nivel,
        sugestao_acao: `Despacho via YOLOv8 (${item?.camera.codigo}): reforçar atendimento (fila ${filaCount} pax, espera ${espera}s)`,
      });
      setDispatchFeedback(`Despacho #${resp.id} registrado em ${resp.nome_zona ?? item?.camera.codigo}.`);
      onTelemetrySynced();
    } catch (err) {
      setApiError(mensagemDeErro(err));
    } finally {
      setDispatchBusy(false);
    }
  };

  if (!item) return null;

  const filaCount = detections.filter((d) => d.zona === 'fila').length;
  const estandeCount = detections.filter((d) => d.zona === 'estande').length;
  const totalNaCena = detections.length;
  const leitura = apiResult?.leitura ?? item.zona?.ultima_leitura ?? null;
  const ocupacaoPct = Math.min(100, Math.round(((filaCount + estandeCount) / Math.max(1, zonaCapacidade)) * 100));
  const taxaPassagemMin =
    currentTimeSec > 0.5 ? Math.round((trackerStats.entradas / currentTimeSec) * 60) : 0;
  const confiancaMediaPct =
    detections.length > 0
      ? Math.round((detections.reduce((acc, d) => acc + d.confidence, 0) / detections.length) * 100)
      : leitura
        ? Math.round(leitura.confianca_ia * 100)
        : 0;
  const alertaAssistido =
    filaCount >= 6 ||
    (leitura !== null && (leitura.tempo_espera_seg >= 180 || leitura.status_cor !== 'VERDE'));

  const peakFila = timeline.reduce((m, s) => Math.max(m, s.fila), 0);
  const maxEspera = timeline.reduce((m, s) => Math.max(m, s.esperaSeg), 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-5 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label={`Análise de vídeo ${item.camera.codigo}`}
    >
      <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-cyan-500/40 bg-[#0b1220] shadow-2xl">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cyan-950/70 bg-[#080d1a] px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-500/40 bg-cyan-950/40 text-cyan-300">
              <Camera className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-black text-white">{item.camera.codigo}</span>
                <span className="truncate text-xs text-slate-300">{item.camera.nome}</span>
                <span className="inline-flex items-center gap-1 rounded-md border border-cyan-500/30 bg-cyan-950/60 px-2 py-0.5 font-mono text-[10px] font-bold text-cyan-300">
                  <Cpu className="h-3 w-3" />
                  {modelState === 'loading'
                    ? 'Carregando YOLOv8n...'
                    : modelState === 'error'
                      ? 'Modelo indisponível'
                      : `YOLOv8n ONNX · ${backendName.toUpperCase()}`}
                </span>
              </div>
              <p className="text-[11px] font-mono text-slate-400 truncate">
                {item.zona
                  ? `Zona vinculada: ${item.zona.nome} (ID ${item.zona.id})`
                  : `Zona padrão mapeada: PDV #${pdvId} (${zonaAreaM2} m² · cap. ${zonaCapacidade} pax)`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela de vídeo"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="grid grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-12">
          {/* Coluna Esquerda: Player + Canvas Overlay */}
          <div className="space-y-3 lg:col-span-7">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) handleVideoFile(file);
              }}
              className="relative aspect-video w-full overflow-hidden rounded-xl border border-cyan-900/60 bg-[#050912]"
            >
              {videoUrl ? (
                <>
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    muted
                    playsInline
                    onLoadedMetadata={(e) => {
                      setDurationSec(e.currentTarget.duration || 0);
                      drawOverlay([]);
                    }}
                    onEnded={() => {
                      setIsPlaying(false);
                      setVideoEnded(true);
                    }}
                    className="h-full w-full object-fill"
                  />
                  <canvas
                    ref={canvasRef}
                    width={640}
                    height={360}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
                  />
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-full w-full flex-col items-center justify-center gap-2 p-6 text-center transition-colors hover:bg-cyan-950/20"
                >
                  <Upload className="h-9 w-9 text-cyan-400" />
                  <span className="text-sm font-bold text-white">
                    Clique ou arraste um vídeo (.mp4 / .webm)
                  </span>
                  <span className="max-w-sm text-xs text-slate-400">
                    O vídeo é analisado localmente no seu navegador pelo YOLOv8n e apenas as coordenadas
                    anônimas (x, y) são enviadas à API.
                  </span>
                </button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleVideoFile(file);
                }}
              />
            </div>

            {modelError && (
              <div className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-xs text-rose-300">
                Erro no modelo YOLOv8n: {modelError}
              </div>
            )}

            {/* Controles do Player e Calibração */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-[#080d1a] px-3 py-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={togglePlay}
                  disabled={!videoUrl || modelState !== 'ready'}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-black text-slate-950 transition-colors hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  <span>{isPlaying ? 'Pausar' : videoEnded ? 'Reassistir' : 'Analisar'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleRestart}
                  disabled={!videoUrl}
                  title="Reiniciar vídeo"
                  className="rounded-lg border border-slate-700 bg-[#0d1527] p-1.5 text-slate-300 hover:text-white disabled:opacity-40"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1 rounded-lg border border-cyan-800/60 bg-[#0d1527] px-2.5 py-1.5 text-[11px] font-semibold text-cyan-300 hover:bg-[#13203b]"
                >
                  <Upload className="h-3 w-3" />
                  <span>{videoName ? 'Trocar vídeo' : 'Escolher vídeo'}</span>
                </button>
              </div>

              <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400">
                <label className="flex items-center gap-1.5">
                  <span>Conf: {Math.round(confThreshold * 100)}%</span>
                  <input
                    type="range"
                    min={0.2}
                    max={0.7}
                    step={0.05}
                    value={confThreshold}
                    onChange={(e) => setConfThreshold(Number(e.target.value))}
                    className="w-16 accent-cyan-400"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => {
                    setZonaFila(clonePolygon(DEFAULT_ZONA_FILA));
                    setZonaEstande(clonePolygon(DEFAULT_ZONA_ESTANDE));
                  }}
                  className="rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-800"
                >
                  Resetar zonas
                </button>
              </div>
            </div>

            {videoUrl && (
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 px-1">
                <span className="truncate">{videoName}</span>
                <span>
                  {formatarDuracao(Math.round(currentTimeSec))} / {formatarDuracao(Math.round(durationSec))} ·
                  Arraste os vértices das zonas no vídeo para calibrar
                </span>
              </div>
            )}

            {/* Gráfico de Linha do Tempo */}
            {timeline.length > 1 && (
              <div className="rounded-xl border border-slate-800 bg-[#080d1a] p-3 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="font-bold text-slate-300">Evolução da Fila no Vídeo</span>
                  <span className="text-slate-400">
                    Pico: <strong className="text-rose-400">{peakFila} pax</strong> · Espera máx:{' '}
                    <strong className="text-amber-300">{formatarDuracao(maxEspera)}</strong>
                  </span>
                </div>
                <svg viewBox="0 0 300 56" className="h-14 w-full overflow-visible">
                  <polyline
                    fill="none"
                    stroke="#fb7185"
                    strokeWidth="2"
                    points={timeline
                      .map((s, i) => {
                        const x = (i / Math.max(1, timeline.length - 1)) * 300;
                        const maxY = Math.max(6, peakFila);
                        const y = 52 - (s.fila / maxY) * 46;
                        return `${x.toFixed(1)},${y.toFixed(1)}`;
                      })
                      .join(' ')}
                  />
                </svg>
              </div>
            )}
          </div>

          {/* Coluna Direita: Métricas da API & Alerta Assistido */}
          <div className="space-y-3 lg:col-span-5">
            <div className="rounded-xl border border-cyan-900/60 bg-[#080d1a] p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-cyan-300">
                  <Activity className="h-4 w-4" />
                  <span>Telemetria ao Vivo (API)</span>
                </h3>
                {leitura && (
                  <span
                    className={`rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold ${COR_SEMAFORO[leitura.status_cor]}`}
                  >
                    {leitura.status_cor}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-2.5">
                  <span className="text-[10px] font-mono text-rose-300">FILA (ZONA VERMELHA)</span>
                  <p className="mt-0.5 font-mono text-xl font-black text-white">{filaCount} pax</p>
                </div>
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-2.5">
                  <span className="text-[10px] font-mono text-emerald-300">ESTANDE (ZONA VERDE)</span>
                  <p className="mt-0.5 font-mono text-xl font-black text-white">{estandeCount} pax</p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-[#0d1527] p-2.5">
                  <span className="text-[10px] font-mono text-slate-400">ESPERA ESTIMADA</span>
                  <p className="mt-0.5 font-mono text-lg font-bold text-white">
                    {leitura ? formatarDuracao(leitura.tempo_espera_seg) : '—'}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-[#0d1527] p-2.5">
                  <span className="text-[10px] font-mono text-slate-400">DENSIDADE</span>
                  <p className="mt-0.5 font-mono text-lg font-bold text-white">
                    {leitura ? `${leitura.densidade_m2.toFixed(2)} p/m²` : '—'}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-[#0d1527] p-2.5">
                  <span className="text-[10px] font-mono text-slate-400">OCUPAÇÃO ({zonaCapacidade} MAX)</span>
                  <p className="mt-0.5 font-mono text-lg font-bold text-white">
                    {ocupacaoPct}% <span className="text-xs font-normal text-slate-400">({totalNaCena} na cena)</span>
                  </p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-[#0d1527] p-2.5">
                  <span className="text-[10px] font-mono text-slate-400">PASSAGEM / CONFIANÇA</span>
                  <p className="mt-0.5 font-mono text-sm font-bold text-cyan-300">
                    {taxaPassagemMin} p/min · {confiancaMediaPct}%
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 border-t border-slate-800 pt-2.5 text-center font-mono">
                <div>
                  <span className="block text-[10px] text-slate-500">ENTRADAS</span>
                  <span className="text-xs font-bold text-cyan-300">{trackerStats.entradas}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-500">SAÍDAS</span>
                  <span className="text-xs font-bold text-slate-200">{trackerStats.saidas}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-500">PERMANÊNCIA</span>
                  <span className="text-xs font-bold text-emerald-300">
                    {trackerStats.permanenciaMediaSeg > 0
                      ? `${trackerStats.permanenciaMediaSeg.toFixed(1)}s`
                      : '—'}
                  </span>
                </div>
              </div>
            </div>

            {apiError && (
              <div className="rounded-lg border border-rose-500/40 bg-rose-950/30 px-3 py-2 text-xs text-rose-300">
                {apiError}
              </div>
            )}

            {/* Alerta Assistido & Ação */}
            {alertaAssistido ? (
              <div className="rounded-xl border border-amber-500/40 bg-amber-950/25 p-3.5 space-y-2.5">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <div>
                    <h4 className="text-xs font-bold text-amber-200">Alerta Assistido de Gargalo</h4>
                    <p className="mt-0.5 text-[11px] text-amber-100/80">
                      Fila ou tempo de espera acima do limite operacional. Recomenda-se despacho tático
                      ou redirecionamento de fluxo.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void handleDispatchFromModal()}
                  disabled={dispatchBusy}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-rose-500 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-rose-400 disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>{dispatchBusy ? 'Enviando despacho...' : 'Acionar Despacho Ops'}</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3 text-xs text-emerald-300">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Fluxo sob controle nesta câmera. Nenhum gargalo ativo no momento.</span>
              </div>
            )}

            {dispatchFeedback && (
              <div className="rounded-lg border border-cyan-500/40 bg-cyan-950/40 px-3 py-2 text-xs text-cyan-200">
                {dispatchFeedback}
              </div>
            )}

            {videoEnded && timeline.length > 0 && (
              <div className="rounded-xl border border-cyan-500/30 bg-[#080d1a] p-3 text-xs space-y-1">
                <p className="font-bold text-cyan-300">Resumo da Análise do Vídeo</p>
                <p className="text-slate-300">
                  Pico simultâneo na fila: <strong>{peakFila} pessoas</strong> · Espera máxima:{' '}
                  <strong>{formatarDuracao(maxEspera)}</strong> · Total rastreado:{' '}
                  <strong>{trackerStats.entradas} entradas</strong>.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
