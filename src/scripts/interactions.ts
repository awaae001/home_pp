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

export class InteractionManager {
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly camera: THREE.Camera;
  private readonly canvas: HTMLCanvasElement;
  private readonly objects: THREE.Object3D[];
  private readonly targetByObject = new Map<THREE.Object3D, InteractiveTarget>();
  private readonly tooltip: HTMLDivElement;
  private hoveredTarget: InteractiveTarget | null = null;

  constructor(options: InteractionManagerOptions) {
    this.camera = options.camera;
    this.canvas = options.canvas;
    this.objects = options.targets.map(({ object }) => object);
    this.raycaster.params.Line = { threshold: options.lineThreshold ?? 1.5 };
    this.raycaster.far = options.maxDistance ?? Infinity;

    for (const target of options.targets) {
      this.targetByObject.set(target.object, target);
    }

    this.tooltip = document.createElement('div');
    this.tooltip.className = 'solar-tooltip';
    this.tooltip.hidden = true;
    document.body.appendChild(this.tooltip);

    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerleave', this.onPointerLeave);
    this.canvas.addEventListener('click', this.onClick);
  }

  public dispose(): void {
    this.resetHover();
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.canvas.removeEventListener('click', this.onClick);
    this.tooltip.remove();
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    const target = this.pickTarget(event);

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
      this.tooltip.style.left = `${event.clientX + 15}px`;
      this.tooltip.style.top = `${event.clientY + 15}px`;
    }
  };

  private readonly onPointerLeave = (): void => {
    this.resetHover();
  };

  private readonly onClick = (event: MouseEvent): void => {
    this.pickTarget(event)?.activate?.();
  };

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
