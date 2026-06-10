import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { disposeObject } from './dispose';

const FLIGHT_RADIUS = 70;
const FLIGHT_DURATION = 900;
const START_TIME = 2;
const DISH_AXIS = new THREE.Vector3(0, 1, 0);

export interface VoyagerController {
  readonly guideLine: THREE.Line;
  readonly model: THREE.Object3D;
  readonly update: (
    elapsed: number,
    tracking: boolean,
    camera: THREE.Camera,
    controls: OrbitControls,
  ) => void;
  readonly dispose: () => void;
}

function createFlightPoints(): readonly [THREE.Vector3, THREE.Vector3] {
  const start = new THREE.Vector3();
  const theta1 = Math.random() * Math.PI * 2;
  const phi1 = (Math.random() - 0.5) * Math.PI; // Full sphere
  start.set(
    Math.cos(theta1) * Math.cos(phi1) * FLIGHT_RADIUS,
    Math.sin(phi1) * FLIGHT_RADIUS,
    Math.sin(theta1) * Math.cos(phi1) * FLIGHT_RADIUS
  );

  let end = new THREE.Vector3();
  while (true) {
    const theta2 = Math.random() * Math.PI * 2;
    const phi2 = (Math.random() - 0.5) * Math.PI;
    end.set(
      Math.cos(theta2) * Math.cos(phi2) * FLIGHT_RADIUS,
      Math.sin(phi2) * FLIGHT_RADIUS,
      Math.sin(theta2) * Math.cos(phi2) * FLIGHT_RADIUS
    );

    const lineDir = new THREE.Vector3().subVectors(end, start);
    const length = lineDir.length();
    if (length > 0) {
      const cross = new THREE.Vector3().crossVectors(start, end);
      const dist = cross.length() / length;
      if (dist > 10) {
        break;
      }
    }
  }

  return [start, end];
}

export function createVoyagerController(scene: THREE.Scene): VoyagerController {
  const root = new THREE.Group();
  const model = new THREE.Group();
  const [start, end] = createFlightPoints();
  const direction = new THREE.Vector3().subVectors(end, start).normalize();
  const cameraOffset = direction.clone().multiplyScalar(-15).add(new THREE.Vector3(0, 8, 0));
  const cameraTarget = new THREE.Vector3();
  let voyager: THREE.Object3D | null = null;
  let disposed = false;

  const guideLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      start.clone().addScaledVector(direction, -5000),
      start.clone().addScaledVector(direction, 5000),
    ]),
    new THREE.LineDashedMaterial({
      color: 0xffffff,
      dashSize: 1.5,
      gapSize: 16,
      transparent: true,
      opacity: 0.3,
    }),
  );
  guideLine.computeLineDistances();

  const upperLight = new THREE.PointLight(0xffffff, 648, 50);
  const lowerLight = new THREE.PointLight(0xffffff, 648, 50);
  const dishLight = new THREE.PointLight(0xffffff, 648, 50);
  upperLight.visible = false;
  lowerLight.visible = false;
  dishLight.visible = false;
  root.add(guideLine, upperLight, lowerLight, dishLight, model);
  scene.add(root);

  new GLTFLoader().load(
    '/models/Voyager.glb',
    (gltf) => {
      if (disposed) {
        disposeObject(gltf.scene);
        return;
      }
      voyager = gltf.scene;
      voyager.scale.setScalar(0.07);
      voyager.position.copy(start);
      voyager.quaternion.setFromUnitVectors(DISH_AXIS, direction.clone().negate());
      model.add(voyager);
    },
    undefined,
    (error) => {
      if (!disposed) {
        console.error('Error loading Voyager.glb:', error);
      }
    },
  );

  return {
    guideLine,
    model,
    update: (elapsed, tracking, camera, controls) => {
      if (!voyager) {
        return;
      }

      const progress = THREE.MathUtils.clamp((elapsed - START_TIME) / FLIGHT_DURATION, 0, 1);
      voyager.position.lerpVectors(start, end, progress);

      upperLight.position.copy(voyager.position);
      upperLight.position.y += 10;
      lowerLight.position.copy(voyager.position);
      lowerLight.position.y -= 10;
      dishLight.position.copy(voyager.position).addScaledVector(direction, -10);
      upperLight.visible = elapsed >= START_TIME;
      lowerLight.visible = elapsed >= START_TIME;
      dishLight.visible = elapsed >= START_TIME;

      if (tracking) {
        controls.target.lerp(voyager.position, 0.1);
        cameraTarget.copy(voyager.position).add(cameraOffset);
        camera.position.lerp(cameraTarget, 0.05);
      }
    },
    dispose: () => {
      disposed = true;
      scene.remove(root);
      disposeObject(root);
    },
  };
}
