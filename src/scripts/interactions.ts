import * as THREE from 'three';

export interface InteractiveTarget {
  readonly object: THREE.Object3D;
  readonly tooltip: string;
  readonly priority?: number;
  readonly activate?: () => void;
  readonly setHovered?: (hovered: boolean) => void;
}

export interface InteractionManagerOptions {
  readonly camera: THREE.Camera;
  readonly canvas: HTMLCanvasElement;
  readonly targets: readonly InteractiveTarget[];
  readonly lineThreshold?: number;
  readonly maxDistance?: number;
}

export class InteractionManager implements EventListenerObject {
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly camera: THREE.Camera;
  private readonly canvas: HTMLCanvasElement;
  private readonly objects: THREE.Object3D[];
  private readonly targetByObject: Map<THREE.Object3D, InteractiveTarget>;
  private readonly tooltip: HTMLDivElement;
  private hoveredTarget: InteractiveTarget | null = null;

  constructor(options: InteractionManagerOptions) {
    this.camera = options.camera;
    this.canvas = options.canvas;
    this.objects = options.targets.map(({ object }) => object);
    this.targetByObject = new Map(options.targets.map((target) => [target.object, target]));
    this.raycaster.params.Line = { threshold: options.lineThreshold ?? 1.5 };
    this.raycaster.far = options.maxDistance ?? Infinity;

    this.tooltip = document.createElement('div');
    this.tooltip.className = 'solar-tooltip';
    this.tooltip.hidden = true;
    document.body.appendChild(this.tooltip);

    this.canvas.addEventListener('pointermove', this);
    this.canvas.addEventListener('pointerleave', this);
    this.canvas.addEventListener('click', this);
  }

  public dispose(): void {
    this.resetHover();
    this.canvas.removeEventListener('pointermove', this);
    this.canvas.removeEventListener('pointerleave', this);
    this.canvas.removeEventListener('click', this);
    this.tooltip.remove();
  }

  public handleEvent(event: Event): void {
    if (event.type === 'pointerleave') {
      this.resetHover();
      return;
    }

    const pointerEvent = event as MouseEvent;
    const target = this.pickTarget(pointerEvent);

    if (event.type === 'click') {
      target?.activate?.();
      return;
    }

    if (target !== this.hoveredTarget) {
      this.resetHover();
      this.hoveredTarget = target;

      if (target) {
        target.setHovered?.(true);
        this.canvas.style.cursor = 'pointer';
        this.tooltip.textContent = target.tooltip;
        this.tooltip.hidden = false;
      }
    }

    if (target) {
      this.tooltip.style.left = `${pointerEvent.clientX + 15}px`;
      this.tooltip.style.top = `${pointerEvent.clientY + 15}px`;
    }
  }

  private pickTarget(event: MouseEvent | PointerEvent): InteractiveTarget | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return null;
    }

    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const intersections = this.raycaster.intersectObjects(this.objects, true);

    let selected: InteractiveTarget | null = null;

    for (const intersection of intersections) {
      let object: THREE.Object3D | null = intersection.object;
      while (object) {
        const target = this.targetByObject.get(object);
        if (target) {
          if (!selected || (target.priority ?? 0) > (selected.priority ?? 0)) {
            selected = target;
          }
          break;
        }
        object = object.parent;
      }
    }

    return selected;
  }

  private resetHover(): void {
    this.hoveredTarget?.setHovered?.(false);
    this.hoveredTarget = null;
    this.canvas.style.cursor = '';
    this.tooltip.hidden = true;
  }
}
