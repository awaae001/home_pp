import * as THREE from 'three';
import { disposeObject } from './dispose';
import { createWalker } from './walker';

/*
 * 星舰观景窗。局部坐标：原点在窗口中心，+z 朝窗外，舱内往 -z。
 * 一整面玻璃幕墙，镜头里只看到其中一扇：两根细窗棂贴着画面两边，
 * 窗棂外面还是星空，往外每隔一扇再来一根，上下都伸出画面。
 * 单独画在一层画布上，这样窗外的星空可以模糊，玻璃上的东西保持清晰。
 */

/** 窗棂在最终画面里的位置（占半屏宽的比例） */
const POST_NDC = 0.92;
/** 窗棂高度超出画面多少 */
const OVERSIZE = 3;
/** 窗棂宽度：按一扇半宽的比例 */
const POST_WIDTH = 0.012;
/** 左右各再铺几扇 */
const PANES = 4;

/** 地板往舱内铺多深、地砖多宽：按一扇半宽的比例 */
const FLOOR_DEPTH = 6;
const TILE = 0.5;
/** 窗外的冷光：光带从窗脚往舱里伸多长 */
const LIGHT_LENGTH = 3.2;

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
function floorLayer(shapes: THREE.Shape[], color: number, order: number, floorY: number, opacity = 1): THREE.Mesh {
  const material = flat(color);
  material.depthTest = false;
  material.transparent = opacity < 1;
  material.opacity = opacity;
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shapes), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = floorY;
  mesh.renderOrder = order;
  return mesh;
}

const quad = (points: readonly [number, number][]): THREE.Shape => (
  new THREE.Shape(points.map(([x, v]) => new THREE.Vector2(x, v)))
);

/**
 * 舱内地板：深色底 + 窗脚一条很淡的冷白光带，
 * 最上面压一层半透明砖缝。
 */
function buildFloor(w: number, post: number, floorY: number): THREE.Group {
  const group = new THREE.Group();
  const span = w * PANES * 2;
  const depth = w * FLOOR_DEPTH;
  const seam = post * 0.6;

  const seams: THREE.Shape[] = [];
  for (let x = -span; x <= span; x += w * TILE) {
    seams.push(quad([[x - seam, 0], [x + seam, 0], [x + seam, depth], [x - seam, depth]]));
  }
  for (let v = w * TILE; v < depth; v += w * TILE) {
    seams.push(quad([[-span, v - seam], [span, v - seam], [span, v + seam], [-span, v + seam]]));
  }

  const length = w * LIGHT_LENGTH;
  const light = quad([[-span, 0], [span, 0], [span, length], [-span, length]]);

  group.add(
    floorLayer([quad([[-span, 0], [span, 0], [span, depth], [-span, depth]])], COLORS.floor, 0, floorY),
    floorLayer([light], COLORS.light, 1, floorY, 0.06),
    floorLayer(seams, COLORS.seam, 2, floorY, 0.45),
  );
  return group;
}

function buildWindow(halfW: number, halfH: number, floorY: number): THREE.Group {
  const group = new THREE.Group();
  const w = halfW * POST_NDC;
  const post = w * POST_WIDTH;
  const top = halfH * OVERSIZE;
  const bar = new THREE.PlaneGeometry(post, top - floorY);
  const material = flat(COLORS.post);

  for (let i = -PANES; i < PANES; i += 1) {
    const mullion = new THREE.Mesh(bar, material);
    mullion.position.set((2 * i + 1) * w, (top + floorY) / 2, 0);
    group.add(mullion);
  }

  group.add(buildFloor(w, post, floorY));

  const scratchMaterial = new THREE.MeshBasicMaterial({
    color: COLORS.scratch,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });
  for (const [x, y, length, angle] of SCRATCHES) {
    const scratch = new THREE.Mesh(new THREE.PlaneGeometry(length * w, post * 0.12), scratchMaterial);
    scratch.position.set(x * w, y * halfH, 0);
    scratch.rotation.z = angle;
    group.add(scratch);
  }

  // 窗棂上的红色刻度
  const tick = new THREE.Mesh(new THREE.PlaneGeometry(post * 5, post * 0.8), flat(COLORS.red));
  tick.position.set(-w, halfH * 0.55, -post * 0.01);
  group.add(tick);

  return group;
}

const FLIP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

/** 男人站在离镜头多远（占最终镜头到窗口距离的比例）、多高（占画面高度）、停在画面哪里（NDC x） */
const MAN_DEPTH = 0.66;
const MAN_HEIGHT = 0.55;
const MAN_STOP = -0.45;

export interface DeckLayout {
  readonly tanH: number;
  readonly tanV: number;
  readonly paneDistance: number;
  readonly finalDistance: number;
  readonly floorNdc: number;
}

export interface ObservationDeck {
  readonly place: (center: THREE.Vector3, rotation: THREE.Quaternion, layout: DeckLayout) => void;
  readonly setVisible: (visible: boolean) => void;
  readonly walk: (progress: number) => void;
  readonly render: (camera: THREE.Camera) => void;
  readonly resize: () => void;
  readonly dispose: () => void;
}

export function createObservationDeck(canvas: HTMLCanvasElement): ObservationDeck {
  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  const root = new THREE.Group();
  const room = new THREE.Group();
  const walker = createWalker();
  root.visible = false;
  root.add(room, walker.object);
  scene.add(root);
  let drawn = false;

  const resize = (): void => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight, false);
    drawn = false;
  };
  resize();

  return {
    place: (center, rotation, { tanH, tanV, paneDistance, finalDistance, floorNdc }) => {
      const floorY = finalDistance * tanV * floorNdc;
      disposeObject(room);
      room.clear();
      room.add(buildWindow(paneDistance * tanH, paneDistance * tanV, floorY));

      // 局部 x 和画面左右是反的（窗口绕 y 转了半圈）
      const distance = finalDistance * MAN_DEPTH;
      const height = MAN_HEIGHT * 2 * distance * tanV;
      const halfWidth = distance * tanH;
      walker.setStage({
        floorY,
        z: -(finalDistance - distance),
        height,
        fromX: halfWidth + walker.strideFor(height),
        toX: -MAN_STOP * halfWidth,
      });
      root.position.copy(center);
      // 相机看 -z，窗口的 +z 要朝窗外，所以绕 y 转半圈
      root.quaternion.copy(rotation).multiply(FLIP);
    },
    setVisible: (visible) => {
      root.visible = visible;
    },
    walk: walker.update,
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
      disposeObject(room);
      renderer.dispose();
    },
  };
}
