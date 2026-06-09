import * as THREE from 'three';

export interface PlanetConfig {
  name: string;
  color: string;
  radius: number;
  orbitRadius: number;
  orbitSpeed: number;
  url: string;
  external: boolean;
}

function randomSpeed(orbitRadius: number): number {
  const base = 0.0015 / orbitRadius;
  return base * (0.6 + Math.random() * 0.8);
}

export const planetsData: PlanetConfig[] = [
  {
    name: 'Blog',
    color: '#3B82F6',
    radius: 0.4,
    orbitRadius: 3,
    orbitSpeed: randomSpeed(3),
    url: 'https://blog.awaae001.top',
    external: true,
  },
  {
    name: 'Jiuci_network',
    color: '#10B981',
    radius: 0.45,
    orbitRadius: 5,
    orbitSpeed: randomSpeed(5),
    url: 'https://www.jiuci.top/',
    external: false,
  }
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

export function createOrbit(radius: number) {
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
  return new THREE.Line(geometry, material);
}
