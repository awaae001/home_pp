import * as THREE from 'three';
import { InteractionManager } from './interactions';
import type { InteractiveTarget } from './interactions';
import { createCelestialObjects } from './solar-system/celestialObjects';
import { createInvertText } from './solar-system/invertText';
import { createSpeeder } from './solar-system/speeder';
import { createSceneContext } from './solar-system/scene';
import { FlightControls } from './solar-system/flightControls';
import { createVoyagerController } from './solar-system/voyager';
import { createStoryCamera } from './solar-system/storyCamera';
import { createObservationDeck, GLASS_FOLLOW_SHIFT } from './solar-system/observationDeck';

export type Dispose = () => void;

export type SolarSystemLoadStage = 'model' | 'shaders' | 'ready';

export interface SolarSystemOptions {
  readonly onLoadStage?: (stage: SolarSystemLoadStage) => void;
  readonly warmed?: boolean;
}

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

export async function initSolarSystem(
  canvas: HTMLCanvasElement,
  options: SolarSystemOptions = {},
): Promise<Dispose> {
  const context = createSceneContext(canvas);
  const celestialObjects = createCelestialObjects(context.scene);
  const voyager = createVoyagerController(context.scene);
  const speeder = createSpeeder(context.scene);
  const cameraStats = document.getElementById('camera-stats');
  const flightHud = document.getElementById('flight-hud');
  const mainMask = document.getElementById('main-mask');
  const mainContent = document.getElementById('main-content');
  const aboutStage = document.getElementById('about-stage');
  const invertText = createInvertText(document.querySelectorAll<HTMLElement>('.invert-text'));
  const aboutTrack = document.getElementById('about-track');
  const walkScreens = Number(aboutTrack?.dataset.walkScreens ?? 3);
  const flyScreens = Number(aboutTrack?.dataset.flyScreens ?? 1);
  const deck = createObservationDeck(document.getElementById('glass-canvas') as HTMLCanvasElement);
  document.documentElement.style.setProperty('--deck-follow', String(GLASS_FOLLOW_SHIFT));
  const storyCamera = createStoryCamera(context.camera, context.controls.target, deck);
  let storyMoving = true;
  const solarContainer = document.getElementById('solar-system-container');
  const flightHudEnabled = solarContainer?.dataset.flightEnabled ?? 'Flight mode on';
  const flightHudDisabled = solarContainer?.dataset.flightDisabled ?? 'Flight mode off';
  const cameraLabel = solarContainer?.dataset.cameraLabel ?? 'Camera';
  const fpsLabel = solarContainer?.dataset.fpsLabel ?? 'FPS';
  const voyagerRouteLabel = solarContainer?.dataset.voyagerRoute ?? 'Flight path';
  const voyagerTooltip = solarContainer?.dataset.voyagerTooltip ?? 'Voyager 1 saw a new world, but had long since fallen silent.';
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
    tooltip: voyagerRouteLabel,
    priority: -1,
    activate: () => {
      cameraMode = { kind: 'tracking-voyager' };
      context.controls.enabled = true;
    },
  });
  targets.push({
    object: voyager.model,
    tooltip: voyagerTooltip,
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

  let flightModeEnabled = document.getElementById('btn-toggle-flight')?.dataset.enabled === 'true';
  const updateFlightHud = (fov = context.camera.fov): void => {
    if (flightHud) {
      flightHud.textContent = flightModeEnabled
        ? flightHudEnabled.replace('{fov}', fov.toFixed(0))
        : flightHudDisabled;
    }
  };
  const flightControls = new FlightControls({
    camera: context.camera,
    controls: context.controls,
    isEnabled: () => mainMask?.style.pointerEvents === 'none',
    onFovChange: updateFlightHud,
  });
  flightControls.setEnabled(flightModeEnabled);
  const setFlightMode = (event: Event): void => {
    const enabled = event instanceof CustomEvent && event.detail?.enabled === true;
    flightModeEnabled = enabled;
    flightControls.setEnabled(enabled);
    updateFlightHud();
  };
  window.addEventListener('solar-flight-mode-change', setFlightMode);
  updateFlightHud();

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

    // 主页内容显示时由滚动驱动镜头；镜头静止后降帧
    const isCovered = mainMask !== null && mainMask.style.pointerEvents !== 'none';
    if (isCovered && !storyMoving) {
      const frameInterval = 1000 / 30;
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

    // 进舱以后飞船归剧情管：平时不出现，走完才从窗外飞过
    let speederFly: number | undefined;
    if (isCovered) {
      cameraMode = { kind: 'free' };
      context.controls.enabled = true;
      const progress = mainContent ? mainContent.scrollTop / Math.max(mainContent.clientHeight, 1) : 0;
      const story = storyCamera.update(progress, delta, walkScreens, flyScreens);
      speederFly = story.inside ? story.fly : undefined;
      storyMoving = story.moving;
      aboutStage?.style.setProperty('--zoom', story.zoom.toFixed(4));
      document.documentElement.style.setProperty('--glass', story.glass.toFixed(3));
      deck.setVisible(story.inside);
      document.documentElement.style.setProperty('--deck-shift', deck.walk(story.walk).toFixed(4));
      invertText.update(context.camera);
    } else if (cameraMode.kind === 'resetting') {
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

    if (!isCovered) {
      storyMoving = true;
      document.documentElement.style.setProperty('--glass', '0');
      deck.setVisible(false);
      if (cameraMode.kind === 'free') {
        flightControls.update(delta);
      }
      context.controls.update();
    }
    speeder.update(delta, context.camera, speederFly);
    renderedFrames += 1;
    const statsDuration = timestamp - statsStartedAt;
    if (statsDuration >= 500) {
      if (cameraStats) {
        const { x, y, z } = context.camera.position;
        const fps = Math.round((renderedFrames * 1000) / statsDuration);
        cameraStats.textContent = [
          `${cameraLabel}(X ${x.toFixed(2)} ·`,
          `Y ${y.toFixed(2)} ·`,
          `Z ${z.toFixed(2)} )|`,
          `${fpsLabel} ${fps}`,
        ].join('  ');
      }
      statsStartedAt = timestamp;
      renderedFrames = 0;
    }
    context.renderer.render(context.scene, context.camera);
    deck.render(context.camera);
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
  window.addEventListener('resize', deck.resize);
  document.addEventListener('visibilitychange', syncAnimation);

  console.log('[Solar] 开始下载模型 (Voyager)……');
  options.onLoadStage?.('model');
  try {
    await voyager.ready;
    console.log('[Solar] 模型下载完成');
  } catch (err) {
    console.warn('[Solar] 模型下载失败，跳过 Voyager，继续初始化:', err);
  }

  const shadersBeganAt = performance.now();
  console.log('[Solar] 开始编译着色器……');
  options.onLoadStage?.('shaders');
  await context.renderer.compileAsync(context.scene, context.camera);
  const shadersTook = performance.now() - shadersBeganAt;
  console.log(`[Solar] 着色器编译完成 (实际耗时 ${Math.round(shadersTook)}ms)`);
  if (!options.warmed && shadersTook < 800) {
    const pad = 800 - shadersTook;
    await new Promise((r) => window.setTimeout(r, pad));
  }

  console.log('[Solar] 加载完成，准备启动渲染循环');
  options.onLoadStage?.('ready');
  syncAnimation();

  return () => {
    disposed = true;
    syncAnimation();
    resetButton?.removeEventListener('click', resetView);
    context.controls.removeEventListener('start', stopVoyagerTracking);
    window.removeEventListener('resize', context.resize);
    window.removeEventListener('resize', deck.resize);
    document.removeEventListener('visibilitychange', syncAnimation);
    interactions.dispose();
    window.removeEventListener('solar-flight-mode-change', setFlightMode);
    flightControls.dispose();
    voyager.dispose();
    speeder.dispose();
    deck.dispose();
    celestialObjects.dispose();
    timer.dispose();
    context.dispose();
  };
}
