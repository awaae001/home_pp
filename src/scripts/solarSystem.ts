import * as THREE from 'three';
import { planetsData, createPlanet, createOrbit } from './planets';
import { InteractionManager } from './interactions';

export function initSolarSystem(canvas: HTMLCanvasElement) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 8, 12);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
  scene.add(ambientLight);

  const sunGeometry = new THREE.SphereGeometry(1.5, 32, 32);
  const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xFDB813 });
  const sun = new THREE.Mesh(sunGeometry, sunMaterial);
  scene.add(sun);

  const sunLight = new THREE.PointLight(0xFDB813, 2, 50);
  scene.add(sunLight);

  const starGeometry = new THREE.BufferGeometry();
  const starCount = window.innerWidth < 768 ? 300 : 1500;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount * 3; i++) {
    starPositions[i] = (Math.random() - 0.5) * 100;
  }
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.1 });
  const stars = new THREE.Points(starGeometry, starMaterial);
  scene.add(stars);

  const planets: THREE.Mesh[] = [];
  const planetData: Array<{ mesh: THREE.Mesh; angle: number; config: typeof planetsData[0] }> = [];

  planetsData.forEach((config) => {
    const planet = createPlanet(config);
    const orbit = createOrbit(config.orbitRadius);
    scene.add(orbit);
    scene.add(planet);
    planets.push(planet);
    planetData.push({ mesh: planet, angle: Math.random() * Math.PI * 2, config });
  });

  const interactionManager = new InteractionManager(camera, planets, canvas);

  let animationId: number;
  const animate = () => {
    animationId = requestAnimationFrame(animate);

    sun.rotation.y += 0.001;
    stars.rotation.y += 0.0001;

    planetData.forEach((data) => {
      data.angle += data.config.orbitSpeed;
      data.mesh.position.x = Math.cos(data.angle) * data.config.orbitRadius;
      data.mesh.position.z = Math.sin(data.angle) * data.config.orbitRadius;
      data.mesh.rotation.y += 0.01;
    });

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

  return () => {
    cancelAnimationFrame(animationId);
    window.removeEventListener('resize', handleResize);
    interactionManager.dispose();
    renderer.dispose();
  };
}
