import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const FLIGHT_SPEED = 12;
const FOV_STEP = 5;
const MIN_FOV = 30;
const MAX_FOV = 100;

export interface FlightControlsOptions {
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly isEnabled: () => boolean;
  readonly onFovChange?: (fov: number) => void;
}

/** Keyboard flight layered over OrbitControls' pointer-based look controls. */
export class FlightControls {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly isEnabled: () => boolean;
  private readonly onFovChange?: (fov: number) => void;
  private readonly pressedKeys = new Set<string>();
  private flightEnabled = false;
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly movement = new THREE.Vector3();

  public constructor(options: FlightControlsOptions) {
    this.camera = options.camera;
    this.controls = options.controls;
    this.isEnabled = options.isEnabled;
    this.onFovChange = options.onFovChange;

    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.clearPressedKeys);
  }

  public setEnabled(enabled: boolean): void {
    this.flightEnabled = enabled;
    if (!enabled) {
      this.clearPressedKeys();
    }
  }

  public update(delta: number): void {
    if (!this.flightEnabled || !this.isEnabled() || this.pressedKeys.size === 0) {
      return;
    }

    this.camera.getWorldDirection(this.forward);
    this.forward.normalize();
    this.right.crossVectors(this.forward, this.camera.up).normalize();
    this.movement.set(0, 0, 0);

    if (this.pressedKeys.has('KeyW')) this.movement.add(this.forward);
    if (this.pressedKeys.has('KeyS')) this.movement.sub(this.forward);
    if (this.pressedKeys.has('KeyD')) this.movement.add(this.right);
    if (this.pressedKeys.has('KeyA')) this.movement.sub(this.right);
    if (this.pressedKeys.has('ShiftLeft') || this.pressedKeys.has('ShiftRight')) {
      this.movement.y += 1;
    }
    if (this.pressedKeys.has('ControlLeft') || this.pressedKeys.has('ControlRight')) {
      this.movement.y -= 1;
    }

    if (this.movement.lengthSq() === 0) {
      return;
    }

    this.movement.normalize().multiplyScalar(FLIGHT_SPEED * delta);
    this.camera.position.add(this.movement);
    this.controls.target.add(this.movement);
  }

  public dispose(): void {
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.clearPressedKeys);
    this.clearPressedKeys();
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.flightEnabled || !this.isEnabled() || this.isTyping(event.target)) {
      return;
    }

    if (event.code === 'BracketLeft' || event.code === 'BracketRight') {
      event.preventDefault();
      if (!event.repeat) {
        this.changeFov(event.code === 'BracketLeft' ? -FOV_STEP : FOV_STEP);
      }
      return;
    }

    if (this.isFlightKey(event.code)) {
      event.preventDefault();
      this.pressedKeys.add(event.code);
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (this.isFlightKey(event.code)) {
      this.pressedKeys.delete(event.code);
    }
  };

  private readonly clearPressedKeys = (): void => {
    this.pressedKeys.clear();
  };

  private changeFov(amount: number): void {
    this.camera.fov = THREE.MathUtils.clamp(this.camera.fov + amount, MIN_FOV, MAX_FOV);
    this.camera.updateProjectionMatrix();
    this.onFovChange?.(this.camera.fov);
  }

  private isFlightKey(code: string): boolean {
    return [
      'KeyW', 'KeyA', 'KeyS', 'KeyD',
      'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight',
    ].includes(code);
  }

  private isTyping(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
  }
}
