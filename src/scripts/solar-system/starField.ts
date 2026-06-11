import * as THREE from 'three';

const CLUSTERED_STAR_RATIO = 0.2;
const CLUSTER_SPREAD_RATIO = 0.1;
const CLUSTER_COUNT = 3;

function createRandomClusterCenter(radius: number): THREE.Vector3 {
  const distance = radius * (0.4 + Math.random() * 0.3);
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);

  return new THREE.Vector3(
    distance * Math.sin(phi) * Math.cos(theta),
    distance * Math.sin(phi) * Math.sin(theta),
    distance * Math.cos(phi),
  );
}

function createClusterOffset(spread: number): THREE.Vector3 {
  const distance = spread * 0.5 * Math.pow(Math.random(), 2);
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);

  return new THREE.Vector3(
    distance * Math.sin(phi) * Math.cos(theta),
    distance * Math.sin(phi) * Math.sin(theta),
    distance * Math.cos(phi),
  );
}

export interface StarField {
  readonly object: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  readonly update: (elapsed: number, delta: number) => void;
  readonly resize: () => void;
  readonly dispose: () => void;
}

export interface StarFieldOptions {
  readonly distanceAttenuation?: boolean;
  readonly pointSize?: number;
  readonly innerRadius?: number;
}

export function createStarField(
  count: number,
  radius: number,
  options: StarFieldOptions = {},
): StarField {
  const innerRadius = Math.min(options.innerRadius ?? 60, radius);
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const clusters = Array.from(
    { length: CLUSTER_COUNT },
    () => createRandomClusterCenter(radius),
  );

  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;

    if (Math.random() < CLUSTERED_STAR_RATIO) {
      const cluster = clusters[Math.floor(Math.random() * clusters.length)];
      const spread = radius * CLUSTER_SPREAD_RATIO;
      const clusterOffset = createClusterOffset(spread);
      positions[offset] = cluster.x + clusterOffset.x;
      positions[offset + 1] = cluster.y + clusterOffset.y;
      positions[offset + 2] = cluster.z + clusterOffset.z;
    } else {
      const distance = innerRadius + Math.random() * (radius - innerRadius);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[offset] = distance * Math.sin(phi) * Math.cos(theta);
      positions[offset + 1] = distance * Math.sin(phi) * Math.sin(theta);
      positions[offset + 2] = distance * Math.cos(phi);
    }

    phases[index] = Math.random() * Math.PI * 2;
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
      distanceAttenuation: { value: options.distanceAttenuation === false ? 0 : 1 },
      pointSize: { value: options.pointSize ?? 0.55 },
    },
    vertexShader: `
      attribute float phase;
      uniform float time;
      uniform float pixelRatio;
      uniform float distanceAttenuation;
      uniform float pointSize;
      varying float brightness;

      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        brightness = 0.65 + 0.25 * (0.5 + 0.5 * sin(time * 0.3 + phase));
        float perspectiveScale = 300.0 / max(-viewPosition.z, 1.0);
        gl_PointSize = pointSize * pixelRatio * mix(1.0, perspectiveScale, distanceAttenuation);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      varying float brightness;

      void main() {
        vec2 pt = gl_PointCoord - 0.5;
        if (abs(pt.x) + abs(pt.y) > 0.5) discard;
        gl_FragColor = vec4(vec3(1.0), brightness);
      }
    `,
  });

  const object = new THREE.Points(geometry, material);

  return {
    object,
    update: (elapsed, delta) => {
      object.rotation.y += 0.0001 * delta;
      material.uniforms.time.value = elapsed;
    },
    resize: () => {
      material.uniforms.pixelRatio.value = Math.min(window.devicePixelRatio, 2);
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}
