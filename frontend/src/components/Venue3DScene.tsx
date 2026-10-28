import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { AutosservicoItem, InstagramavelItem } from '../types/venue';
import { Sun, Moon, Compass, ChevronDown, ChevronUp } from 'lucide-react';

interface Venue3DSceneProps {
  autos: AutosservicoItem[];
  instas: InstagramavelItem[];
  selectedId: string | null;
  onSelectAtracao: (id: string) => void;
}

const _currentLook = new THREE.Vector3(0, 0, 0);

export const Venue3DScene: React.FC<Venue3DSceneProps> = ({
  autos,
  instas,
  selectedId,
  onSelectAtracao,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [isNightMode, setIsNightMode] = useState(true);
  const [activePreset, setActivePreset] = useState<'geral' | 'autos' | 'instas' | 'aerea'>('geral');
  const [hudCollapsed, setHudCollapsed] = useState(false);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const targetCamPosRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 14, 18));
  const targetLookAtRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 1, 0));
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);
  const hemiLightRef = useRef<THREE.HemisphereLight | null>(null);
  const interactiveObjectsRef = useRef<Map<string, THREE.Group>>(new Map());

  const applyPreset = (preset: 'geral' | 'autos' | 'instas' | 'aerea') => {
    setActivePreset(preset);
    if (preset === 'geral') {
      targetCamPosRef.current.set(0, 15, 20);
      targetLookAtRef.current.set(0, 1, 0);
    } else if (preset === 'autos') {
      targetCamPosRef.current.set(-6, 7, 10);
      targetLookAtRef.current.set(-5, 1, 2);
    } else if (preset === 'instas') {
      targetCamPosRef.current.set(0, 6, 12);
      targetLookAtRef.current.set(0, 1.5, 4);
    } else if (preset === 'aerea') {
      targetCamPosRef.current.set(0, 26, 0.1);
      targetLookAtRef.current.set(0, 0, 0);
    }
  };

  const toggleLighting = () => {
    const nextNight = !isNightMode;
    setIsNightMode(nextNight);
    if (!sceneRef.current || !dirLightRef.current || !hemiLightRef.current) return;

    if (nextNight) {
      sceneRef.current.background = new THREE.Color(0x090d16);
      if (sceneRef.current.fog) (sceneRef.current.fog as THREE.Fog).color.set(0x090d16);
      dirLightRef.current.color.set(0x6366f1);
      dirLightRef.current.intensity = 1.2;
      hemiLightRef.current.color.set(0x818cf8);
      hemiLightRef.current.groundColor.set(0x0f172a);
      hemiLightRef.current.intensity = 0.6;
    } else {
      sceneRef.current.background = new THREE.Color(0xf1f5f9);
      if (sceneRef.current.fog) (sceneRef.current.fog as THREE.Fog).color.set(0xf1f5f9);
      dirLightRef.current.color.set(0xfffaed);
      dirLightRef.current.intensity = 2.4;
      hemiLightRef.current.color.set(0xbae6fd);
      hemiLightRef.current.groundColor.set(0xe2e8f0);
      hemiLightRef.current.intensity = 1.0;
    }
  };

  useEffect(() => {
    if (!selectedId) return;
    const auto = autos.find((a) => a.id === selectedId);
    const insta = instas.find((i) => i.id === selectedId);
    const pos = auto?.posicao3D || insta?.posicao3D;

    if (pos) {
      targetCamPosRef.current.set(pos[0], pos[1] + 4.5, pos[2] + 7);
      targetLookAtRef.current.set(pos[0], pos[1] + 1.2, pos[2]);
    }
  }, [selectedId, autos, instas]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090d16);
    scene.fog = new THREE.Fog(0x090d16, 15, 45);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 15, 20);
    camera.lookAt(0, 1, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const hemiLight = new THREE.HemisphereLight(0x818cf8, 0x0f172a, 0.7);
    scene.add(hemiLight);
    hemiLightRef.current = hemiLight;

    const dirLight = new THREE.DirectionalLight(0x6366f1, 1.4);
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
      color: 0x111827,
      roughness: 0.85,
      metalness: 0.15,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(36, 36, 0x312e81, 0x1e293b);
    grid.position.y = 0.01;
    scene.add(grid);

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

    const handlePointerDown = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const objects: THREE.Object3D[] = [];
      interactiveObjectsRef.current.forEach((grp) => objects.push(grp));
      const intersects = raycaster.intersectObjects(objects, true);

      if (intersects.length > 0) {
        let current: THREE.Object3D | null = intersects[0].object;
        while (current && current.parent && current.parent !== scene) {
          if (interactiveObjectsRef.current.has(current.name)) {
            onSelectAtracao(current.name);
            break;
          }
          current = current.parent;
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);

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
      camera.position.lerp(targetCamPosRef.current, dampFactor);
      _currentLook.lerp(targetLookAtRef.current, dampFactor);
      camera.lookAt(_currentLook);

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
      renderer.dispose();
      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="relative w-full h-[380px] sm:h-[460px] rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 shadow-lg">
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      <div className="absolute top-4 left-4 z-10 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-700 text-xs text-white">
        <Compass className="w-4 h-4 text-indigo-400" />
        <span className="font-semibold">Arena 3D Interativa</span>
        <span className="text-slate-400 hidden sm:inline">· Clique nas atrações para inspecionar</span>
      </div>

      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        <button
          onClick={toggleLighting}
          title={isNightMode ? 'Modo Diurno' : 'Modo Noturno'}
          className="p-2 rounded-lg bg-slate-900/80 border border-slate-700 text-slate-200 hover:text-white hover:bg-slate-800 transition-colors"
        >
          {isNightMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-300" />}
        </button>
      </div>

      <div className={`absolute bottom-3 left-1/2 -translate-x-1/2 z-10 transition-transform duration-300 max-w-[92vw] ${hudCollapsed ? 'translate-y-[calc(100%-24px)]' : 'translate-y-0'}`}>
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

          <div className="flex flex-wrap items-center gap-1 p-1.5 rounded-xl bg-slate-900 border border-slate-700 shadow-xl">
            <span className="text-[11px] text-slate-400 px-2 font-medium hidden sm:inline">Câmera:</span>
            
            <button
              onClick={() => applyPreset('geral')}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                activePreset === 'geral' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              Visão Geral
            </button>

            <button
              onClick={() => applyPreset('autos')}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                activePreset === 'autos' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              Totens Autosserviço
            </button>

            <button
              onClick={() => applyPreset('instas')}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                activePreset === 'instas' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              Cenários Instagramáveis
            </button>

            <button
              onClick={() => applyPreset('aerea')}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                activePreset === 'aerea' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'
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