import * as THREE from 'three';
import {
  AsteroidBelt,
  createOrbit,
  createPlanet,
  planetsData,
} from '../planets';
import type { PlanetConfig } from '../planets';
import { disposeObject } from './dispose';

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

function createStarField(count: number, radius: number): THREE.Points {
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const clusters = [
    new THREE.Vector3(radius * 0.5, radius * 0.2, -radius * 0.4),
    new THREE.Vector3(-radius * 0.4, -radius * 0.3, radius * 0.5),
    new THREE.Vector3(0, radius * 0.6, 0),
  ];

  for (let i = 0; i < count; i += 1) {
    if (Math.random() > 0.6) {
      const cluster = clusters[Math.floor(Math.random() * clusters.length)];
      const spread = radius * 0.15;
      positions[i * 3] = cluster.x + (Math.random() - 0.5) * spread;
      positions[i * 3 + 1] = cluster.y + (Math.random() - 0.5) * spread;
      positions[i * 3 + 2] = cluster.z + (Math.random() - 0.5) * spread;
    } else {
      const distance = 60 + Math.random() * (radius - 60);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = distance * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = distance * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = distance * Math.cos(phi);
    }
    phases[i] = Math.random() * Math.PI * 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    uniforms: {
      time: { value: 0 },
      pixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    },
    vertexShader: `
      attribute float phase;
      uniform float time;
      uniform float pixelRatio;
      varying float brightness;

      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        brightness = 0.35 + 0.65 * (0.5 + 0.5 * sin(time * 1.8 + phase));
        gl_PointSize = 0.55 * pixelRatio * (300.0 / -viewPosition.z);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      varying float brightness;

      void main() {
        gl_FragColor = vec4(vec3(1.0), brightness);
      }
    `,
  });

  return new THREE.Points(geometry, material);
}

export function createCelestialObjects(scene: THREE.Scene): CelestialObjects {
  const root = new THREE.Group();
  const sun = createSun();
  const stars = createStarField(window.innerWidth < 768 ? 5000 : 24000, 800);
  const asteroidBelts: AsteroidBelt[] = [];
  const planets: CelestialPlanet[] = [];
  const orbitingPlanets: OrbitingPlanet[] = [];

  root.add(new THREE.AmbientLight(0xffffff, 0.3));
  root.add(new THREE.PointLight(0xfdb813, 30, 50));
  root.add(sun, stars);

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
      stars.rotation.y += 0.0042 * delta;
      (stars.material as THREE.ShaderMaterial).uniforms.time.value = elapsed;

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
