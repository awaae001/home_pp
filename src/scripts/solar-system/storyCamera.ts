import * as THREE from 'three';
import type { ObservationDeck, WalkPath } from './observationDeck';

const DESKTOP_BREAKPOINT = 768;
const FOLLOW_RATE = 5;
/** 进舱以后跟得更紧 */
const INSIDE_FOLLOW_RATE = 10;

const SUN = new THREE.Vector3(0, 0, 0);
const PANORAMA = new THREE.Vector3(-8, 6, 19);
const PANORAMA_TARGET = { desktop: new THREE.Vector3(-11, 3, 1), mobile: SUN };
/** 关于我：从斜上方贴近太阳，抬高一点避开行星和小行星带 */
const ABOUT_POSITION = new THREE.Vector3(0.18, 0.55, 0.95).normalize().multiplyScalar(2.2).add(new THREE.Vector3(0, -0.5, 0));
/** 太阳中心在画面里的位置（NDC）：放到画面外，只露出边缘——桌面占左边约 40%，手机占上面约 40% */
const ABOUT_SCREEN = { desktop: [-1.52, 0], mobile: [0, 2] } as const;
/** 倒退距离：第 2 镜窗棂入画，第 3 镜看到地板 */
const PULLBACK = 0.5;
const PULLBACK_FAR = 1;
const WINDOW_GAP = 0.1;
const PANE_DISTANCE = PULLBACK - WINDOW_GAP;
const FINAL_DISTANCE = PULLBACK_FAR - WINDOW_GAP;
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
  /** 男人从起点走了多远（世界单位） */
  readonly walk: number;
  /** 飞船从窗外飞过的进度 0~1 */
  readonly fly: number;
}

export interface StoryCamera {
  /**
   * progress：0 全景 → 1 关于我 → 2 倒退进舱内 → 3 继续往后收，看到地板
   * → 3 + walkScreens 男人走进画面，舱往左挪，对面走来另一个他擦肩而过
   * → 3 + walkScreens + flyScreens 飞船从窗外飞过，他接着往前走
   */
  readonly update: (progress: number, delta: number, walkScreens: number, flyScreens: number) => StoryFrame;
}

const FORWARD = new THREE.Vector3(0, 0, -1);
const BACKWARD = new THREE.Vector3(0, 0, 1);

export function createStoryCamera(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  deck: ObservationDeck,
): StoryCamera {
  const aboutRotation = new THREE.Quaternion();
  const panoramaRotation = new THREE.Quaternion();
  const pullbackAxis = new THREE.Vector3();
  const wantPosition = new THREE.Vector3();
  const wantRotation = new THREE.Quaternion();
  const offset = new THREE.Vector3();
  let sunDepth = 0;
  let path: WalkPath = { enter: 0, follow: 0, meet: 0, onward: 0 };
  let walk = 0;
  let fly = 0;
  let lastKind: keyof typeof ABOUT_SCREEN | undefined;
  let lastProjectionX = 0;
  let lastProjectionY = 0;

  const layout = (kind: keyof typeof ABOUT_SCREEN, tanH: number, tanV: number): void => {
    const [sx, sy] = ABOUT_SCREEN[kind];
    const look = new THREE.Matrix4();
    const sunInCamera = new THREE.Vector3(sx * tanH, sy * tanV, -1).normalize();

    // 先看向太阳，再把太阳移到指定的屏幕位置。
    aboutRotation
      .setFromRotationMatrix(look.lookAt(ABOUT_POSITION, SUN, camera.up))
      .multiply(new THREE.Quaternion().setFromUnitVectors(sunInCamera, FORWARD));
    panoramaRotation.setFromRotationMatrix(look.lookAt(PANORAMA, PANORAMA_TARGET[kind], camera.up));
    pullbackAxis.copy(BACKWARD).applyQuaternion(aboutRotation);
    sunDepth = offset.subVectors(ABOUT_POSITION, SUN).dot(pullbackAxis);

    // 窗棂按第 2 镜取景，地板高度按第 3 镜取景。
    path = deck.place(offset.copy(ABOUT_POSITION).addScaledVector(pullbackAxis, WINDOW_GAP), aboutRotation, {
      tanH,
      tanV,
      paneDistance: PANE_DISTANCE,
      finalDistance: FINAL_DISTANCE,
      floorNdc: FLOOR_NDC,
    });
  };

  return {
    update: (progress, delta, walkScreens, flyScreens) => {
      const kind = window.innerWidth >= DESKTOP_BREAKPOINT ? 'desktop' : 'mobile';
      const projection = camera.projectionMatrix.elements;
      const projectionX = projection[0];
      const projectionY = projection[5];
      if (kind !== lastKind || projectionX !== lastProjectionX || projectionY !== lastProjectionY) {
        lastKind = kind;
        lastProjectionX = projectionX;
        lastProjectionY = projectionY;
        // 投影矩阵的缩放倒数，就是单位深度下的半宽和半高。
        layout(kind, 1 / projectionX, 1 / projectionY);
      }

      if (progress <= 1) {
        const t = ease(progress);
        wantPosition.lerpVectors(PANORAMA, ABOUT_POSITION, t);
        wantRotation.slerpQuaternions(panoramaRotation, aboutRotation, t);
      } else {
        // 沿视线倒退，1 → 3 一条缓动，中点正好是 PULLBACK
        const back = ease((progress - 1) / 2) * PULLBACK_FAR;
        wantPosition.copy(ABOUT_POSITION).addScaledVector(pullbackAxis, back);
        wantRotation.copy(aboutRotation);
      }

      // 滚多少走多少，带一点平滑
      const follow = 1 - Math.exp(-(progress > 1 ? INSIDE_FOLLOW_RATE : FOLLOW_RATE) * delta);
      const flyGoal = THREE.MathUtils.clamp((progress - 3 - walkScreens) / flyScreens, 0, 1);
      // 飞船飞过时他接着往前走
      const walkGoal = THREE.MathUtils.clamp((progress - 3) / walkScreens, 0, 1) * (path.enter + path.follow + path.meet)
        + flyGoal * path.onward;
      walk = Math.abs(walkGoal - walk) < 1e-5 ? walkGoal : THREE.MathUtils.lerp(walk, walkGoal, follow);
      fly = Math.abs(flyGoal - fly) < 1e-5 ? flyGoal : THREE.MathUtils.lerp(fly, flyGoal, follow);

      camera.position.lerp(wantPosition, follow);
      camera.quaternion.slerp(wantRotation, follow);
      // 同步 OrbitControls 的 target，切回星图时不跳
      target.copy(FORWARD).applyQuaternion(camera.quaternion)
        .multiplyScalar(camera.position.length())
        .add(camera.position);

      // 镜头离倒退中轴线有多远：还在从全景飞过来的路上时，不显示窗框也不缩放
      offset.subVectors(camera.position, ABOUT_POSITION);
      const back = offset.dot(pullbackAxis);
      const inside = progress > 1 && back > 1e-3
        && offset.addScaledVector(pullbackAxis, -back).lengthSq() < 0.02 ** 2;

      return {
        inside,
        glass: inside ? THREE.MathUtils.clamp((back - WINDOW_GAP) / PANE_DISTANCE, 0, 1) : 0,
        walk,
        fly,
        moving: walk !== walkGoal || fly !== flyGoal
          || camera.position.distanceToSquared(wantPosition) > 1e-6
          || 1 - Math.abs(camera.quaternion.dot(wantRotation)) > 1e-7,
        zoom: inside ? sunDepth / (sunDepth + back) : 1,
      };
    },
  };
}
