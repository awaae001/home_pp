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

export class AsteroidBelt {
  readonly object: THREE.Group;
  readonly config: AsteroidBeltConfig;
  private readonly particles: THREE.Points;

  constructor(config: AsteroidBeltConfig) {
    this.config = config;
    this.object = new THREE.Group();
    this.object.name = config.name;
    this.object.position.set(...config.position);
    this.object.rotation.set(...config.rotation);
    this.particles = this.createParticles();
    this.object.add(this.particles);
  }

  update(elapsed: number, delta: number): void {
    this.particles.rotation.y += this.config.rotationSpeed * delta * 60;
    (this.particles.material as THREE.ShaderMaterial).uniforms.time.value = elapsed;
  }

  private createParticles(): THREE.Points {
    const positions = new Float32Array(this.config.particleCount * 3);
    const phases = new Float32Array(this.config.particleCount);

    for (let i = 0; i < this.config.particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = THREE.MathUtils.lerp(
        this.config.innerRadius,
        this.config.outerRadius,
        Math.random(),
      );

      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = (Math.random() - 0.5) * this.config.thickness;
      positions[i * 3 + 2] = Math.sin(angle) * radius;
      phases[i] = Math.random() * Math.PI * 2;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));

    const material = new THREE.ShaderMaterial({
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      uniforms: {
        time: { value: 0 },
        color: { value: new THREE.Color(this.config.color) },
        size: { value: this.config.particleSize },
        pixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: `
        attribute float phase;
        uniform float time;
        uniform float size;
        uniform float pixelRatio;

        void main() {
          vec3 animatedPosition = position;
          animatedPosition.x += sin(time * 1.3 + phase) * 0.004;
          animatedPosition.y += sin(time * 1.7 + phase * 1.7) * 0.006;
          animatedPosition.z += cos(time * 1.1 + phase * 1.3) * 0.004;

          vec4 viewPosition = modelViewMatrix * vec4(animatedPosition, 1.0);
          gl_PointSize = size * pixelRatio * (300.0 / -viewPosition.z);
          gl_Position = projectionMatrix * viewPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 color;

        void main() {
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });

    return new THREE.Points(geometry, material);
  }
}
