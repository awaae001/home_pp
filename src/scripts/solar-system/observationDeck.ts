import * as THREE from 'three';
import { disposeObject } from './dispose';
import { createWalker } from './walker';

/*
 * 星舰观景窗。局部坐标：原点在窗口中心，+z 朝窗外，舱内往 -z。
 * 一整面玻璃幕墙，镜头里只看到其中一扇：两根细窗棂贴着画面两边，
 * 窗棂外面还是星空，往外每隔一扇再来一根，上下都伸出画面。
 * 单独画在一层画布上，这样窗外的星空可以模糊，玻璃上的东西保持清晰。
 */

/** 窗棂在第 2 镜里的位置（占半屏宽的比例） */
const POST_NDC = 0.92;
/** 窗棂高度超出画面多少 */
const OVERSIZE = 3;
/** 窗棂宽度：按一扇半宽的比例 */
const POST_WIDTH = 0.012;
/** 左右各再铺几扇 */
const PANES = 8;

/** 地板往舱内铺多深、地砖多宽：按一扇半宽的比例 */
const FLOOR_DEPTH = 6;
const TILE = 0.5;
/** 窗外的冷光：光带从窗脚往舱里伸多长（到第一格地砖前） */
const LIGHT_LENGTH = TILE * 0.9;

const COLORS = {
  floor: 0x121821,
  seam: 0x000000,
  light: 0xdce8ff,
  post: 0x2a3444,
  red: 0xff3d2e,
  scratch: 0xc8d4e6,
} as const;

/** 玻璃上的划痕：[x, y, 长度, 角度]，坐标按一扇的半宽/半高归一化 */
const SCRATCHES: readonly (readonly [number, number, number, number])[] = [
  [-0.62, 0.48, 0.22, 0.35],
  [-0.55, 0.43, 0.12, 0.42],
  [0.34, -0.38, 0.3, -0.18],
  [0.41, -0.46, 0.08, -0.1],
  [0.7, 0.62, 0.16, 1.2],
  [-0.2, -0.72, 0.18, 0.08],
  [0.08, 0.3, 0.06, 2.4],
];

const flat = (color: number) => new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });

/** 平铺在地板上的一层：坐标 (x, v)，v 是离窗脚往舱里的距离 */
function floorLayer(shapes: THREE.Shape[], color: number, order: number, opacity = 1): THREE.Mesh {
  const material = flat(color);
  material.depthTest = false;
  material.transparent = opacity < 1;
  material.opacity = opacity;
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shapes), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = order;
  return mesh;
}

const rect = (left: number, bottom: number, right: number, top: number): THREE.Shape => (
  new THREE.Shape([
    new THREE.Vector2(left, bottom),
    new THREE.Vector2(right, bottom),
    new THREE.Vector2(right, top),
    new THREE.Vector2(left, top),
  ])
);

/** 以一扇窗的半宽为 1，铺地板、冷白光带和砖缝。 */
function createFloor(): THREE.Group {
  const span = PANES * 2;
  const seam = POST_WIDTH * 0.6;
  const seams: THREE.Shape[] = [];
  for (let x = -span; x <= span; x += TILE) {
    seams.push(rect(x - seam, 0, x + seam, FLOOR_DEPTH));
  }
  for (let v = TILE; v < FLOOR_DEPTH; v += TILE) {
    seams.push(rect(-span, v - seam, span, v + seam));
  }

  return new THREE.Group().add(
    floorLayer([rect(-span, 0, span, FLOOR_DEPTH)], COLORS.floor, 0),
    floorLayer([rect(-span, 0, span, LIGHT_LENGTH)], COLORS.light, 1, 0.06),
    floorLayer(seams, COLORS.seam, 2, 0.45),
  );
}

function createWindow() {
  const shapes = Array.from({ length: PANES * 2 }, (_, i) => {
    const x = 2 * (i - PANES) + 1;
    return rect(x - POST_WIDTH / 2, 0, x + POST_WIDTH / 2, 1);
  });
  const posts = new THREE.Mesh(new THREE.ShapeGeometry(shapes), flat(COLORS.post));
  const floor = createFloor();

  const scratchMaterial = new THREE.MeshBasicMaterial({
    color: COLORS.scratch,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });
  const scratches = SCRATCHES.map(([, , length, angle]) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(length, POST_WIDTH * 0.12), scratchMaterial);
    mesh.rotation.z = angle;
    return mesh;
  });
  // 窗棂上的红色刻度：每隔一根窗棂一个（x = -1, 3, -5, 7 …）
  const ticks = Array.from({ length: PANES }, (_, i) => {
    const x = 4 * (i - Math.floor(PANES / 2)) - 1;
    return rect(x - POST_WIDTH * 2.5, -POST_WIDTH * 0.4, x + POST_WIDTH * 2.5, POST_WIDTH * 0.4);
  });
  const tick = new THREE.Mesh(new THREE.ShapeGeometry(ticks), flat(COLORS.red));
  const object = new THREE.Group().add(posts, floor, ...scratches, tick);

  return {
    object,
    layout: (halfW: number, halfH: number, floorY: number): void => {
      const w = halfW * POST_NDC;
      posts.scale.set(w, halfH * OVERSIZE - floorY, 1);
      posts.position.y = floor.position.y = floorY;
      floor.scale.set(w, 1, w);

      // 划痕等比缩放，窗口比例变了也不改变划痕角度。
      scratches.forEach((mesh, i) => {
        const [x, y] = SCRATCHES[i];
        mesh.position.set(x * w, y * halfH, 0);
        mesh.scale.setScalar(w);
      });
      tick.position.set(0, halfH * 0.55, -w * POST_WIDTH * 0.01);
      tick.scale.setScalar(w);
    },
  };
}

const FLIP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

/** 男人站在离镜头多远（占最终镜头到窗口距离的比例）、多高（占画面高度）、停在画面哪里（NDC x） */
const MAN_DEPTH = 0.66;
const MAN_HEIGHT = 0.55;
const MAN_STOP = -0.45;
/** 舱往左挪多远（占半屏宽） */
const MAN_FOLLOW = 2;
/** 舱挪动时男人比窗户快一点，最后停在这里（NDC x） */
const MAN_END = 0.4;
/** 跟拍结束后舱接着往左挪多远（占半屏宽），他钉在画面右边继续走 */
const MEET_SHIFT = 1.5;
/** 飞船飞过时他接着往前走，舱接着往左挪多远（占半屏宽），速度和前面差不多 */
const ONWARD_SHIFT = 1.8;
/** 对面的人和他同时出发、同样步速，在这一段的这个位置擦肩而过 */
const PASS_AT = 0.3;
/** 对面的人比他离窗户近一点（占他到镜头距离的比例），擦肩时在他身后 */
const OTHER_BEHIND = 0.1;

/** 跟拍结束时玻璃往左挪了多少（NDC），用来摆后面玻璃上的字 */
export const GLASS_FOLLOW_SHIFT = MAN_FOLLOW * MAN_DEPTH;

export interface DeckLayout {
  readonly tanH: number;
  readonly tanV: number;
  readonly paneDistance: number;
  readonly finalDistance: number;
  readonly floorNdc: number;
}

/** 世界单位：enter 走进画面，follow 舱往左挪，meet 对面的人走来擦肩而过，onward 飞船飞过时接着走 */
export interface WalkPath {
  readonly enter: number;
  readonly follow: number;
  readonly meet: number;
  readonly onward: number;
}

export interface ObservationDeck {
  /** 摆好窗口和男人，返回他要走的路线 */
  readonly place: (center: THREE.Vector3, rotation: THREE.Quaternion, layout: DeckLayout) => WalkPath;
  readonly setVisible: (visible: boolean) => void;
  /** 从起点走了多远（世界单位），返回玻璃往左挪了多少（NDC） */
  readonly walk: (distance: number) => number;
  readonly render: (camera: THREE.Camera) => void;
  readonly resize: () => void;
  readonly dispose: () => void;
}

export function createObservationDeck(canvas: HTMLCanvasElement): ObservationDeck {
  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  const root = new THREE.Group();
  // 窗户、地板、男人一起往左挪，窗外不动
  const track = new THREE.Group();
  const room = createWindow();
  const walker = createWalker();
  const other = createWalker();
  root.visible = false;
  track.add(room.object, walker.object, other.object);
  root.add(track);
  scene.add(root);
  let drawn = false;
  let enterLength = 0;
  let followLength = 0;
  let driftLength = 0;
  let meetLength = 0;
  let onwardLength = 0;
  let glassHalfWidth = 1;

  const resize = (): void => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight, false);
    drawn = false;
  };
  resize();

  return {
    place: (center, rotation, { tanH, tanV, paneDistance, finalDistance, floorNdc }) => {
      const floorY = finalDistance * tanV * floorNdc;
      glassHalfWidth = finalDistance * tanH;
      room.layout(paneDistance * tanH, paneDistance * tanV, floorY);

      // 局部 x 和画面左右是反的（窗口绕 y 转了半圈）
      const distance = finalDistance * MAN_DEPTH;
      const height = MAN_HEIGHT * 2 * distance * tanV;
      const halfWidth = distance * tanH;
      const fromX = halfWidth + walker.strideFor(height);
      const stopX = -MAN_STOP * halfWidth;
      const enter = fromX - stopX;
      const follow = MAN_FOLLOW * halfWidth;
      enterLength = enter;
      followLength = follow;
      driftLength = (MAN_END - MAN_STOP) * halfWidth;

      meetLength = MEET_SHIFT * halfWidth;
      onwardLength = ONWARD_SHIFT * halfWidth;
      const total = enter + follow + meetLength;

      const z = -(finalDistance - distance);
      const toX = stopX - follow - driftLength - meetLength - onwardLength;
      walker.setStage({ floorY, z, height, fromX, toX });
      // 对面的人从开头就在走：倒推出发点，让他在 PASS_AT 正好走到他身边
      const passX = toX + onwardLength + (1 - PASS_AT) * meetLength;
      const otherFrom = passX - (enter + follow + PASS_AT * meetLength);
      other.setStage({ floorY, z: z + OTHER_BEHIND * distance, height, fromX: otherFrom, toX: otherFrom + total });
      root.position.copy(center);
      // 相机看 -z，窗口的 +z 要朝窗外，所以绕 y 转半圈
      root.quaternion.copy(rotation).multiply(FLIP);
      return { enter, follow, meet: meetLength, onward: onwardLength };
    },
    setVisible: (visible) => {
      root.visible = visible;
    },
    walk: (distance) => {
      // 局部 +x 是画面左边；舱挪多少他就多走多少，再加一点领先量，领先量两头都缓
      const total = enterLength + followLength + meetLength;
      const t = THREE.MathUtils.clamp((distance - enterLength) / followLength, 0, 1);
      track.position.x = THREE.MathUtils.clamp(distance - enterLength, 0, followLength + meetLength + onwardLength);
      const walked = Math.min(distance, enterLength) + track.position.x + driftLength * t * t * (3 - 2 * t);
      walker.update(walked / (total + onwardLength + driftLength));
      other.update(THREE.MathUtils.clamp(distance / total, 0, 1));
      return track.position.x / glassHalfWidth;
    },
    render: (camera) => {
      // 不显示时清一次就够了
      if (!root.visible && !drawn) {
        return;
      }
      renderer.render(scene, camera);
      drawn = root.visible;
    },
    resize,
    dispose: () => {
      walker.dispose();
      other.dispose();
      disposeObject(room.object);
      renderer.dispose();
    },
  };
}
