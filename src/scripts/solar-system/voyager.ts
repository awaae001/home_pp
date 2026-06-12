import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { disposeObject } from './dispose';
import {
  createFlybyTrajectory,
  createGuidePoints,
  sampleTrajectory,
} from './voyagerTrajectory';

const FLIGHT_DURATION = 900;
const START_TIME = 2;
const DISH_AXIS = new THREE.Vector3(0, 1, 0);
const VOYAGER_MODEL_URL = '/models/Voyager.glb';

let voyagerTemplate: Promise<THREE.Object3D> | undefined;

function loadVoyagerTemplate(): Promise<THREE.Object3D> {
  voyagerTemplate ??= new GLTFLoader()
    .loadAsync(VOYAGER_MODEL_URL)
    .then(({ scene }) => scene)
    .catch((error: unknown) => {
      voyagerTemplate = undefined;
      throw error;
    });

  return voyagerTemplate;
}

export interface VoyagerController {
  readonly guideLine: THREE.Line;
  readonly model: THREE.Object3D;
  readonly ready: Promise<void>;
  readonly update: (
    elapsed: number,
    tracking: boolean,
    camera: THREE.Camera,
    controls: OrbitControls,
  ) => void;
  readonly dispose: () => void;
}

export function createVoyagerController(scene: THREE.Scene): VoyagerController {
  const root = new THREE.Group();
  const model = new THREE.Group();
  const flyby = createFlybyTrajectory();
  const start = flyby.points[0];
  const initialDirection = flyby.directions[0];
  const cameraOffset = new THREE.Vector3();
  const cameraTarget = new THREE.Vector3();
  const sunDirection = new THREE.Vector3();
  const flightDirection = new THREE.Vector3();
  let voyager: THREE.Object3D | null = null;
  let disposed = false;

  const guideLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(createGuidePoints(flyby)),
    new THREE.LineDashedMaterial({
      color: 0xffffff,
      dashSize: 1.5,
      gapSize: 16,
      transparent: true,
      opacity: 0.3,
    }),
  );
  guideLine.computeLineDistances();

  const mainLight = new THREE.PointLight(0xffffff, 200, 30, 2);
  mainLight.visible = false;

  root.add(guideLine, mainLight, model);
  scene.add(root);

  const ready = loadVoyagerTemplate()
    .then((template) => {
      const loadedVoyager = template.clone(true);
      if (disposed) {
        return;
      }
      voyager = loadedVoyager;
      voyager.scale.setScalar(0.07);
      voyager.position.copy(start);
      voyager.quaternion.setFromUnitVectors(
        DISH_AXIS,
        initialDirection.clone().negate(),
      );
      model.add(voyager);
    })
    .catch((error: unknown) => {
      if (!disposed) {
        console.error('[Solar] 模型下载失败:', error);
      }
      throw error;
    });

  return {
    guideLine,
    model,
    ready,
    update: (elapsed, tracking, camera, controls) => {
      if (!voyager) {
        return;
      }

      const progress = THREE.MathUtils.clamp((elapsed - START_TIME) / FLIGHT_DURATION, 0, 1);
      sampleTrajectory(flyby, progress, voyager.position, flightDirection);

      sunDirection.copy(voyager.position).negate().normalize();
      mainLight.position.copy(voyager.position).addScaledVector(sunDirection, 5);
      mainLight.visible = elapsed >= START_TIME;

      const distanceToSun = voyager.position.length();
      const sigma = 15;
      mainLight.intensity = 55 * Math.exp(
        -(distanceToSun * distanceToSun) / (2 * sigma * sigma),
      ) + 5;

      if (tracking) {
        controls.target.lerp(voyager.position, 0.1);
        cameraOffset.copy(flightDirection).multiplyScalar(-2.5);
        cameraOffset.y += 2;
        cameraTarget.copy(voyager.position).add(cameraOffset);
        camera.position.lerp(cameraTarget, 0.05);
      }
    },
    dispose: () => {
      disposed = true;
      if (voyager) {
        model.remove(voyager);
        voyager = null;
      }
      scene.remove(root);
      disposeObject(root);
    },
  };
}
