import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { AutosservicoItem, InstagramavelItem } from '../types/venue';
import { ZONES_DATA, getHeatmapColor } from '../App';
import {
  Sun,
  Moon,
  Compass,
  ChevronDown,
  ChevronUp,
  Camera,
  X,
  Activity,
  Radio,
  Eye,
} from 'lucide-react';
import { HeatmapLegendControls } from './HeatmapLegendControls';

export type TipoCamera = 'entrada_perimetro' | 'fb_liquid';

export interface HardwareCamera {
  id: string;
  codigo: string;
  nome: string;
  tipo: TipoCamera;
  setor: string;
  posicao: [number, number, number];
  alvo: [number, number, number];
  status: 'operacional' | 'atencao' | 'critico';
  fps: number;
  metricas: {
    rotulo: string;
    valor: string;
    detalhe?: string;
  };
}

export const HARDWARE_CAMERAS: HardwareCamera[] = [
  {
    id: 'cam-ent-01',
    codigo: 'CAM-ENT-01',
    nome: 'Entrada Portão A (Perímetro Norte)',
    tipo: 'entrada_perimetro',
    setor: 'Acesso / Perímetro Norte',
    posicao: [-4, 4.2, 12],
    alvo: [-4, 0, 12],
    status: 'operacional',
    fps: 30,
    metricas: {
      rotulo: 'Fluxo Acesso',
      valor: '380 pess/h',
      detalhe: 'Tempo fila: 1.5 min',
    },
  },
  {
    id: 'cam-ent-02',
    codigo: 'CAM-ENT-02',
    nome: 'Entrada Catracas VIP',
    tipo: 'entrada_perimetro',
    setor: 'Acesso / VIP',
    posicao: [-1, 4.2, 12],
    alvo: [-1, 0, 12],
    status: 'operacional',
    fps: 30,
    metricas: {
      rotulo: 'Fluxo VIP',
      valor: '120 pess/h',
      detalhe: 'Tempo fila: 0.5 min',
    },
  },
  {
    id: 'cam-ent-03',
    codigo: 'CAM-ENT-03',
    nome: 'Entrada Pista Principal',
    tipo: 'entrada_perimetro',
    setor: 'Acesso / Geral',
    posicao: [1, 4.2, 12],
    alvo: [1, 0, 12],
    status: 'operacional',
    fps: 30,
    metricas: {
      rotulo: 'Fluxo Geral',
      valor: '490 pess/h',
      detalhe: 'Tempo fila: 2.8 min',
    },
  },
  {
    id: 'cam-ent-04',
    codigo: 'CAM-ENT-04',
    nome: 'Entrada Perímetro Leste',
    tipo: 'entrada_perimetro',
    setor: 'Acesso / Leste',
    posicao: [4, 4.2, 12],
    alvo: [4, 0, 12],
    status: 'operacional',
    fps: 30,
    metricas: {
      rotulo: 'Fluxo Leste',
      valor: '210 pess/h',
      detalhe: 'Tempo fila: 1.1 min',
    },
  },
  {
    id: 'cam-fb-01',
    codigo: 'CAM-FB-01',
    nome: 'F&B Chopp Hub 1 (IPA & Pilsen)',
    tipo: 'fb_liquid',
    setor: 'Liquid / F&B Oeste',
    posicao: [-5, 4.8, 2],
    alvo: [-5, 0.8, 2],
    status: 'operacional',
    fps: 60,
    metricas: {
      rotulo: 'Vazão de Chopp',
      valor: '6.4 L/min',
      detalhe: 'Nível barril: 94% · 3.2°C',
    },
  },
  {
    id: 'cam-fb-02',
    codigo: 'CAM-FB-02',
    nome: 'F&B Estação Central Liquid',
    tipo: 'fb_liquid',
    setor: 'Liquid / F&B Centro',
    posicao: [0, 5.0, -2],
    alvo: [0, 1.0, -2],
    status: 'operacional',
    fps: 60,
    metricas: {
      rotulo: 'Atendimentos F&B',
      valor: '4.8 atend/min',
      detalhe: 'Pressão Chopp: 2.2 bar',
    },
  },
  {
    id: 'cam-fb-03',
    codigo: 'CAM-FB-03',
    nome: 'F&B Chopp Hub 3 (Artesanais & Retirada)',
    tipo: 'fb_liquid',
    setor: 'Liquid / F&B Leste',
    posicao: [5, 4.8, 2],
    alvo: [5, 0.8, 2],
    status: 'operacional',
    fps: 60,
    metricas: {
      rotulo: 'Vazão de Chopp',
      valor: '5.1 L/min',
      detalhe: 'Nível barril: 88% · 2.9°C',
    },
  },
];

export interface Venue3DSceneProps {
  autos: AutosservicoItem[];
  instas: InstagramavelItem[];
  selectedId: string | null;
  onSelectAtracao: (id: string) => void;
  selectedCameraId?: string | null;
  onSelectCamera?: (camera: HardwareCamera | null) => void;
  heatmapIntensity?: number;
  onHeatmapIntensityChange?: (intensity: number) => void;
}

function createVenueHeatmapTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  if (!ctx) return new THREE.CanvasTexture(canvas);

  ctx.fillStyle = 'rgba(0, 0, 0, 0)';
  ctx.fillRect(0, 0, 512, 512);

  const toCanvas = (x: number, z: number): [number, number] => {
    const u = ((x + 18) / 36) * 512;
    const v = ((z + 18) / 36) * 512;
    return [u, v];
  };

  ZONES_DATA.forEach((zone) => {
    const [cx, cy] = toCanvas(zone.x, zone.z);
    const radius = 55 + (zone.occupancy / 100) * 45;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);

    if (zone.occupancy >= 85) {
      grad.addColorStop(0, 'rgba(239, 68, 68, 0.95)');
      grad.addColorStop(0.35, 'rgba(249, 115, 22, 0.7)');
      grad.addColorStop(0.75, 'rgba(239, 68, 68, 0.2)');
    } else if (zone.occupancy >= 50) {
      grad.addColorStop(0, 'rgba(245, 158, 11, 0.9)');
      grad.addColorStop(0.35, 'rgba(250, 204, 21, 0.65)');
      grad.addColorStop(0.75, 'rgba(245, 158, 11, 0.2)');
    } else {
      grad.addColorStop(0, 'rgba(16, 185, 129, 0.85)');
      grad.addColorStop(0.35, 'rgba(6, 182, 212, 0.6)');
      grad.addColorStop(0.75, 'rgba(16, 185, 129, 0.15)');
    }
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function createSoftZoneHeatmapTexture(colorHex: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  ctx.clearRect(0, 0, 256, 256);
  const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);

  const c = new THREE.Color(colorHex);
  const r = Math.round(c.r * 255);
  const g = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);

  grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.88)`);
  grad.addColorStop(0.35, `rgba(${r}, ${g}, ${b}, 0.6)`);
  grad.addColorStop(0.72, `rgba(${r}, ${g}, ${b}, 0.22)`);
  grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(128, 128, 128, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export const Venue3DScene: React.FC<Venue3DSceneProps> = ({
  autos,
  instas,
  selectedId,
  onSelectAtracao,
  selectedCameraId,
  onSelectCamera,
  heatmapIntensity: propHeatmapIntensity,
  onHeatmapIntensityChange,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);

  const [isNightMode, setIsNightMode] = useState(true);
  const [activePreset, setActivePreset] = useState<'geral' | 'autos' | 'instas' | 'aerea' | 'cams_fb' | 'cams_ent'>('geral');
  const [hudCollapsed, setHudCollapsed] = useState(false);

  const [selectedCamera, setSelectedCamera] = useState<HardwareCamera | null>(() => {
    if (selectedCameraId) {
      return HARDWARE_CAMERAS.find((c) => c.id === selectedCameraId) || null;
    }
    return null;
  });

  const [heatmapIntensity, setHeatmapIntensity] = useState<number>(
    propHeatmapIntensity !== undefined ? propHeatmapIntensity : 0.75
  );

  useEffect(() => {
    if (selectedCameraId !== undefined) {
      const found = HARDWARE_CAMERAS.find((c) => c.id === selectedCameraId) || null;
      setSelectedCamera(found);
    }
  }, [selectedCameraId]);

  useEffect(() => {
    if (propHeatmapIntensity !== undefined) {
      setHeatmapIntensity(propHeatmapIntensity);
    }
  }, [propHeatmapIntensity]);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  // Ajuste inicial: Posição mais recuada e elevada, com alvo em Z = 4.0 para centralizar mais acima
  const targetCamPosRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 18, 25));
  const targetLookAtRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 1.5, 4.0));
  const isInteractingRef = useRef<boolean>(false);

  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);
  const hemiLightRef = useRef<THREE.HemisphereLight | null>(null);
  const zoneMaterialsRef = useRef<THREE.MeshBasicMaterial[]>([]);
  const flowLinesMatRef = useRef<THREE.LineDashedMaterial[]>([]);
  const zoneSpritesRef = useRef<THREE.Sprite[]>([]);
  const interactiveObjectsRef = useRef<Map<string, THREE.Group>>(new Map());
  const cameraMeshesRef = useRef<Map<string, THREE.Group>>(new Map());
  const heatmapMatRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const heatmapMeshRef = useRef<THREE.Mesh | null>(null);

  const selectedCameraRef = useRef<HardwareCamera | null>(selectedCamera);
  selectedCameraRef.current = selectedCamera;

  const heatmapIntensityRef = useRef<number>(heatmapIntensity);
  heatmapIntensityRef.current = heatmapIntensity;

  const handleIntensityChange = (val: number) => {
    setHeatmapIntensity(val);
    heatmapIntensityRef.current = val;
    onHeatmapIntensityChange?.(val);
    if (heatmapMatRef.current) {
      heatmapMatRef.current.opacity = val;
      heatmapMatRef.current.visible = val > 0.01;
    }
    const ratio = Math.max(0, Math.min(1, val));
    zoneMaterialsRef.current.forEach((mat) => {
      mat.opacity = 0.8 * ratio;
      mat.visible = ratio > 0.01;
    });
    flowLinesMatRef.current.forEach((mat) => {
      mat.opacity = 0.85 * ratio;
      mat.visible = ratio > 0.01;
    });
    zoneSpritesRef.current.forEach((sprite) => {
      sprite.material.opacity = ratio > 0.05 ? 0.95 : 0;
      sprite.visible = ratio > 0.01;
    });
  };

  const handleSelectCamera = (cam: HardwareCamera | null) => {
    setSelectedCamera(cam);
    onSelectCamera?.(cam);

    if (cam) {
      targetCamPosRef.current.set(
        cam.posicao[0] * 0.75,
        cam.posicao[1] + 3.8,
        cam.posicao[2] + 6.2
      );
      targetLookAtRef.current.set(cam.alvo[0], cam.alvo[1] + 0.8, cam.alvo[2] + 1.2);
    }
  };

  const applyPreset = (preset: 'geral' | 'autos' | 'instas' | 'aerea' | 'cams_fb' | 'cams_ent') => {
    setActivePreset(preset);
    if (preset === 'geral') {
      targetCamPosRef.current.set(0, 18, 25);
      targetLookAtRef.current.set(0, 1.5, 4.0);
    } else if (preset === 'autos') {
      targetCamPosRef.current.set(-6, 9, 13);
      targetLookAtRef.current.set(-4, 1.5, 3.5);
    } else if (preset === 'instas') {
      targetCamPosRef.current.set(0, 7.5, 14);
      targetLookAtRef.current.set(0, 1.8, 4.5);
    } else if (preset === 'aerea') {
      targetCamPosRef.current.set(0, 30, 2.5);
      targetLookAtRef.current.set(0, 0, 2.5);
    } else if (preset === 'cams_fb') {
      targetCamPosRef.current.set(0, 12, 16);
      targetLookAtRef.current.set(0, 1.8, 2.5);
      const firstFb = HARDWARE_CAMERAS.find((c) => c.tipo === 'fb_liquid');
      if (firstFb) handleSelectCamera(firstFb);
    } else if (preset === 'cams_ent') {
      targetCamPosRef.current.set(0, 11, 23);
      targetLookAtRef.current.set(0, 2, 13.5);
      const firstEnt = HARDWARE_CAMERAS.find((c) => c.tipo === 'entrada_perimetro');
      if (firstEnt) handleSelectCamera(firstEnt);
    }
  };

  const toggleLighting = () => {
    const nextNight = !isNightMode;
    setIsNightMode(nextNight);
    if (!sceneRef.current || !dirLightRef.current || !hemiLightRef.current) return;

    if (ambientLightRef.current) {
      ambientLightRef.current.intensity = nextNight ? 0.3 : 0.8;
    }

    if (nextNight) {
      sceneRef.current.background = new THREE.Color(0x090d16);
      if (sceneRef.current.fog) (sceneRef.current.fog as THREE.Fog).color.set(0x090d16);
      dirLightRef.current.color.set(0x6366f1);
      dirLightRef.current.intensity = 0.6;
      hemiLightRef.current.color.set(0x4338ca);
      hemiLightRef.current.groundColor.set(0x090d16);
      hemiLightRef.current.intensity = 0.25;
    } else {
      sceneRef.current.background = new THREE.Color(0xf1f5f9);
      if (sceneRef.current.fog) (sceneRef.current.fog as THREE.Fog).color.set(0xf1f5f9);
      dirLightRef.current.color.set(0xfffaed);
      dirLightRef.current.intensity = 2.0;
      hemiLightRef.current.color.set(0xbae6fd);
      hemiLightRef.current.groundColor.set(0xe2e8f0);
      hemiLightRef.current.intensity = 0.8;
    }
  };

  useEffect(() => {
    if (!selectedId) return;
    const auto = autos.find((a) => a.id === selectedId);
    const insta = instas.find((i) => i.id === selectedId);
    const pos = auto?.posicao3D || insta?.posicao3D;

    if (pos) {
      targetCamPosRef.current.set(pos[0], pos[1] + 5.0, pos[2] + 8.0);
      targetLookAtRef.current.set(pos[0], pos[1] + 1.6, pos[2] + 1.0);
    }
  }, [selectedId, autos, instas]);

  useEffect(() => {
    cameraMeshesRef.current.forEach((group, id) => {
      const isSelected = selectedCamera?.id === id;
      const camData = HARDWARE_CAMERAS.find((c) => c.id === id);
      const isFB = camData?.tipo === 'fb_liquid';

      const bodyMesh = group.getObjectByName(`${id}-body`) as THREE.Mesh | undefined;
      const ringMesh = group.getObjectByName(`${id}-ring`) as THREE.Mesh | undefined;
      const fovCone = group.getObjectByName(`${id}-fov`) as THREE.Mesh | undefined;
      const targetRing = group.getObjectByName(`${id}-target-ring`) as THREE.Mesh | undefined;

      if (bodyMesh && bodyMesh.material) {
        const mat = bodyMesh.material as THREE.MeshStandardMaterial;
        if (isSelected) {
          mat.color.set(0x00ffcc);
          mat.emissive.set(0x00ffcc);
          mat.emissiveIntensity = 2.0;
        } else {
          const colorHex = isFB ? 0x34d399 : 0x38bdf8;
          const emissiveHex = isFB ? 0x059669 : 0x0284c7;
          mat.color.set(colorHex);
          mat.emissive.set(emissiveHex);
          mat.emissiveIntensity = isFB ? 0.9 : 0.75;
        }
      }

      if (ringMesh && ringMesh.material) {
        const rMat = ringMesh.material as THREE.MeshBasicMaterial;
        rMat.color.set(isSelected ? 0x00ffcc : isFB ? 0x34d399 : 0x38bdf8);
      }

      if (fovCone) fovCone.visible = isSelected;
      if (targetRing) targetRing.visible = isSelected;
    });
  }, [selectedCamera]);

  useEffect(() => {
    if (heatmapMatRef.current) {
      heatmapMatRef.current.opacity = heatmapIntensity;
      heatmapMatRef.current.visible = heatmapIntensity > 0.01;
    }
  }, [heatmapIntensity]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090d16);
    scene.fog = new THREE.Fog(0x090d16, 15, 55);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 18, 25);
    camera.lookAt(0, 1.5, 4.0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Configuração do OrbitControls com target ajustado para dar padding inferior
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.minDistance = 4;
    controls.maxDistance = 50;
    controls.target.set(0, 1.5, 4.0);
    controlsRef.current = controls;

    controls.addEventListener('start', () => {
      isInteractingRef.current = true;
    });
    controls.addEventListener('end', () => {
      isInteractingRef.current = false;
      targetCamPosRef.current.copy(camera.position);
      targetLookAtRef.current.copy(controls.target);
    });

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnvTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = roomEnvTexture;
    pmremGenerator.dispose();

    // 4. Luz Ambiente Controlada (<ambientLight intensity={0.3} />)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambientLight);
    ambientLightRef.current = ambientLight;

    const hemiLight = new THREE.HemisphereLight(0x4338ca, 0x090d16, 0.25);
    scene.add(hemiLight);
    hemiLightRef.current = hemiLight;

    const dirLight = new THREE.DirectionalLight(0x6366f1, 0.6);
    dirLight.position.set(10, 20, 12);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 50;
    dirLight.shadow.bias = -0.0005;
    dirLight.shadow.normalBias = 0.02;
    scene.add(dirLight);
    dirLightRef.current = dirLight;

    const groundGeo = new THREE.PlaneGeometry(40, 40, 32, 32);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x0b0f19,
      roughness: 0.9,
      metalness: 0.1,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(36, 36, 0x312e81, 0x1e293b);
    grid.position.y = 0.01;
    scene.add(grid);

    const heatmapTexture = createVenueHeatmapTexture();
    const heatmapGeo = new THREE.PlaneGeometry(36, 36, 16, 16);
    const heatmapMat = new THREE.MeshBasicMaterial({
      map: heatmapTexture,
      transparent: true,
      opacity: heatmapIntensityRef.current,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const heatmapMesh = new THREE.Mesh(heatmapGeo, heatmapMat);
    heatmapMesh.rotation.x = -Math.PI / 2;
    heatmapMesh.position.y = 0.025;
    scene.add(heatmapMesh);
    heatmapMeshRef.current = heatmapMesh;
    heatmapMatRef.current = heatmapMat;

    // 1. Projeção de Calor Suave no Chão com Discos Planos Translúcidos (meshBasicMaterial)
    // 3. Etiquetas Flutuantes das Zonas (ex: Z1: 16p - 86%)
    const zoneGroup = new THREE.Group();
    zoneGroup.name = 'heatmap-zones';
    const zoneMats: THREE.MeshBasicMaterial[] = [];
    const zoneSprites: THREE.Sprite[] = [];

    ZONES_DATA.forEach((zone) => {
      const colorHex = getHeatmapColor(zone.occupancy);
      const softTex = createSoftZoneHeatmapTexture(colorHex);

      // Disco plano translúcido no chão com meshBasicMaterial e depthWrite=false
      const diskRadius = 1.6 + (zone.occupancy / 100) * 0.45;
      const diskGeo = new THREE.PlaneGeometry(diskRadius * 2, diskRadius * 2);
      const diskMat = new THREE.MeshBasicMaterial({
        map: softTex,
        transparent: true,
        opacity: 0.8 * heatmapIntensityRef.current,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
      });
      zoneMats.push(diskMat);

      const diskMesh = new THREE.Mesh(diskGeo, diskMat);
      diskMesh.rotation.x = -Math.PI / 2;
      diskMesh.position.set(zone.x, 0.03, zone.z);
      zoneGroup.add(diskMesh);

      // Anel sutil de contorno elegante no chão
      const ringGeo = new THREE.RingGeometry(diskRadius * 0.72, diskRadius * 0.78, 36);
      const ringMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(colorHex),
        transparent: true,
        opacity: 0.45 * heatmapIntensityRef.current,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      zoneMats.push(ringMat);
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = -Math.PI / 2;
      ringMesh.position.set(zone.x, 0.032, zone.z);
      zoneGroup.add(ringMesh);

      // 3. Etiqueta Flutuante da Zona (ex: Z1: 16p - 86%) logo acima da mancha de calor
      const badgeCanvas = document.createElement('canvas');
      badgeCanvas.width = 360;
      badgeCanvas.height = 96;
      const bCtx = badgeCanvas.getContext('2d');
      if (bCtx) {
        // Fundo escuro com cantos arredondados
        bCtx.fillStyle = 'rgba(11, 15, 25, 0.95)';
        if (typeof bCtx.roundRect === 'function') {
          bCtx.roundRect(8, 8, 344, 80, 16);
        } else {
          bCtx.rect(8, 8, 344, 80);
        }
        bCtx.fill();

        // Borda na cor correspondente ao nível de concentração
        bCtx.lineWidth = 4;
        bCtx.strokeStyle = colorHex;
        bCtx.stroke();

        // Indicador circular da cor
        bCtx.fillStyle = colorHex;
        bCtx.beginPath();
        bCtx.arc(36, 48, 9, 0, Math.PI * 2);
        bCtx.fill();

        // Texto branco no formato ex: "Z1: 16p - 86%"
        bCtx.fillStyle = '#FFFFFF';
        bCtx.font = 'bold 32px "Segoe UI", system-ui, -apple-system, sans-serif';
        bCtx.textAlign = 'left';
        bCtx.textBaseline = 'middle';
        bCtx.fillText(`${zone.id}: ${zone.pessoas}p - ${zone.occupancy}%`, 58, 48);

        const badgeTex = new THREE.CanvasTexture(badgeCanvas);
        badgeTex.needsUpdate = true;
        const badgeMat = new THREE.SpriteMaterial({
          map: badgeTex,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
        });
        const sprite = new THREE.Sprite(badgeMat);
        sprite.position.set(zone.x, 0.95, zone.z);
        sprite.scale.set(1.45, 0.38, 1);
        zoneGroup.add(sprite);
        zoneSprites.push(sprite);

        // Haste vertical de conexão sutil do disco ao tag
        const stemPoints = [
          new THREE.Vector3(zone.x, 0.04, zone.z),
          new THREE.Vector3(zone.x, 0.75, zone.z),
        ];
        const stemGeo = new THREE.BufferGeometry().setFromPoints(stemPoints);
        const stemMat = new THREE.LineBasicMaterial({
          color: new THREE.Color(colorHex),
          transparent: true,
          opacity: 0.45,
          depthWrite: false,
        });
        const stem = new THREE.Line(stemGeo, stemMat);
        zoneGroup.add(stem);
      }
    });

    scene.add(zoneGroup);
    zoneMaterialsRef.current = zoneMats;
    zoneSpritesRef.current = zoneSprites;

    // 2. Conexões de Fluxo (Linhas Tracejadas Azul Claro) simulando a circulação entre pontos principais
    const flowGroup = new THREE.Group();
    flowGroup.name = 'circulation-flow';
    const flowMats: THREE.LineDashedMaterial[] = [];

    const circulationRoutes: { from: string; to: string; curveBend: number }[] = [
      { from: 'Z3', to: 'Z1', curveBend: 0.35 },
      { from: 'Z3', to: 'Z4', curveBend: -0.3 },
      { from: 'Z1', to: 'Z2', curveBend: 0.25 },
      { from: 'Z4', to: 'Z5', curveBend: -0.35 },
      { from: 'Z2', to: 'Z6', curveBend: 0.3 },
      { from: 'Z5', to: 'Z6', curveBend: -0.25 },
      { from: 'Z1', to: 'Z4', curveBend: 0.2 },
    ];

    circulationRoutes.forEach((route) => {
      const zFrom = ZONES_DATA.find((z) => z.id === route.from);
      const zTo = ZONES_DATA.find((z) => z.id === route.to);
      if (!zFrom || !zTo) return;

      const midX = (zFrom.x + zTo.x) / 2 - (zTo.z - zFrom.z) * 0.18 * route.curveBend;
      const midZ = (zFrom.z + zTo.z) / 2 + (zTo.x - zFrom.x) * 0.18 * route.curveBend;

      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(zFrom.x, 0.045, zFrom.z),
        new THREE.Vector3(midX, 0.045, midZ),
        new THREE.Vector3(zTo.x, 0.045, zTo.z)
      );

      const points = curve.getPoints(36);
      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
      const lineMat = new THREE.LineDashedMaterial({
        color: 0x38bdf8,
        dashSize: 0.35,
        gapSize: 0.2,
        transparent: true,
        opacity: 0.85 * heatmapIntensityRef.current,
        linewidth: 2,
        depthWrite: false,
      });
      flowMats.push(lineMat);
      const line = new THREE.Line(lineGeo, lineMat);
      line.computeLineDistances();
      flowGroup.add(line);
    });

    scene.add(flowGroup);
    flowLinesMatRef.current = flowMats;

    const stageGroup = new THREE.Group();
    stageGroup.position.set(0, 0, -13);
    const stageBase = new THREE.Mesh(
      new THREE.BoxGeometry(16, 1.2, 5),
      new THREE.MeshStandardMaterial({ color: 0x1e1b4b, roughness: 0.4, metalness: 0.7 })
    );
    stageBase.position.y = 0.6;
    stageBase.castShadow = true;
    stageBase.receiveShadow = true;
    stageGroup.add(stageBase);

    const ledScreen = new THREE.Mesh(
      new THREE.BoxGeometry(12, 4.5, 0.4),
      new THREE.MeshStandardMaterial({
        color: 0x4f46e5,
        emissive: 0x4338ca,
        emissiveIntensity: 0.8,
        roughness: 0.2,
      })
    );
    ledScreen.position.set(0, 3.5, -2);
    stageGroup.add(ledScreen);
    scene.add(stageGroup);

    const hardwareGroup = new THREE.Group();
    hardwareGroup.name = 'hardware-cameras';
    cameraMeshesRef.current.clear();

    HARDWARE_CAMERAS.forEach((cam) => {
      const camGroup = new THREE.Group();
      camGroup.name = cam.id;
      camGroup.userData = { isCamera: true, camera: cam };
      camGroup.position.set(cam.posicao[0], cam.posicao[1], cam.posicao[2]);

      const isFB = cam.tipo === 'fb_liquid';
      const isSelected = selectedCameraRef.current?.id === cam.id;
      const defaultColor = isSelected ? 0x00ffcc : isFB ? 0x34d399 : 0x38bdf8;
      const defaultEmissive = isSelected ? 0x00ffcc : isFB ? 0x059669 : 0x0284c7;

      const mountArm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8),
        new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.3 })
      );
      mountArm.position.y = 0.25;
      camGroup.add(mountArm);

      const bodyMat = new THREE.MeshStandardMaterial({
        color: defaultColor,
        emissive: defaultEmissive,
        emissiveIntensity: isSelected ? 2.0 : isFB ? 0.9 : 0.75,
        metalness: 0.4,
        roughness: 0.2,
      });
      const bodyMesh = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.55, 12), bodyMat);
      bodyMesh.rotation.x = Math.PI;
      bodyMesh.name = `${cam.id}-body`;
      camGroup.add(bodyMesh);

      const ringMat = new THREE.MeshBasicMaterial({
        color: defaultColor,
        transparent: true,
        opacity: 0.9,
      });
      const ringMesh = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.28, 16), ringMat);
      ringMesh.rotation.x = Math.PI / 2;
      ringMesh.position.y = -0.28;
      ringMesh.name = `${cam.id}-ring`;
      camGroup.add(ringMesh);

      const capMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 0.08, 12),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9 })
      );
      capMesh.position.y = 0.5;
      camGroup.add(capMesh);

      const targetDist = cam.posicao[1] - cam.alvo[1];
      const fovGeo = new THREE.ConeGeometry(1.6, targetDist, 16, 1, true);
      const fovMat = new THREE.MeshBasicMaterial({
        color: 0x00ffcc,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const fovCone = new THREE.Mesh(fovGeo, fovMat);
      fovCone.position.set(0, -targetDist / 2, 0);
      fovCone.visible = isSelected;
      fovCone.name = `${cam.id}-fov`;
      camGroup.add(fovCone);

      const targetRingGeo = new THREE.RingGeometry(0.9, 1.4, 24);
      const targetRingMat = new THREE.MeshBasicMaterial({
        color: 0x00ffcc,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const targetRing = new THREE.Mesh(targetRingGeo, targetRingMat);
      targetRing.rotation.x = -Math.PI / 2;
      targetRing.position.set(0, -targetDist + 0.04, 0);
      targetRing.visible = isSelected;
      targetRing.name = `${cam.id}-target-ring`;
      camGroup.add(targetRing);

      hardwareGroup.add(camGroup);
      cameraMeshesRef.current.set(cam.id, camGroup);
    });

    scene.add(hardwareGroup);

    interactiveObjectsRef.current.clear();

    const createAutosservicoModel = (auto: AutosservicoItem) => {
      const group = new THREE.Group();
      group.name = auto.id;
      group.position.set(auto.posicao3D[0], auto.posicao3D[1], auto.posicao3D[2]);

      const baseMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(1.0, 1.1, 0.15, 16),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7, metalness: 0.8 })
      );
      baseMesh.position.y = 0.075;
      baseMesh.castShadow = true;
      group.add(baseMesh);

      const bodyMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 2.2, 0.6),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3, metalness: 0.85 })
      );
      bodyMesh.position.y = 1.25;
      bodyMesh.castShadow = true;
      group.add(bodyMesh);

      const screenMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.55, 0.9),
        new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          emissive: 0x0284c7,
          emissiveIntensity: 0.9,
          roughness: 0.1,
        })
      );
      screenMesh.position.set(0, 1.45, 0.31);
      group.add(screenMesh);

      const tapMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.25, 8),
        new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.1 })
      );
      tapMesh.rotation.x = Math.PI / 3;
      tapMesh.position.set(0, 0.85, 0.35);
      group.add(tapMesh);

      const trayMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.08, 0.25),
        new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.9, roughness: 0.3 })
      );
      trayMesh.position.set(0, 0.65, 0.38);
      group.add(trayMesh);

      const statusColor = auto.status === 'operacional' ? 0x10b981 : auto.status === 'atencao' ? 0xf59e0b : 0xef4444;
      const beaconMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.08, 0.5),
        new THREE.MeshStandardMaterial({
          color: statusColor,
          emissive: statusColor,
          emissiveIntensity: 1.2,
        })
      );
      beaconMesh.position.y = 2.38;
      group.add(beaconMesh);

      const contactShadow = new THREE.Mesh(
        new THREE.CircleGeometry(1.2, 16),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 })
      );
      contactShadow.rotation.x = -Math.PI / 2;
      contactShadow.position.y = 0.015;
      group.add(contactShadow);

      return group;
    };

    const createInstagramavelModel = (insta: InstagramavelItem) => {
      const group = new THREE.Group();
      group.name = insta.id;
      group.position.set(insta.posicao3D[0], insta.posicao3D[1], insta.posicao3D[2]);

      const deckMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(1.8, 1.9, 0.2, 24),
        new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.4, metalness: 0.6 })
      );
      deckMesh.position.y = 0.1;
      deckMesh.castShadow = true;
      group.add(deckMesh);

      const hexColor = parseInt(insta.iluminacaoCenica.corPrincipal.replace('#', '0x'), 16) || 0xd946ef;
      const archMesh = new THREE.Mesh(
        new THREE.TorusGeometry(1.6, 0.1, 16, 32, Math.PI),
        new THREE.MeshStandardMaterial({
          color: hexColor,
          emissive: hexColor,
          emissiveIntensity: 1.5,
          roughness: 0.2,
        })
      );
      archMesh.position.set(0, 0.2, 0);
      group.add(archMesh);

      const secondArch = new THREE.Mesh(
        new THREE.TorusGeometry(1.4, 0.08, 16, 32, Math.PI),
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: hexColor,
          emissiveIntensity: 0.8,
          roughness: 0.1,
        })
      );
      secondArch.position.set(0, 0.2, -0.6);
      group.add(secondArch);

      const camPillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.15, 1.1, 12),
        new THREE.MeshStandardMaterial({ color: 0x3f3f46, metalness: 0.8, roughness: 0.2 })
      );
      camPillar.position.set(0, 0.55, 1.4);
      group.add(camPillar);

      const camHead = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.2, 0.2),
        new THREE.MeshStandardMaterial({
          color: 0x111827,
          emissive: 0xef4444,
          emissiveIntensity: 0.8,
        })
      );
      camHead.position.set(0, 1.15, 1.4);
      group.add(camHead);

      const brandSign = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.35, 0.05),
        new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.5 })
      );
      brandSign.position.set(0, 1.85, 0);
      group.add(brandSign);

      const contactShadow = new THREE.Mesh(
        new THREE.CircleGeometry(2.0, 24),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 })
      );
      contactShadow.rotation.x = -Math.PI / 2;
      contactShadow.position.y = 0.015;
      group.add(contactShadow);

      return group;
    };

    autos.forEach((a) => {
      const model = createAutosservicoModel(a);
      scene.add(model);
      interactiveObjectsRef.current.set(a.id, model);
    });

    instas.forEach((i) => {
      const model = createInstagramavelModel(i);
      scene.add(model);
      interactiveObjectsRef.current.set(i.id, model);
    });

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0 };

    const handlePointerDown = (event: MouseEvent) => {
      pointerDownPos = { x: event.clientX, y: event.clientY };
    };

    const handlePointerUp = (event: MouseEvent) => {
      // Ignora clique se o usuário estava rotacionando ou arrastando a cena com OrbitControls
      const dx = event.clientX - pointerDownPos.x;
      const dy = event.clientY - pointerDownPos.y;
      if (Math.hypot(dx, dy) > 5) return;

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);

      // 1. Câmeras de Hardware
      const cameraGroups: THREE.Object3D[] = [];
      cameraMeshesRef.current.forEach((grp) => cameraGroups.push(grp));
      const camIntersects = raycaster.intersectObjects(cameraGroups, true);

      if (camIntersects.length > 0) {
        let current: THREE.Object3D | null = camIntersects[0].object;
        while (current && current.parent && current.parent !== scene) {
          if (cameraMeshesRef.current.has(current.name)) {
            const camId = current.name;
            const cam = HARDWARE_CAMERAS.find((c) => c.id === camId) || null;
            handleSelectCamera(cam);
            return;
          }
          current = current.parent;
        }
      }

      // 2. Totens e Atrações
      const objects: THREE.Object3D[] = [];
      interactiveObjectsRef.current.forEach((grp) => objects.push(grp));
      const intersects = raycaster.intersectObjects(objects, true);

      if (intersects.length > 0) {
        let current: THREE.Object3D | null = intersects[0].object;
        while (current && current.parent && current.parent !== scene) {
          if (interactiveObjectsRef.current.has(current.name)) {
            onSelectAtracao(current.name);
            handleSelectCamera(null);
            return;
          }
          current = current.parent;
        }
      }
    };

    const handlePointerMove = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const allInteractives: THREE.Object3D[] = [];
      cameraMeshesRef.current.forEach((g) => allInteractives.push(g));
      interactiveObjectsRef.current.forEach((g) => allInteractives.push(g));

      const hits = raycaster.intersectObjects(allInteractives, true);
      renderer.domElement.style.cursor = hits.length > 0 ? 'pointer' : 'grab';
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);
    renderer.domElement.addEventListener('pointermove', handlePointerMove);

    const handleResize = () => {
      if (!container || !rendererRef.current || !cameraRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    let animationFrameId: number;
    let lastTime = performance.now();

    const animate = (currentTime: number) => {
      animationFrameId = requestAnimationFrame(animate);
      const dt = Math.min((currentTime - lastTime) / 1000, 0.1);
      lastTime = currentTime;

      const dampFactor = 1 - Math.exp(-4.5 * dt);

      // Quando o operador não está interagindo manualmente com OrbitControls,
      // a câmera e o target interpolam suavemente para as posições do preset ou elemento selecionado
      if (!isInteractingRef.current) {
        camera.position.lerp(targetCamPosRef.current, dampFactor);
        controls.target.lerp(targetLookAtRef.current, dampFactor);
      }
      controls.update();

      if (heatmapMatRef.current && heatmapMatRef.current.visible) {
        const pulse = 1 + Math.sin(currentTime * 0.003) * 0.04;
        heatmapMatRef.current.opacity = Math.min(1, heatmapIntensityRef.current * pulse);
      }

      // Pulso dinâmico das linhas tracejadas de circulação simulando fluxo contínuo
      const flowPulse = 0.75 + Math.sin(currentTime * 0.004) * 0.2;
      flowLinesMatRef.current.forEach((mat) => {
        if (mat.visible) {
          mat.opacity = Math.min(1, heatmapIntensityRef.current * flowPulse);
        }
      });

      if (selectedCameraRef.current) {
        const camGroup = cameraMeshesRef.current.get(selectedCameraRef.current.id);
        if (camGroup) {
          const targetRing = camGroup.getObjectByName(`${selectedCameraRef.current.id}-target-ring`);
          if (targetRing) {
            targetRing.rotation.z += 0.015;
          }
          const s = 1 + Math.sin(currentTime * 0.006) * 0.05;
          camGroup.scale.set(s, s, s);
        }
      }

      cameraMeshesRef.current.forEach((grp, id) => {
        if (id !== selectedCameraRef.current?.id) {
          grp.scale.set(1, 1, 1);
        }
      });

      interactiveObjectsRef.current.forEach((group, id) => {
        if (id === selectedId) {
          const s = 1 + Math.sin(currentTime * 0.005) * 0.04;
          group.scale.set(s, s, s);
        } else {
          group.scale.set(1, 1, 1);
        }
      });

      renderer.render(scene, camera);
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);

      controls.dispose();
      groundGeo.dispose();
      groundMat.dispose();
      heatmapGeo.dispose();
      heatmapMat.dispose();
      heatmapTexture.dispose();
      roomEnvTexture.dispose();
      ambientLight.dispose();
      dirLight.dispose();
      hemiLight.dispose();

      flowGroup.traverse((child) => {
        if (child instanceof THREE.Line) {
          child.geometry?.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach((m) => m.dispose());
            } else {
              child.material.dispose();
            }
          }
        }
      });
      scene.remove(flowGroup);

      zoneGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else if (child.material) {
            child.material.dispose();
          }
        } else if (child instanceof THREE.Sprite) {
          child.material?.map?.dispose();
          child.material?.dispose();
        } else if (child instanceof THREE.Line) {
          child.geometry?.dispose();
          if (child.material) (child.material as THREE.Material).dispose();
        }
      });
      scene.remove(zoneGroup);

      cameraMeshesRef.current.forEach((grp) => {
        grp.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry?.dispose();
            if (Array.isArray(child.material)) {
              child.material.forEach((m) => m.dispose());
            } else if (child.material) {
              child.material.dispose();
            }
          }
        });
      });

      interactiveObjectsRef.current.forEach((grp) => {
        grp.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry?.dispose();
            if (Array.isArray(child.material)) {
              child.material.forEach((m) => m.dispose());
            } else if (child.material) {
              child.material.dispose();
            }
          }
        });
      });

      renderer.dispose();
      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="relative w-full h-[480px] sm:h-[540px] md:h-[600px] rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 shadow-lg select-none flex flex-col pb-12 sm:pb-14">
      {/* Container da Canvas com flex-1 para respeitar o padding inferior de respiro */}
      <div ref={mountRef} className="w-full flex-1 cursor-grab active:cursor-grabbing" />

      <div className="absolute top-4 left-4 z-10 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/85 backdrop-blur-md border border-slate-700 text-xs text-white shadow-md">
        <Compass className="w-4 h-4 text-cyan-400 animate-spin-slow" />
        <span className="font-semibold text-slate-100">Arena 3D Interativa</span>
        <span className="text-slate-400 hidden sm:inline">· 7 Câmeras & F&B Liquid</span>
      </div>

      {/* Controles do Canto Superior Direito: Modo Noturno e Componente Flutuante de Concentração / Heatmap */}
      <div className="absolute top-4 right-4 z-20 flex flex-col items-end gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={toggleLighting}
            title={isNightMode ? 'Modo Diurno' : 'Modo Noturno'}
            className="p-2 rounded-xl bg-slate-900/85 hover:bg-slate-800 backdrop-blur-md border border-slate-700 text-slate-200 hover:text-white transition-colors shadow-md"
          >
            {isNightMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-300" />}
          </button>
        </div>

        <HeatmapLegendControls
          intensity={heatmapIntensity}
          onIntensityChange={handleIntensityChange}
          defaultExpanded={true}
        />
      </div>

      {selectedCamera && (
        <div className="absolute top-14 left-4 z-20 max-w-[280px] sm:max-w-[320px] p-3 rounded-xl bg-slate-900/95 backdrop-blur-md border border-cyan-500/40 shadow-2xl text-xs space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-400/30 flex items-center justify-center text-cyan-400">
                <Camera className="w-4 h-4 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-100">{selectedCamera.codigo}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800/50">
                    {selectedCamera.fps} FPS
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 truncate max-w-[190px]">{selectedCamera.nome}</p>
              </div>
            </div>
            <button
              onClick={() => handleSelectCamera(null)}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              title="Fechar Inspecionar Câmera"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/60">
              <span className="text-slate-400 block text-[10px]">Setor / Área</span>
              <span className="font-semibold text-slate-200 truncate block">{selectedCamera.setor}</span>
            </div>
            <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/60">
              <span className="text-slate-400 block text-[10px]">{selectedCamera.metricas.rotulo}</span>
              <span className="font-semibold text-cyan-300 block">{selectedCamera.metricas.valor}</span>
            </div>
          </div>

          {selectedCamera.metricas.detalhe && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-950/40 border border-emerald-800/30 text-[10px] text-emerald-300">
              <Activity className="w-3 h-3 shrink-0" />
              <span className="truncate">{selectedCamera.metricas.detalhe}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <span className="text-[10px] text-slate-400 flex items-center gap-1">
              <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
              Feed de Telemetria Ativo
            </span>
            <button
              onClick={() => handleSelectCamera(selectedCamera)}
              className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 transition-colors flex items-center gap-1 font-semibold"
            >
              <Eye className="w-3 h-3" />
              Focar
            </button>
          </div>
        </div>
      )}

      {/* Barra HUD Inferior centralizada com margem de respiro */}
      <div
        className={`absolute bottom-2 sm:bottom-3 left-1/2 -translate-x-1/2 z-10 transition-transform duration-300 max-w-[94vw] ${
          hudCollapsed ? 'translate-y-[calc(100%-24px)]' : 'translate-y-0'
        }`}
      >
        <div className="flex flex-col items-center">
          <button
            onClick={() => setHudCollapsed(!hudCollapsed)}
            className="px-3 py-1 rounded-t-lg bg-slate-900 border-t border-x border-slate-700 text-[11px] text-slate-300 hover:text-white flex items-center gap-1 shadow-md"
          >
            {hudCollapsed ? (
              <>
                <ChevronUp className="w-3 h-3" />
                <span>Exibir Controles 3D</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3" />
                <span>Ocultar</span>
              </>
            )}
          </button>

          <div className="flex flex-wrap items-center justify-center gap-1 p-1.5 rounded-xl bg-slate-900/95 backdrop-blur-md border border-slate-700 shadow-xl">
            <span className="text-[11px] text-slate-400 px-1.5 font-medium hidden sm:inline">Perspectiva:</span>

            <button
              onClick={() => applyPreset('geral')}
              className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                activePreset === 'geral' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              Visão Geral
            </button>

            <button
              onClick={() => applyPreset('cams_fb')}
              className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                activePreset === 'cams_fb'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-emerald-300 bg-emerald-950/40 border border-emerald-800/40 hover:bg-emerald-900/50'
              }`}
            >
              <Camera className="w-3 h-3" />
              <span>Câmeras F&B (3)</span>
            </button>

            <button
              onClick={() => applyPreset('cams_ent')}
              className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                activePreset === 'cams_ent'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-sky-300 bg-sky-950/40 border border-sky-800/40 hover:bg-sky-900/50'
              }`}
            >
              <Camera className="w-3 h-3" />
              <span>Entrada (4)</span>
            </button>

            <button
              onClick={() => applyPreset('instas')}
              className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                activePreset === 'instas' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              Instagramáveis
            </button>

            <button
              onClick={() => applyPreset('aerea')}
              className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                activePreset === 'aerea' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              Vista Aérea
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};