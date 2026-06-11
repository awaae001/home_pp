export type Vector3Tuple = readonly [x: number, y: number, z: number];

/// Describes a clickable planet and its orbit.
export interface PlanetConfig {
  kind: 'planet';
  name: string;
  color: string;
  radius: number;
  orbitRadius: number;
  orbitRotation: Vector3Tuple;
  url: string;
  external: boolean;
}

/// Describes the visual properties and motion of an asteroid belt.
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

export const planetsData: SolarObjectConfig[] = [
  {
    kind: 'planet',
    name: 'Blog',
    color: '#3B82F6',
    radius: 0.4,
    orbitRadius: 3,
    orbitRotation: [0, 0, 0],
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
    url: 'https://image.neosora.cc/',
    external: true,
  },
];
