import * as THREE from 'three';
import { InteractionManager } from './interactions';
import type { InteractiveTarget } from './interactions';
import { createCelestialObjects } from './solar-system/celestialObjects';
import { createSceneContext } from './solar-system/scene';
import { createVoyagerController } from './solar-system/voyager';

export type Dispose = () => void;

type CameraMode =
  | { readonly kind: 'free' }
  | { readonly kind: 'tracking-voyager' }
  | { readonly kind: 'resetting'; readonly target: THREE.Vector3 };

function openPlanet(url: string, external: boolean): void {
  if (external) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  window.location.href = url;
}

export function initSolarSystem(canvas: HTMLCanvasElement): Dispose {
  const context = createSceneContext(canvas);
  const celestialObjects = createCelestialObjects(context.scene);
  const voyager = createVoyagerController(context.scene);
  const cameraPosition = document.getElementById('camera-position');
  const mainMask = document.getElementById('main-mask');
  let cameraMode: CameraMode = { kind: 'free' };
  let animationId: number | null = null;
  let nextBackgroundFrameAt = performance.now();
  let statsStartedAt = performance.now();
  let renderedFrames = 0;
  let disposed = false;

  const targets: InteractiveTarget[] = celestialObjects.planets.map(({ mesh, config }) => {
    const originalScale = mesh.scale.clone();
    return {
      object: mesh,
      tooltip: `${config.name} - ${config.url}`,
      activate: () => openPlanet(config.url, config.external),
      setHovered: (hovered) => {
        mesh.scale.copy(originalScale).multiplyScalar(hovered ? 1.2 : 1);
      },
    };
  });

  targets.push({
    object: voyager.guideLine,
    tooltip: '航线',
    priority: -1,
    activate: () => {
      cameraMode = { kind: 'tracking-voyager' };
      context.controls.enabled = true;
    },
  });
  targets.push({
    object: voyager.model,
    tooltip: '终于，旅行者一号看到了新世界，可惜它早已缄默。',
    priority: 1,
    activate: () => {
      window.open(
        'https://zh.wikipedia.org/wiki/%E6%97%85%E8%A1%8C%E8%80%851%E5%8F%B7',
        '_blank',
        'noopener,noreferrer',
      );
    },
  });

  const interactions = new InteractionManager({
    camera: context.camera,
    canvas,
    targets,
    lineThreshold: 0.4,
    maxDistance: 50,
  });

  const resetView = (): void => {
    cameraMode = {
      kind: 'resetting',
      target: context.defaultTarget().clone(),
    };
    context.controls.enabled = false;
  };

  const stopVoyagerTracking = (): void => {
    cameraMode = { kind: 'free' };
  };

  const timer = new THREE.Timer();
  timer.connect(document);

  const frame = (timestamp: number): void => {
    if (disposed) {
      return;
    }
    animationId = requestAnimationFrame(frame);

    const isCovered = mainMask !== null && mainMask.style.pointerEvents !== 'none';
    if (isCovered) {
      const frameInterval = 1000 / 24;
      if (timestamp < nextBackgroundFrameAt) {
        return;
      }
      do {
        nextBackgroundFrameAt += frameInterval;
      } while (nextBackgroundFrameAt <= timestamp);
    } else {
      nextBackgroundFrameAt = timestamp;
    }

    timer.update(timestamp);
    const delta = Math.min(timer.getDelta(), 0.1);
    const elapsed = timer.getElapsed();

    celestialObjects.update(elapsed, delta);
    voyager.update(
      elapsed,
      cameraMode.kind === 'tracking-voyager',
      context.camera,
      context.controls,
    );

    if (cameraMode.kind === 'resetting') {
      context.camera.position.lerp(context.defaultPosition, 0.08);
      context.controls.target.lerp(cameraMode.target, 0.08);

      if (
        context.camera.position.distanceTo(context.defaultPosition) < 0.1
        && context.controls.target.distanceTo(cameraMode.target) < 0.1
      ) {
        context.camera.position.copy(context.defaultPosition);
        context.controls.target.copy(cameraMode.target);
        context.controls.enabled = true;
        cameraMode = { kind: 'free' };
      }
    }

    context.controls.update();
    renderedFrames += 1;
    const statsDuration = timestamp - statsStartedAt;
    if (statsDuration >= 500) {
      if (cameraPosition) {
        const { x, y, z } = context.camera.position;
        const fps = Math.round((renderedFrames * 1000) / statsDuration);
        cameraPosition.textContent = [
          `X ${x.toFixed(2)}`,
          `Y ${y.toFixed(2)}`,
          `Z ${z.toFixed(2)}`,
          `FPS ${fps}`,
        ].join('  ');
      }
      statsStartedAt = timestamp;
      renderedFrames = 0;
    }
    context.renderer.render(context.scene, context.camera);
  };

  const syncAnimation = (): void => {
    if (disposed || document.hidden) {
      if (animationId === null) {
        return;
      }
      cancelAnimationFrame(animationId);
      animationId = null;
      return;
    }

    if (animationId === null) {
      statsStartedAt = performance.now();
      nextBackgroundFrameAt = statsStartedAt;
      renderedFrames = 0;
      animationId = requestAnimationFrame(frame);
    }
  };

  const resetButton = document.getElementById('btn-reset-view');
  resetButton?.addEventListener('click', resetView);
  context.controls.addEventListener('start', stopVoyagerTracking);
  window.addEventListener('resize', context.resize);
  document.addEventListener('visibilitychange', syncAnimation);
  syncAnimation();

  return () => {
    disposed = true;
    syncAnimation();
    resetButton?.removeEventListener('click', resetView);
    context.controls.removeEventListener('start', stopVoyagerTracking);
    window.removeEventListener('resize', context.resize);
    document.removeEventListener('visibilitychange', syncAnimation);
    interactions.dispose();
    voyager.dispose();
    celestialObjects.dispose();
    timer.dispose();
    context.dispose();
  };
}
