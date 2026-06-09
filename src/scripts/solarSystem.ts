import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { planetsData, createPlanet, createOrbit } from './planets';
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

function createGlowTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,220,0.8)');
  g.addColorStop(0.2, 'rgba(255,255,180,0.5)');
  g.addColorStop(0.5, 'rgba(255,200,100,0.2)');
  g.addColorStop(1, 'rgba(255,150,50,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function createStarField(count: number, radius: number): THREE.Points {
  const positions = new Float32Array(count * 3);
  
  // 定义几个“星团”中心点，模拟不均匀分布
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
      const spread = radius * 0.15; // 星团扩散范围
      positions[i * 3] = cluster.x + (Math.random() - 0.5) * spread;
      positions[i * 3 + 1] = cluster.y + (Math.random() - 0.5) * spread;
      positions[i * 3 + 2] = cluster.z + (Math.random() - 0.5) * spread;
    } else {
      const minR = 60; // 显著增大核心空白区，避免挡住太阳系
      r = minR + Math.random() * (radius - minR);
      theta = Math.random() * Math.PI * 2;
      phi = Math.acos(2 * Math.random() - 1);
      
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.55,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  }));
}

function createParticleRing(count: number, innerR: number, outerR: number, thickness: number, color: number, size: number): THREE.Points {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = innerR + Math.random() * (outerR - innerR);
    positions[i * 3] = Math.cos(angle) * r;
    positions[i * 3 + 1] = (Math.random() - 0.5) * thickness;
    positions[i * 3 + 2] = Math.sin(angle) * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({
    color, size, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
}

function createConstellation(positions: THREE.Vector3[], glowTex: THREE.CanvasTexture): THREE.Group {
  const group = new THREE.Group();

  positions.forEach((pos) => {
    group.add(createSphere(0.18, 0xffffff, pos));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.position.copy(pos);
    glow.scale.set(3, 3, 1);
    group.add(glow);
  });

  // 连线
  const lineGeo = new THREE.BufferGeometry().setFromPoints(positions);
  lineGeo.setIndex([0, 1, 1, 2, 2, 0]);
  group.add(new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({
    color: 0xaaccff, transparent: true, opacity: 0.35, depthWrite: false,
  })));

  return group;
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
  // 初始位置
  const defaultPos = new THREE.Vector3(0, 14, 22);
  // 右下角偏移：相机看向太阳系的左上方，太阳系就会出现在屏幕右下角
  const initialPos = new THREE.Vector3(0, 14, 22); 
  const initialTarget = new THREE.Vector3(-10, 8, 0);
  const centerTarget = new THREE.Vector3(0, 0, 0);

  // 初始化时直接设置到右下角
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
  const starCount = window.innerWidth < 768 ? 2000 : 6000;
  const stars = createStarField(starCount, 800);

  scene.add(stars);

  const glowTex = createGlowTexture();
  const constellation = createConstellation([
    new THREE.Vector3(-8, 5, -15),
    new THREE.Vector3(5, 7, -12),
    new THREE.Vector3(-2, 3, -18),
  ], glowTex);
  scene.add(constellation);

  const maxOrbit = Math.max(...planetsData.map((p) => p.orbitRadius));
  const asteroidBelt = createParticleRing(2000, maxOrbit + 2, maxOrbit + 4, 0.6, 0x8899aa, 0.08);
  scene.add(asteroidBelt);

  const planets: THREE.Mesh[] = [];
  const planetData: Array<{
    mesh: THREE.Mesh;
    angle: number;
    config: (typeof planetsData)[0];
    retrograde: boolean;
  }> = [];

  planetsData.forEach((config) => {
    const planet = createPlanet(config);

    scene.add(createOrbit(config.orbitRadius));
    scene.add(planet);
    planets.push(planet);
    planetData.push({
      mesh: planet,
      angle: Math.random() * Math.PI * 2,
      config,
      retrograde: Math.random() < 0.25,
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
    { obj: constellation, speed: 0.0001 },
    { obj: asteroidBelt, speed: 0.0003 },
  ];

  let animationId: number;
  const animate = () => {
    animationId = requestAnimationFrame(animate);

    for (const { obj, speed } of rigidRotators) {
      obj.rotation.y += speed;
    }

    for (const data of planetData) {
      data.angle += data.config.orbitSpeed * (data.retrograde ? -1 : 1);
      data.mesh.position.x = Math.cos(data.angle) * data.config.orbitRadius;
      data.mesh.position.z = Math.sin(data.angle) * data.config.orbitRadius;
      data.mesh.rotation.y += 0.01;
    }

    // 仅处理手动“重置视角”的动画
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
    renderer.dispose();
  };
}
