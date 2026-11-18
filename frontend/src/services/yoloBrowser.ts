import * as ort from 'onnxruntime-web';
import type { CoordinatePoint } from '../types/ops';

export interface Point2D {
  x: number; // normalizado 0..1
  y: number; // normalizado 0..1
}

export type ZonaClassificacao = 'fila' | 'estande' | 'fora';

export interface PersonDetection {
  trackId: number;
  x1: number; // normalizado 0..1
  y1: number;
  x2: number;
  y2: number;
  footX: number;
  footY: number;
  confidence: number;
  zona: ZonaClassificacao;
}

export interface TrackerStats {
  entradas: number;
  saidas: number;
  permanenciaMediaSeg: number;
  ativos: number;
}

const INPUT_SIZE = 640;
const MODEL_URL = '/models/yolov8n.onnx';
const NUM_ANCHORS = 8400;

export const DEFAULT_ZONA_ESTANDE: Point2D[] = [
  { x: 30 / 640, y: 80 / 360 },
  { x: 320 / 640, y: 80 / 360 },
  { x: 320 / 640, y: 340 / 360 },
  { x: 30 / 640, y: 340 / 360 },
];

export const DEFAULT_ZONA_FILA: Point2D[] = [
  { x: 330 / 640, y: 150 / 360 },
  { x: 620 / 640, y: 150 / 360 },
  { x: 620 / 640, y: 350 / 360 },
  { x: 330 / 640, y: 350 / 360 },
];

let sessionPromise: Promise<ort.InferenceSession> | null = null;
let activeBackend: 'webgpu' | 'wasm' = 'wasm';
let preprocessCanvas: HTMLCanvasElement | null = null;

function getPreprocessCanvas(): HTMLCanvasElement {
  if (!preprocessCanvas) {
    preprocessCanvas = document.createElement('canvas');
    preprocessCanvas.width = INPUT_SIZE;
    preprocessCanvas.height = INPUT_SIZE;
  }
  return preprocessCanvas;
}

export function getYoloBackend(): 'webgpu' | 'wasm' {
  return activeBackend;
}

export async function loadYoloModel(): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      ort.env.wasm.wasmPaths = '/ort/';
      ort.env.wasm.numThreads = 1;

      const hasWebGpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
      if (hasWebGpu) {
        try {
          const session = await ort.InferenceSession.create(MODEL_URL, {
            executionProviders: ['webgpu', 'wasm'],
          });
          activeBackend = 'webgpu';
          return session;
        } catch {
          // Fallback para WASM caso WebGPU falhe no dispositivo
        }
      }

      activeBackend = 'wasm';
      return ort.InferenceSession.create(MODEL_URL, {
        executionProviders: ['wasm'],
      });
    })().catch((err) => {
      sessionPromise = null;
      throw err;
    });
  }
  return sessionPromise;
}

export function pointInPolygon(pt: Point2D, poly: Point2D[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;

    const intersect =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function toApiCoordinate(pt: Point2D): CoordinatePoint {
  return {
    x: Number(Math.min(1000, Math.max(0, pt.x * 1000)).toFixed(1)),
    y: Number(Math.min(1000, Math.max(0, pt.y * 1000)).toFixed(1)),
  };
}

interface RawBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  confidence: number;
}

function iou(a: RawBox, b: RawBox): number {
  const ix1 = Math.max(a.x1, b.x1);
  const iy1 = Math.max(a.y1, b.y1);
  const ix2 = Math.min(a.x2, b.x2);
  const iy2 = Math.min(a.y2, b.y2);
  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  if (inter === 0) return 0;
  const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
  const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
  return inter / (areaA + areaB - inter + 1e-9);
}

function nms(boxes: RawBox[], iouThreshold: number): RawBox[] {
  const sorted = [...boxes].sort((a, b) => b.confidence - a.confidence);
  const kept: RawBox[] = [];
  for (const candidate of sorted) {
    if (kept.every((k) => iou(k, candidate) < iouThreshold)) {
      kept.push(candidate);
    }
  }
  return kept;
}

export async function detectPeopleInFrame(
  source: HTMLVideoElement | HTMLCanvasElement,
  confThreshold = 0.35,
  iouThreshold = 0.45,
): Promise<Omit<PersonDetection, 'trackId' | 'zona'>[]> {
  const srcW = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
  const srcH = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
  if (srcW === 0 || srcH === 0) return [];

  const session = await loadYoloModel();
  const canvas = getPreprocessCanvas();
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];

  // Letterbox preservando proporção
  const scale = Math.min(INPUT_SIZE / srcW, INPUT_SIZE / srcH);
  const newW = Math.round(srcW * scale);
  const newH = Math.round(srcH * scale);
  const padX = Math.floor((INPUT_SIZE - newW) / 2);
  const padY = Math.floor((INPUT_SIZE - newH) / 2);

  ctx.fillStyle = '#727272';
  ctx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
  ctx.drawImage(source, 0, 0, srcW, srcH, padX, padY, newW, newH);

  const imageData = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE).data;
  const area = INPUT_SIZE * INPUT_SIZE;
  const floatData = new Float32Array(3 * area);

  for (let i = 0; i < area; i++) {
    const p = i * 4;
    floatData[i] = imageData[p] / 255.0;
    floatData[area + i] = imageData[p + 1] / 255.0;
    floatData[2 * area + i] = imageData[p + 2] / 255.0;
  }

  const inputName = session.inputNames[0] ?? 'images';
  const outputName = session.outputNames[0] ?? 'output0';
  const tensor = new ort.Tensor('float32', floatData, [1, 3, INPUT_SIZE, INPUT_SIZE]);
  const results = await session.run({ [inputName]: tensor });
  const output = results[outputName];
  if (!output) return [];

  const data = output.data as Float32Array;
  const rawBoxes: RawBox[] = [];

  for (let i = 0; i < NUM_ANCHORS; i++) {
    // Classe 0 (person) está na linha 4 do tensor [1, 84, 8400]
    const conf = data[4 * NUM_ANCHORS + i];
    if (conf < confThreshold) continue;

    const cx = data[i];
    const cy = data[NUM_ANCHORS + i];
    const w = data[2 * NUM_ANCHORS + i];
    const h = data[3 * NUM_ANCHORS + i];

    const x1 = Math.min(1, Math.max(0, (cx - w / 2 - padX) / (scale * srcW)));
    const y1 = Math.min(1, Math.max(0, (cy - h / 2 - padY) / (scale * srcH)));
    const x2 = Math.min(1, Math.max(0, (cx + w / 2 - padX) / (scale * srcW)));
    const y2 = Math.min(1, Math.max(0, (cy + h / 2 - padY) / (scale * srcH)));

    if (x2 > x1 && y2 > y1) {
      rawBoxes.push({ x1, y1, x2, y2, confidence: conf });
    }
  }

  return nms(rawBoxes, iouThreshold).map((b) => ({
    ...b,
    footX: (b.x1 + b.x2) / 2,
    footY: b.y2,
  }));
}

interface TrackedPerson {
  id: number;
  footX: number;
  footY: number;
  firstSeenMs: number;
  lastSeenMs: number;
  missedFrames: number;
}

/** Rastreador leve por centroide dos pés para estimar entradas, saídas e permanência média. */
export class SimplePersonTracker {
  private nextId = 1;
  private tracks: TrackedPerson[] = [];
  private entradas = 0;
  private saidas = 0;
  private completedDurationsSec: number[] = [];

  reset(): void {
    this.nextId = 1;
    this.tracks = [];
    this.entradas = 0;
    this.saidas = 0;
    this.completedDurationsSec = [];
  }

  update(
    detections: Omit<PersonDetection, 'trackId' | 'zona'>[],
    nowMs: number,
    zonaFila: Point2D[],
    zonaEstande: Point2D[],
  ): { detections: PersonDetection[]; stats: TrackerStats } {
    const MAX_DIST = 0.09;
    const MAX_MISSED = 6;
    const usedTracks = new Set<number>();
    const output: PersonDetection[] = [];

    for (const det of detections) {
      let bestTrack: TrackedPerson | null = null;
      let bestDist = MAX_DIST;

      for (const t of this.tracks) {
        if (usedTracks.has(t.id)) continue;
        const dist = Math.hypot(det.footX - t.footX, det.footY - t.footY);
        if (dist < bestDist) {
          bestDist = dist;
          bestTrack = t;
        }
      }

      let trackId: number;
      if (bestTrack) {
        bestTrack.footX = det.footX;
        bestTrack.footY = det.footY;
        bestTrack.lastSeenMs = nowMs;
        bestTrack.missedFrames = 0;
        usedTracks.add(bestTrack.id);
        trackId = bestTrack.id;
      } else {
        trackId = this.nextId++;
        this.entradas += 1;
        this.tracks.push({
          id: trackId,
          footX: det.footX,
          footY: det.footY,
          firstSeenMs: nowMs,
          lastSeenMs: nowMs,
          missedFrames: 0,
        });
        usedTracks.add(trackId);
      }

      const pt = { x: det.footX, y: det.footY };
      const zona: ZonaClassificacao = pointInPolygon(pt, zonaFila)
        ? 'fila'
        : pointInPolygon(pt, zonaEstande)
          ? 'estande'
          : 'fora';

      output.push({ ...det, trackId, zona });
    }

    const remaining: TrackedPerson[] = [];
    for (const t of this.tracks) {
      if (!usedTracks.has(t.id)) {
        t.missedFrames += 1;
        if (t.missedFrames > MAX_MISSED) {
          this.saidas += 1;
          this.completedDurationsSec.push(Math.max(0.5, (t.lastSeenMs - t.firstSeenMs) / 1000));
          continue;
        }
      }
      remaining.push(t);
    }
    this.tracks = remaining;

    const activeDurations = this.tracks.map((t) => Math.max(0, (nowMs - t.firstSeenMs) / 1000));
    const allDurations = [...this.completedDurationsSec, ...activeDurations];
    const permanenciaMediaSeg =
      allDurations.length > 0
        ? allDurations.reduce((acc, v) => acc + v, 0) / allDurations.length
        : 0;

    return {
      detections: output,
      stats: {
        entradas: this.entradas,
        saidas: this.saidas,
        permanenciaMediaSeg,
        ativos: this.tracks.length,
      },
    };
  }
}
