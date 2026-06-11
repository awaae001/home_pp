import * as THREE from 'three';
import {
  createOrbit,
  createPlanet,
  planetsData,
} from '../planets';
import type { PlanetConfig } from '../planets';
import { AsteroidBelt } from './asteroidBelt';
import { disposeObject } from './dispose';
import { createStarField } from './starField';

interface OrbitingPlanet {
  readonly mesh: THREE.Mesh;
  readonly config: PlanetConfig;
  readonly direction: 1 | -1;
  readonly orbitRotation: THREE.Euler;
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
    root.add(createOrbit(config.orbitRadius, config.orbitRotation), planet);
    planets.push({ mesh: planet, config });
    orbitingPlanets.push({
      mesh: planet,
      angle: Math.random() * Math.PI * 2,
      config,
      direction: Math.random() < 0.25 ? -1 : 1,
      orbitRotation: new THREE.Euler(...config.orbitRotation),
    });
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
        planet.angle += planet.config.orbitSpeed * planet.direction * delta * 60;
        planet.mesh.position.set(
          Math.cos(planet.angle) * planet.config.orbitRadius,
          0,
          Math.sin(planet.angle) * planet.config.orbitRadius,
        );
        planet.mesh.position.applyEuler(planet.orbitRotation);
      }
    },
    dispose: () => {
      scene.remove(root);
      disposeObject(root);
    },
  };
}
