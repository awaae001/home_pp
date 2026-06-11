import * as THREE from 'three';

export type Vector3Tuple = readonly [x: number, y: number, z: number];

export interface PlanetConfig {
  kind: 'planet';
  name: string;
  color: string;
  radius: number;
  orbitRadius: number;
  orbitRotation: Vector3Tuple;
  orbitSpeed: number;
  url: string;
  external: boolean;
}

export interface AsteroidBeltConfig {
  kind: 'asteroid-belt';
  name: string;
  color: number;
  particleCount: number;
  particleSize: number;
  innerRadius: number;
  outerRadius: number;
  thickness: number;
  position: Vector3Tuple;
  rotation: Vector3Tuple;
  rotationSpeed: number;
}

export type SolarObjectConfig = PlanetConfig | AsteroidBeltConfig;

function randomSpeed(orbitRadius: number): number {
  const base = 0.0015 / orbitRadius;
  return base * (0.6 + Math.random() * 0.8);
}

export const planetsData: SolarObjectConfig[] = [
  {
    kind: 'planet',
    name: 'Blog',
    color: '#3B82F6',
    radius: 0.4,
    orbitRadius: 3,
    orbitRotation: [0, 0, 0],
    orbitSpeed: randomSpeed(3),
    url: 'https://blog.awaae001.top',
    external: true,
  },
  {
    kind: 'planet',
    name: 'Jiuci_network',
    color: '#10B981',
    radius: 0.45,
    orbitRadius: 5,
    orbitRotation: [0, 0, 0],
    orbitSpeed: randomSpeed(5),
    url: 'https://www.jiuci.top/',
    external: false,
  },
  {
    kind: 'asteroid-belt',
    name: 'Main Belt',
    color: 0x8899aa,
    particleCount: 2000,
    particleSize: 0.12,
    innerRadius: 7,
    outerRadius: 9,
    thickness: 0.6,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    rotationSpeed: 0.0003,
  },
  {
    kind: 'planet',
    name: 'Neosora Image',
    color: '#A78BFA',
    radius: 0.5,
    orbitRadius: 11,
    orbitRotation: [Math.PI / 12, 0, Math.PI / 24],
    orbitSpeed: randomSpeed(11),
    url: 'https://image.neosora.cc/',
    external: true,
  },
];

export function createPlanet(config: PlanetConfig) {
  const geometry = new THREE.SphereGeometry(config.radius, 32, 32);
  const material = new THREE.MeshStandardMaterial({
    color: config.color,
    emissive: config.color,
    emissiveIntensity: 0.3,
  });
  const planet = new THREE.Mesh(geometry, material);
  planet.userData = { config };
  return planet;
}

export function createOrbit(radius: number, rotation: Vector3Tuple) {
  const points = [];
  const segments = 128;
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.2,
  });
  const orbit = new THREE.Line(geometry, material);
  orbit.rotation.set(...rotation);
  return orbit;
}
