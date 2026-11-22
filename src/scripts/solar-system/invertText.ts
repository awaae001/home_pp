import * as THREE from 'three';
import { SUN_RADIUS } from './celestialObjects';

/** 太阳在画面上一个方向的中心和半径（像素）：a 是相机空间里这个方向的坐标，depth 是到镜头的深度 */
function sunSpan(a: number, depth: number, tanHalf: number, size: number): [center: number, radius: number] {
  const theta = Math.atan2(a, depth);
  const spread = Math.asin(Math.min(SUN_RADIUS / Math.hypot(a, depth), 1));
  const low = Math.tan(theta - spread) / tanHalf;
  const high = Math.tan(theta + spread) / tanHalf;
  return [((low + high) / 2 + 1) / 2 * size, (high - low) / 4 * size];
}

/** 太阳在画面上的椭圆（像素），太阳在镜头后面时返回 undefined */
function sunOnScreen(camera: THREE.PerspectiveCamera): [x: number, y: number, rx: number, ry: number] | undefined {
  camera.updateMatrixWorld();
  const sun = new THREE.Vector3().applyMatrix4(camera.matrixWorldInverse);
  if (sun.z > -SUN_RADIUS) {
    return undefined;
  }
  const projection = camera.projectionMatrix.elements;
  const [x, rx] = sunSpan(sun.x, -sun.z, 1 / projection[0], window.innerWidth);
  const [y, ry] = sunSpan(-sun.y, -sun.z, 1 / projection[5], window.innerHeight);
  return [x, y, rx, ry];
}

export interface InvertText {
  readonly update: (camera: THREE.PerspectiveCamera) => void;
}

/** 文字压在太阳上的部分变黑：把太阳的椭圆换算到每段文字自己的坐标里，写进 --sun */
export function createInvertText(texts: Iterable<HTMLElement>): InvertText {
  const list = [...texts];
  return {
    update: (camera) => {
      const sun = sunOnScreen(camera);
      for (const text of list) {
        const rect = text.getBoundingClientRect();
        if (!sun || rect.width === 0) {
          text.style.removeProperty('--sun');
          continue;
        }
        // 文字可能被缩放（倒退时卡片跟着太阳变小），换回它自己的像素
        const k = text.offsetWidth / rect.width;
        const [x, y, rx, ry] = sun;
        text.style.setProperty('--sun', `${rx * k}px ${ry * k}px at ${(x - rect.left) * k}px ${(y - rect.top) * k}px`);
      }
    },
  };
}
