import * as THREE from 'three';
import type { PlanetConfig } from './planets';

export class InteractionManager {
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private camera: THREE.Camera;
  private planets: THREE.Mesh[];
  private hoveredPlanet: THREE.Mesh | null = null;
  private canvas: HTMLCanvasElement;
  private tooltip: HTMLDivElement;

  constructor(camera: THREE.Camera, planets: THREE.Mesh[], canvas: HTMLCanvasElement) {
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.camera = camera;
    this.planets = planets;
    this.canvas = canvas;

    this.tooltip = document.createElement('div');
    this.tooltip.style.position = 'fixed';
    this.tooltip.style.padding = '8px 12px';
    this.tooltip.style.background = 'rgba(0, 0, 0, 0.8)';
    this.tooltip.style.color = 'white';
    this.tooltip.style.borderRadius = '6px';
    this.tooltip.style.fontSize = '14px';
    this.tooltip.style.pointerEvents = 'none';
    this.tooltip.style.zIndex = '1000';
    this.tooltip.style.display = 'none';
    this.tooltip.style.backdropFilter = 'blur(4px)';
    this.tooltip.style.border = '1px solid rgba(255, 255, 255, 0.2)';
    document.body.appendChild(this.tooltip);

    this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.canvas.addEventListener('click', this.onClick.bind(this));
  }

  private onMouseMove(event: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.planets);

    if (intersects.length > 0) {
      const planet = intersects[0].object as THREE.Mesh;
      if (this.hoveredPlanet !== planet) {
        this.resetHover();
        this.hoveredPlanet = planet;
        planet.scale.setScalar(1.2);
        this.canvas.style.cursor = 'pointer';

        const config = planet.userData.config as PlanetConfig;
        this.tooltip.textContent = `${config.name} - ${config.url}`;
        this.tooltip.style.display = 'block';
      }

      this.tooltip.style.left = `${event.clientX + 15}px`;
      this.tooltip.style.top = `${event.clientY + 15}px`;
    } else {
      this.resetHover();
    }
  }

  private onClick(event: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.planets);

    if (intersects.length > 0) {
      const planet = intersects[0].object as THREE.Mesh;
      const config = planet.userData.config as PlanetConfig;
      if (config.external) {
        window.open(config.url, '_blank');
      } else {
        window.location.href = config.url;
      }
    }
  }

  private resetHover() {
    if (this.hoveredPlanet) {
      this.hoveredPlanet.scale.setScalar(1);
      this.hoveredPlanet = null;
      this.canvas.style.cursor = 'default';
      this.tooltip.style.display = 'none';
    }
  }

  public dispose() {
    this.canvas.removeEventListener('mousemove', this.onMouseMove.bind(this));
    this.canvas.removeEventListener('click', this.onClick.bind(this));
    if (this.tooltip.parentNode) {
      this.tooltip.parentNode.removeChild(this.tooltip);
    }
  }
}
