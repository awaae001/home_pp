import * as THREE from 'three';
import type { ObservationDeck } from './observationDeck';

const DESKTOP_BREAKPOINT = 768;
const FOLLOW_RATE = 5;

const SUN = new THREE.Vector3(0, 0, 0);
const PANORAMA = new THREE.Vector3(-8, 6, 19);
const PANORAMA_TARGET = { desktop: new THREE.Vector3(-11, 3, 1), mobile: SUN };
/** 关于我：从斜上方贴近太阳，抬高一点避开行星和小行星带 */
const ABOUT_POSITION = new THREE.Vector3(0.18, 0.55, 0.95).normalize().multiplyScalar(2.2).add(new THREE.Vector3(0, -0.5, 0));
/** 太阳中心在画面里的位置（NDC）：放到画面外，只露出边缘——桌面占左边约 40%，手机占上面约 40% */
const ABOUT_SCREEN = { desktop: [-1.52, 0], mobile: [0, 2] } as const;
/** 沿视线倒退的距离：第 2 镜窗棂入画，第 3 镜继续往后收、地板入画；窗口平面在第 1 镜身后多远 */
const PULLBACK = 0.5;
const PULLBACK_FAR = 1;
const WINDOW_GAP = 0.1;
/** 第 3 镜里地板和窗脚的交线在画面上的高度（NDC） */
const FLOOR_NDC = -0.6;

const ease = (t: number): number => {
  const c = THREE.MathUtils.clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};

export interface StoryFrame {
  /** 镜头是否仍在移动 */
  readonly moving: boolean;
  /** 太阳所在平面的缩放（倒退时 < 1），用来让文字跟着太阳一起变小 */
  readonly zoom: number;
  /** 镜头已经在倒退线上，可以显示窗框 */
  readonly inside: boolean;
  /** 镜头退到玻璃后面的程度 0~1，用来淡入玻璃模糊 */
  readonly glass: number;
}

export interface StoryCamera {
  /** progress：0 全景 → 1 关于我 → 2 倒退进舱内 → 3 继续往后收，看到地板 */
  readonly update: (progress: number, delta: number) => StoryFrame;
}

const FORWARD = new THREE.Vector3(0, 0, -1);

/** 相机看向 target 时的朝向（世界坐标 up） */
function lookRotation(from: THREE.Vector3, to: THREE.Vector3, up: THREE.Vector3): THREE.Quaternion {
  const matrix = new THREE.Matrix4().lookAt(from, to, up);
  return new THREE.Quaternion().setFromRotationMatrix(matrix);
}

export function createStoryCamera(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  deck: ObservationDeck,
): StoryCamera {
  const aboutRotation = new THREE.Quaternion();
  const view = new THREE.Vector3();
  const wantPosition = new THREE.Vector3();
  const wantRotation = new THREE.Quaternion();
  const toSun = new THREE.Vector3();
  const offset = new THREE.Vector3();
  let panoramaRotation = new THREE.Quaternion();
  let layout = '';

  // 第 1 镜：先正对太阳，再在相机自身坐标里转一下，让太阳中心落在 screen 位置
  const aimAbout = (kind: 'desktop' | 'mobile'): void => {
    const [sx, sy] = ABOUT_SCREEN[kind];
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const tanH = tanV * camera.aspect;
    const sunInCamera = new THREE.Vector3(sx * tanH, sy * tanV, -1).normalize();
    aboutRotation
      .copy(lookRotation(ABOUT_POSITION, SUN, camera.up))
      .multiply(new THREE.Quaternion().setFromUnitVectors(sunInCamera, FORWARD));
    view.copy(FORWARD).applyQuaternion(aboutRotation);
    panoramaRotation = lookRotation(PANORAMA, PANORAMA_TARGET[kind], camera.up);

    // 窗框放在倒退路线上，宽度按屏幕比例算，退到底时窗框正好贴近左右两边
    deck.place(ABOUT_POSITION.clone().addScaledVector(view, -WINDOW_GAP), aboutRotation, {
      tanH,
      tanV,
      paneDistance: PULLBACK - WINDOW_GAP,
      finalDistance: PULLBACK_FAR - WINDOW_GAP,
      floorNdc: FLOOR_NDC,
    });
  };

  return {
    update: (progress, delta) => {
      const kind = window.innerWidth >= DESKTOP_BREAKPOINT ? 'desktop' : 'mobile';
      const nextLayout = `${kind}:${camera.aspect.toFixed(3)}`;
      if (nextLayout !== layout) {
        layout = nextLayout;
        aimAbout(kind);
      }

      if (progress <= 1) {
        const t = ease(progress);
        wantPosition.lerpVectors(PANORAMA, ABOUT_POSITION, t);
        wantRotation.slerpQuaternions(panoramaRotation, aboutRotation, t);
      } else {
        // 纯粹沿视线倒退：画面以中心为原点整体缩小
        const back = progress <= 2
          ? ease(progress - 1) * PULLBACK
          : PULLBACK + ease(progress - 2) * (PULLBACK_FAR - PULLBACK);
        wantPosition.copy(ABOUT_POSITION).addScaledVector(view, -back);
        wantRotation.copy(aboutRotation);
      }

      const follow = 1 - Math.exp(-FOLLOW_RATE * delta);
      camera.position.lerp(wantPosition, follow);
      camera.quaternion.slerp(wantRotation, follow);
      // 同步 OrbitControls 的 target，切回星图时不跳
      target.copy(FORWARD).applyQuaternion(camera.quaternion)
        .multiplyScalar(camera.position.length())
        .add(camera.position);

      // 镜头离倒退中轴线有多远：还在从全景飞过来的路上时，不显示窗框也不缩放
      offset.subVectors(camera.position, ABOUT_POSITION);
      const back = -offset.dot(view);
      const lateral = offset.addScaledVector(view, back).length();
      const inside = progress > 1 && back > 1e-3 && lateral < 0.02;

      const aboutDepth = toSun.subVectors(SUN, ABOUT_POSITION).dot(view);
      return {
        inside,
        glass: inside ? THREE.MathUtils.clamp((back - WINDOW_GAP) / (PULLBACK - WINDOW_GAP), 0, 1) : 0,
        moving: camera.position.distanceToSquared(wantPosition) > 1e-6
          || 1 - Math.abs(camera.quaternion.dot(wantRotation)) > 1e-7,
        zoom: inside ? aboutDepth / (aboutDepth + back) : 1,
      };
    },
  };
}
