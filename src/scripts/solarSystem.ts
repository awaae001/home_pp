import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  AsteroidBelt,
  planetsData,
  createPlanet,
  createOrbit,
} from './planets';
import type { PlanetConfig } from './planets';
import { InteractionManager } from './interactions';

// ─── Helpers ────────────────────────────────────────────────

function createSphere(radius: number, color: number, pos: THREE.Vector3): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 32, 32),
    new THREE.MeshBasicMaterial({ color }),
  );
  mesh.position.copy(pos);
  return mesh;
}

function createStarField(count: number, radius: number): THREE.Points {
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const clusters = [
    new THREE.Vector3(radius * 0.5, radius * 0.2, -radius * 0.4),
    new THREE.Vector3(-radius * 0.4, -radius * 0.3, radius * 0.5),
    new THREE.Vector3(0, radius * 0.6, 0),
  ];

  for (let i = 0; i < count; i++) {
    let r, theta, phi;
    const isCluster = Math.random() > 0.6;

    if (isCluster) {
      const cluster = clusters[Math.floor(Math.random() * clusters.length)];
      const spread = radius * 0.15;
      positions[i * 3] = cluster.x + (Math.random() - 0.5) * spread;
      positions[i * 3 + 1] = cluster.y + (Math.random() - 0.5) * spread;
      positions[i * 3 + 2] = cluster.z + (Math.random() - 0.5) * spread;
    } else {
      const minR = 60;
      r = minR + Math.random() * (radius - minR);
      theta = Math.random() * Math.PI * 2;
      phi = Math.acos(2 * Math.random() - 1);
      
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    phases[i] = Math.random() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('phase', new THREE.BufferAttribute(phases, 1));

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

  return new THREE.Points(geo, material);
}

export function initSolarSystem(canvas: HTMLCanvasElement) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 14, 22);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 5;
  controls.maxDistance = 40;
  controls.maxPolarAngle = Math.PI / 2 + 0.5;
  controls.target.set(0, 0, 0);

  let isExploring = false;
  const defaultPos = new THREE.Vector3(0, 14, 22);
  const initialPos = new THREE.Vector3(0, 14, 22); 
  const initialTarget = new THREE.Vector3(-10, 8, 0);
  const centerTarget = new THREE.Vector3(0, 0, 0);

  if (window.innerWidth >= 768) {
    camera.position.copy(initialPos);
    camera.lookAt(initialTarget);
    controls.target.copy(initialTarget);
  } else {
    camera.position.copy(defaultPos);
    camera.lookAt(centerTarget);
    controls.target.copy(centerTarget);
  }
  controls.update();

  scene.add(new THREE.AmbientLight(0xffffff, 0.3));
  scene.add(new THREE.PointLight(0xFDB813, 2, 50));
  const sun = createSphere(1.5, 0xFDB813, new THREE.Vector3(0, 0, 0));

  scene.add(sun);
  const starCount = window.innerWidth < 768 ? 5000 : 12000;
  const stars = createStarField(starCount, 800);

  scene.add(stars);

  const planets: THREE.Mesh[] = [];
  const asteroidBelts: AsteroidBelt[] = [];
  const planetData: Array<{
    mesh: THREE.Mesh;
    angle: number;
    config: PlanetConfig;
    retrograde: boolean;
    orbitRotation: THREE.Euler;
  }> = [];

  planetsData.forEach((config) => {
    if (config.kind === 'asteroid-belt') {
      const belt = new AsteroidBelt(config);
      scene.add(belt.object);
      asteroidBelts.push(belt);
      return;
    }

    const planet = createPlanet(config);

    scene.add(createOrbit(config.orbitRadius, config.orbitRotation));
    scene.add(planet);
    planets.push(planet);
    planetData.push({
      mesh: planet,
      angle: Math.random() * Math.PI * 2,
      config,
      retrograde: Math.random() < 0.25,
      orbitRotation: new THREE.Euler(...config.orbitRotation),
    });
  });

  const interactionManager = new InteractionManager(camera, planets, canvas);
  const btnReset = document.getElementById('btn-reset-view');
  const btnWebsite = document.getElementById('btn-website');
  const btnBack = document.getElementById('btn-back');

  let isResetting = false;
  const targetPos = new THREE.Vector3(0, 14, 22);
  const targetLook = new THREE.Vector3(0, 0, 0);

  if (btnReset) {
    btnReset.addEventListener('click', () => {
      isResetting = true;
      controls.enabled = false;
    });
  }

  if (btnWebsite) {
    btnWebsite.addEventListener('click', () => {
      isExploring = true;
    });
  }

  if (btnBack) {
    btnBack.addEventListener('click', () => {
      isExploring = false;
    });
  }

  const rigidRotators: Array<{ obj: THREE.Object3D; speed: number }> = [
    { obj: sun, speed: 0.001 },
    { obj: stars, speed: 0.00007 },
  ];

  const timer = new THREE.Timer();
  timer.connect(document);
  let animationId: number;
  const animate = (timestamp?: number) => {
    animationId = requestAnimationFrame(animate);
    timer.update(timestamp);
    const delta = Math.min(timer.getDelta(), 0.1);
    const elapsed = timer.getElapsed();

    for (const { obj, speed } of rigidRotators) {
      obj.rotation.y += speed;
    }

    asteroidBelts.forEach((belt) => belt.update(elapsed, delta));
    (stars.material as THREE.ShaderMaterial).uniforms.time.value = elapsed;

    for (const data of planetData) {
      data.angle += data.config.orbitSpeed * (data.retrograde ? -1 : 1);
      data.mesh.position.set(
        Math.cos(data.angle) * data.config.orbitRadius,
        0,
        Math.sin(data.angle) * data.config.orbitRadius,
      );
      data.mesh.position.applyEuler(data.orbitRotation);
      data.mesh.rotation.y += 0.01;
    }

    if (isResetting) {
      camera.position.lerp(defaultPos, 0.08);
      controls.target.lerp(centerTarget, 0.08);
      if (camera.position.distanceTo(defaultPos) < 0.1) {
        isResetting = false;
        controls.enabled = true;
      }
    }

    controls.update();
    renderer.render(scene, camera);
  };

  const handleResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', handleResize);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(animationId);
    } else {
      animate();
    }
  });

  animate();

  // ── Cleanup ──
  return () => {
    cancelAnimationFrame(animationId);
    window.removeEventListener('resize', handleResize);
    controls.dispose();
    interactionManager.dispose();
    timer.dispose();
    renderer.dispose();
  };
}
