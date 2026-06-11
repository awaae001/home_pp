import * as THREE from 'three';
import { planetsData } from '../planets';
import type { PlanetConfig } from '../planets';
import { AsteroidBelt } from './asteroidBelt';
import { disposeObject } from './dispose';
import { createStarField } from './starField';

const FULL_ORBIT = Math.PI * 2;
const ORBIT_SPEED_SCALE = 0.0026;

interface OrbitingPlanet {
  readonly mesh: THREE.Mesh;
  readonly config: PlanetConfig;
  readonly direction: 1 | -1;
  readonly orbitRotation: THREE.Euler;
  readonly angularSpeed: number;
  angle: number;
}

export interface CelestialObjects {
  readonly planets: readonly CelestialPlanet[];
  readonly update: (elapsed: number, delta: number) => void;
  readonly dispose: () => void;
}

export interface CelestialPlanet {
  readonly mesh: THREE.Mesh;
  readonly config: PlanetConfig;
}

function createSun(): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.SphereGeometry(1.5, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0xfdb813 }),
  );
}

function createPlanet(config: PlanetConfig): THREE.Mesh {
  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(config.radius, 32, 32),
    new THREE.MeshStandardMaterial({
      color: config.color,
      roughness: 0.8,
    }),
  );
  planet.userData = { config };
  return planet;
}

function createOrbit(config: PlanetConfig): THREE.Line {
  const points: THREE.Vector3[] = [];
  const segments = 128;

  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * FULL_ORBIT;
    points.push(new THREE.Vector3(
      config.orbitRadius * Math.cos(angle),
      0,
      config.orbitRadius * Math.sin(angle),
    ));
  }

  const orbit = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.1,
    }),
  );
  orbit.rotation.set(...config.orbitRotation);
  return orbit;
}

function positionPlanet(planet: OrbitingPlanet): void {
  planet.mesh.position.set(
    planet.config.orbitRadius * Math.cos(planet.angle),
    0,
    planet.config.orbitRadius * Math.sin(planet.angle),
  );
  planet.mesh.position.applyEuler(planet.orbitRotation);
}

export function createCelestialObjects(scene: THREE.Scene): CelestialObjects {
  const root = new THREE.Group();
  const sun = createSun();
  const stars = createStarField(window.innerWidth < 768 ? 5000 : 24000, 1000, {
    innerRadius: 120,
  });
  const asteroidBelts: AsteroidBelt[] = [];
  const planets: CelestialPlanet[] = [];
  const orbitingPlanets: OrbitingPlanet[] = [];

  root.add(new THREE.AmbientLight(0xffffff, 0.3));
  root.add(new THREE.PointLight(0xfdb813, 60, 100));
  root.add(sun, stars.object);

  for (const config of planetsData) {
    if (config.kind === 'asteroid-belt') {
      const belt = new AsteroidBelt(config);
      root.add(belt.object);
      asteroidBelts.push(belt);
      continue;
    }

    const planet = createPlanet(config);
    root.add(createOrbit(config), planet);
    planets.push({ mesh: planet, config });
    const orbitingPlanet: OrbitingPlanet = {
      mesh: planet,
      angle: Math.random() * FULL_ORBIT,
      config,
      direction: Math.random() < 0.5 ? -1 : 1,
      orbitRotation: new THREE.Euler(...config.orbitRotation),
      angularSpeed: ORBIT_SPEED_SCALE / Math.pow(config.orbitRadius, 1.5),
    };
    positionPlanet(orbitingPlanet);
    orbitingPlanets.push(orbitingPlanet);
  }

  scene.add(root);

  return {
    planets,
    update: (elapsed, delta) => {
      sun.rotation.y += 0.06 * delta;
      stars.update(elapsed, delta);

      for (const belt of asteroidBelts) {
        belt.update(elapsed, delta);
      }

      for (const planet of orbitingPlanets) {
        planet.angle = THREE.MathUtils.euclideanModulo(
          planet.angle + (
            planet.angularSpeed
            * planet.direction
            * delta
            * 60
          ),
          FULL_ORBIT,
        );
        positionPlanet(planet);
      }
    },
    dispose: () => {
      scene.remove(root);
      disposeObject(root);
    },
  };
}
