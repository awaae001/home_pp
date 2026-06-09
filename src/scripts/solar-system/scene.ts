import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const DESKTOP_BREAKPOINT = 768;
const DEFAULT_POSITION = new THREE.Vector3(-8, 6, 19);
const DESKTOP_TARGET = new THREE.Vector3(-11, 3, 1);
const CENTER_TARGET = new THREE.Vector3(0, 0, 0);

export interface SceneContext {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  readonly defaultPosition: THREE.Vector3;
  readonly defaultTarget: () => THREE.Vector3;
  readonly resize: () => void;
  readonly dispose: () => void;
}

/// Creates the core Three.js scene bound to the supplied canvas.
export function createSceneContext(canvas: HTMLCanvasElement): SceneContext {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  const controls = new OrbitControls(camera, canvas);

  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 5;
  controls.maxDistance = 40;
  controls.maxPolarAngle = Math.PI / 2 + 0.5;

  const defaultTarget = (): THREE.Vector3 => (
    window.innerWidth >= DESKTOP_BREAKPOINT ? DESKTOP_TARGET : CENTER_TARGET
  );

  camera.position.copy(DEFAULT_POSITION);
  controls.target.copy(defaultTarget());
  camera.lookAt(controls.target);
  controls.update();

  const resize = (): void => {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height, false);
  };

  resize();

  return {
    scene,
    camera,
    renderer,
    controls,
    defaultPosition: DEFAULT_POSITION.clone(),
    defaultTarget,
    resize,
    dispose: () => {
      controls.dispose();
      renderer.dispose();
    },
  };
}
