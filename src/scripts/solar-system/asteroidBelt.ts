import * as THREE from 'three';
import type { AsteroidBeltConfig } from '../planets';

export class AsteroidBelt {
  readonly object: THREE.Group;
  private readonly config: AsteroidBeltConfig;
  private readonly particles: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;

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
    this.particles.material.uniforms.time.value = elapsed;
  }

  private createParticles(): THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
    const positions = new Float32Array(this.config.particleCount * 3);
    const phases = new Float32Array(this.config.particleCount);

    for (let index = 0; index < this.config.particleCount; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = THREE.MathUtils.lerp(
        this.config.innerRadius,
        this.config.outerRadius,
        Math.random(),
      );

      positions[index * 3] = Math.cos(angle) * radius;
      positions[index * 3 + 1] = (Math.random() - 0.5) * this.config.thickness;
      positions[index * 3 + 2] = Math.sin(angle) * radius;
      phases[index] = Math.random() * Math.PI * 2;
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
