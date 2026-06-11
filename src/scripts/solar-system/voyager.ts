import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { disposeObject } from './dispose';

const FLIGHT_RADIUS = 70;
const FLIGHT_DURATION = 900;
const START_TIME = 2;
const TRAJECTORY_SAMPLES = 512;
const GUIDE_EXTENSION = 5000;
const IMPACT_PARAMETER_RATIO = 0.2;
const ORBIT_CLEARANCE = 8;
const DEFLECTION_ANGLE = THREE.MathUtils.degToRad(28);
const ENTRY_ELEVATION = THREE.MathUtils.degToRad(24);
const DISH_AXIS = new THREE.Vector3(0, 1, 0);
const GALACTIC_NORTH = new THREE.Vector3(0, 1, 0);

interface MotionState {
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
}

interface Flyby {
  readonly points: THREE.Vector3[];
  readonly directions: THREE.Vector3[];
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

function gravitationalParameter(
  impactParameter: number,
  asymptoticSpeed: number,
  deflectionAngle: number,
): number {
  return impactParameter
    * asymptoticSpeed
    * asymptoticSpeed
    * Math.tan(deflectionAngle / 2);
}

function accelerationAt(position: THREE.Vector3, mu: number): THREE.Vector3 {
  const radiusSquared = position.lengthSq();
  return position.clone().multiplyScalar(-mu / Math.pow(radiusSquared, 1.5));
}

function integrateStep(state: MotionState, delta: number, mu: number): MotionState {
  const halfDelta = delta / 2;
  const acceleration1 = accelerationAt(state.position, mu);
  const velocity2 = state.velocity.clone().addScaledVector(acceleration1, halfDelta);
  const position2 = state.position.clone().addScaledVector(state.velocity, halfDelta);
  const acceleration2 = accelerationAt(position2, mu);
  const velocity3 = state.velocity.clone().addScaledVector(acceleration2, halfDelta);
  const position3 = state.position.clone().addScaledVector(velocity2, halfDelta);
  const acceleration3 = accelerationAt(position3, mu);
  const velocity4 = state.velocity.clone().addScaledVector(acceleration3, delta);
  const position4 = state.position.clone().addScaledVector(velocity3, delta);
  const acceleration4 = accelerationAt(position4, mu);

  return {
    position: state.position.clone()
      .addScaledVector(state.velocity, delta / 6)
      .addScaledVector(velocity2, delta / 3)
      .addScaledVector(velocity3, delta / 3)
      .addScaledVector(velocity4, delta / 6),
    velocity: state.velocity.clone()
      .addScaledVector(acceleration1, delta / 6)
      .addScaledVector(acceleration2, delta / 3)
      .addScaledVector(acceleration3, delta / 3)
      .addScaledVector(acceleration4, delta / 6),
  };
}

function createFlyby(): Flyby {
  // This two-body simulation is a visual approximation; scaled units,
  // finite-step integration, and omitted bodies introduce physical error.
  const azimuth = Math.random() * Math.PI * 2;
  const incomingDirection = new THREE.Vector3(
    Math.cos(azimuth) * Math.cos(ENTRY_ELEVATION),
    -Math.sin(ENTRY_ELEVATION),
    Math.sin(azimuth) * Math.cos(ENTRY_ELEVATION),
  ).normalize();
  const offsetDirection = new THREE.Vector3()
    .crossVectors(GALACTIC_NORTH, incomingDirection)
    .normalize()
    .multiplyScalar(Math.random() < 0.5 ? -1 : 1);
  const impactParameter = FLIGHT_RADIUS * IMPACT_PARAMETER_RATIO + ORBIT_CLEARANCE;
  const asymptoticSpeed = FLIGHT_RADIUS * 2;
  const mu = gravitationalParameter(
    impactParameter,
    asymptoticSpeed,
    DEFLECTION_ANGLE,
  );
  const delta = 1 / TRAJECTORY_SAMPLES;
  const points: THREE.Vector3[] = [];
  const directions: THREE.Vector3[] = [];
  let state: MotionState = {
    position: incomingDirection.clone()
      .multiplyScalar(-FLIGHT_RADIUS)
      .addScaledVector(offsetDirection, impactParameter),
    velocity: incomingDirection.clone().multiplyScalar(asymptoticSpeed),
  };

  points.push(state.position.clone());
  directions.push(state.velocity.clone().normalize());
  for (let index = 0; index < TRAJECTORY_SAMPLES; index += 1) {
    state = integrateStep(state, delta, mu);
    points.push(state.position.clone());
    directions.push(state.velocity.clone().normalize());
  }

  return { points, directions };
}

function createGuidePoints(flyby: Flyby): THREE.Vector3[] {
  const start = flyby.points[0];
  const end = flyby.points[flyby.points.length - 1];
  const incomingDirection = flyby.directions[0];
  const outgoingDirection = flyby.directions[flyby.directions.length - 1];

  return [
    start.clone().addScaledVector(incomingDirection, -GUIDE_EXTENSION),
    ...flyby.points,
    end.clone().addScaledVector(outgoingDirection, GUIDE_EXTENSION),
  ];
}

function sampleFlyby(
  flyby: Flyby,
  progress: number,
  position: THREE.Vector3,
  direction: THREE.Vector3,
): void {
  const sample = progress * (flyby.points.length - 1);
  const fromIndex = Math.min(Math.floor(sample), flyby.points.length - 2);
  const amount = sample - fromIndex;

  position.lerpVectors(
    flyby.points[fromIndex],
    flyby.points[fromIndex + 1],
    amount,
  );
  direction.lerpVectors(
    flyby.directions[fromIndex],
    flyby.directions[fromIndex + 1],
    amount,
  ).normalize();
}

export function createVoyagerController(scene: THREE.Scene): VoyagerController {
  const root = new THREE.Group();
  const model = new THREE.Group();
  const flyby = createFlyby();
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

  const ready = new GLTFLoader()
    .loadAsync('/models/Voyager.glb')
    .then((gltf) => {
      if (disposed) {
        disposeObject(gltf.scene);
        return;
      }
      voyager = gltf.scene;
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
        console.error('Error loading Voyager.glb:', error);
      }
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
      sampleFlyby(flyby, progress, voyager.position, flightDirection);

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
        cameraOffset.copy(flightDirection).multiplyScalar(-5);
        cameraOffset.y += 4;
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
