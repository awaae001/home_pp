//! Owns the standalone Three.js starfield scene used by content pages.

import * as THREE from 'three';
import { createStarField } from './solar-system/starField';
import type { Dispose } from './solarSystem';

export function initStarfield(canvas: HTMLCanvasElement): Dispose {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: false,
    powerPreference: 'low-power',
  });
  const stars = createStarField(window.innerWidth < 768 ? 5000 : 24000, 800);
  const timer = new THREE.Timer();
  let animationFrame: number | null = null;
  let disposed = false;

  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -1);
  scene.add(stars.object);
  timer.connect(document);

  const resize = (): void => {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height, false);
    stars.resize();
  };

  const frame = (timestamp: number): void => {
    if (disposed) {
      return;
    }

    timer.update(timestamp);
    stars.update(timer.getElapsed(), Math.min(timer.getDelta(), 0.1));
    renderer.render(scene, camera);
    animationFrame = window.requestAnimationFrame(frame);
  };

  resize();
  window.addEventListener('resize', resize);
  animationFrame = window.requestAnimationFrame(frame);

  return () => {
    disposed = true;
    if (animationFrame !== null) {
      window.cancelAnimationFrame(animationFrame);
    }
    window.removeEventListener('resize', resize);
    scene.remove(stars.object);
    stars.dispose();
    timer.dispose();
    renderer.dispose();
  };
}
