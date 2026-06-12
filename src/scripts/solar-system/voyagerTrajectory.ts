import * as THREE from 'three';

const FLIGHT_RADIUS = 70;
const TRAJECTORY_SAMPLES = 512;
const GUIDE_EXTENSION = 5000;
const IMPACT_PARAMETER_RATIO = 0.2;
const ORBIT_CLEARANCE = 8;
// Chosen for a visually legible flyby, not as a physically accurate Voyager deflection.
// A faithful simulation would require consistent physical units, historical ephemerides,
// spacecraft maneuver data, and numerical integration of multiple bodies.
const DEFLECTION_ANGLE = THREE.MathUtils.degToRad(28);
const ENTRY_ELEVATION = THREE.MathUtils.degToRad(24);
const GALACTIC_NORTH = new THREE.Vector3(0, 1, 0);

interface MotionState {
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
}

export interface FlybyTrajectory {
  readonly points: readonly THREE.Vector3[];
  readonly directions: readonly THREE.Vector3[];
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

export function createFlybyTrajectory(): FlybyTrajectory {
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

export function createGuidePoints(trajectory: FlybyTrajectory): THREE.Vector3[] {
  const start = trajectory.points[0];
  const end = trajectory.points[trajectory.points.length - 1];
  const incomingDirection = trajectory.directions[0];
  const outgoingDirection = trajectory.directions[trajectory.directions.length - 1];

  return [
    start.clone().addScaledVector(incomingDirection, -GUIDE_EXTENSION),
    ...trajectory.points,
    end.clone().addScaledVector(outgoingDirection, GUIDE_EXTENSION),
  ];
}

export function sampleTrajectory(
  trajectory: FlybyTrajectory,
  progress: number,
  position: THREE.Vector3,
  direction: THREE.Vector3,
): void {
  const sample = progress * (trajectory.points.length - 1);
  const fromIndex = Math.min(Math.floor(sample), trajectory.points.length - 2);
  const amount = sample - fromIndex;

  position.lerpVectors(
    trajectory.points[fromIndex],
    trajectory.points[fromIndex + 1],
    amount,
  );
  direction.lerpVectors(
    trajectory.directions[fromIndex],
    trajectory.directions[fromIndex + 1],
    amount,
  ).normalize();
}
