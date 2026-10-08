import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { TrainerAnimation } from '../shared/workout/state.js';

export type TrainerView = { element: HTMLElement; update: (animation: TrainerAnimation, paused: boolean) => void; dispose: () => void };
export function createTrainer(animation: TrainerAnimation): TrainerView {
  const element = document.createElement('div'); element.className = 'trainer-view';
  element.setAttribute('role', 'img'); element.setAttribute('aria-label', 'AiRA, your animated training companion');
  const fallback = document.createElement('div'); fallback.className = 'trainer-fallback'; fallback.textContent = '◉';
  element.append(fallback);
  let desired = animation, paused = false, disposed = false, frame = 0, mixer: THREE.AnimationMixer | undefined;
  let renderer: THREE.WebGLRenderer | undefined, model: THREE.Group | undefined, active: THREE.AnimationAction | undefined;
  const actions = new Map<string, THREE.AnimationAction>();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 30); camera.position.set(3.4, 2.3, 6.7); camera.lookAt(0, 1.25, 0);
  scene.add(new THREE.HemisphereLight(0xf5fff0, 0x455a4e, 2.5));
  const key = new THREE.DirectionalLight(0xfff8e6, 4); key.position.set(-3, 8, 4); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -3; key.shadow.camera.right = 3;
  key.shadow.camera.top = 4; key.shadow.camera.bottom = -2; key.shadow.bias = -0.001; key.shadow.normalBias = 0.04;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xb6dcc4, 3); rim.position.set(3, 3, -2); scene.add(rim);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: 0.055 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.015; floor.receiveShadow = true; scene.add(floor);
  const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = 128; shadowCanvas.height = 128;
  const shadowContext = shadowCanvas.getContext('2d');
  if (shadowContext) {
    const gradient = shadowContext.createRadialGradient(64, 64, 5, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(35, 62, 40, 0.23)'); gradient.addColorStop(1, 'rgba(35, 62, 40, 0)');
    shadowContext.fillStyle = gradient; shadowContext.fillRect(0, 0, 128, 128);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.7), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = -0.005; scene.add(shadow);
  }
  const setAction = () => {
    const next = actions.get(desired); if (!next || next === active) return;
    next.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();
    if (active) next.crossFadeFrom(active, reduced.matches ? 0 : 0.4, false);
    active = next; element.dataset.animation = desired;
    if (reduced.matches) mixer?.update(0.25);
  };
  const resize = () => {
    if (!renderer || disposed) return;
    const width = element.clientWidth, height = element.clientHeight;
    if (!width || !height) return;
    camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height, false);
  };
  const observer = new ResizeObserver(resize); observer.observe(element);
  let previous = performance.now();
  const draw = (now: number) => {
    if (disposed) return;
    const delta = Math.min((now - previous) / 1000, 0.05); previous = now;
    if (element.isConnected && element.clientHeight && !document.hidden) {
      if (!paused && !reduced.matches) mixer?.update(delta);
      renderer?.render(scene, camera);
    }
    frame = requestAnimationFrame(draw);
  };
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
    element.append(renderer.domElement); resize();
    new GLTFLoader().load('/web/assets/aira-trainer.glb', gltf => {
      if (disposed) { gltf.scene.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose(); } }); return; }
      model = gltf.scene; model.traverse(object => { if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; } });
      scene.add(model); mixer = new THREE.AnimationMixer(model);
      for (const clip of gltf.animations) actions.set(clip.name, mixer.clipAction(clip));
      setAction(); fallback.hidden = true; element.dataset.loaded = 'true';
    }, undefined, () => { element.dataset.loaded = 'fallback'; fallback.textContent = 'AiRA'; });
    frame = requestAnimationFrame(draw);
  } catch { element.dataset.loaded = 'fallback'; fallback.textContent = 'AiRA'; }
  return { element, update: (next, stopped) => { desired = next; paused = stopped; element.dataset.paused = String(stopped); setAction(); },
    dispose: () => {
      if (disposed) return; disposed = true; cancelAnimationFrame(frame); observer.disconnect();
      mixer?.stopAllAction(); if (model) mixer?.uncacheRoot(model);
      scene.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); for (const material of Array.isArray(object.material) ? object.material : [object.material]) { if ('map' in material) (material.map as THREE.Texture | null)?.dispose(); material.dispose(); } } });
      renderer?.dispose(); renderer?.forceContextLoss();
    } };
}
