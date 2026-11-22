import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { disposeObject } from './dispose';

const MODEL_URL = '/models/craft_speederD.glb';
/** 模型机头朝 -z，长约 2 */
const SCALE = 0.08;
/** 绕太阳的圆轨道：在黄道面上，比第一颗行星（3）更靠里，避开镜头倒退的那条线 */
const ORBIT_RADIUS = 2.4;
/** 一圈约 20 秒，逆时针（从上往下看） */
const ANGULAR_SPEED = 0.3;

/**
 * 从窗外飞过的路线（桌面端，太阳在画面左边）：[NDC x, NDC y, 离镜头深度]。
 * 从右下画面外斜着冲向太阳，快到太阳边缘时往上拐出画面；窗户玻璃在深度 0.9。
 * 手机端太阳在上面，整条路线转 90°。
 */
const FLY_PATH = [
  [1.1, -1.4, 1.2],
  [0.3, -0.5, 1.4],
  [-0.15, 0.1, 1.7],
  [-0.1, 1.5, 1.9],
] as const;
const DESKTOP_BREAKPOINT = 768;

/** 按原材料名上平涂色，受太阳点光源照亮 */
const COLORS: Record<string, number> = {
  metal: 0xd9dee6,
  metalDark: 0x6b7686,
  dark: 0x1f2630,
  metalRed: 0xff3d2e,
};

export interface Speeder {
  readonly object: THREE.Object3D;
  /** fly 为 undefined 时绕太阳转；否则由剧情控制，0~1 之外藏起来 */
  readonly update: (delta: number, camera: THREE.PerspectiveCamera, fly?: number) => void;
  readonly dispose: () => void;
}

export function createSpeeder(scene: THREE.Scene): Speeder {
  const object = new THREE.Group();
  let angle = Math.random() * Math.PI * 2;

  new GLTFLoader().loadAsync(MODEL_URL).then(({ scene: model }) => {
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const name = (mesh.material as THREE.Material).name;
        mesh.material = new THREE.MeshStandardMaterial({ color: COLORS[name] ?? COLORS.metal, roughness: 0.7, flatShading: true });
      }
    });
    // 机头转到 +z，lookAt 时朝着前进方向
    model.rotation.y = Math.PI;
    model.scale.setScalar(SCALE);
    object.add(model);
  }).catch((err) => console.warn('[Solar] 飞船模型加载失败:', err));

  const ahead = new THREE.Vector3();
  const up = new THREE.Vector3();
  const orbit = (): void => {
    object.up.set(0, 1, 0);
    object.position.set(Math.cos(angle), 0, -Math.sin(angle)).multiplyScalar(ORBIT_RADIUS);
    ahead.set(-Math.sin(angle), 0, -Math.cos(angle)).add(object.position);
    object.lookAt(ahead);
  };

  const curve = new THREE.CubicBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3());
  const controls = [curve.v0, curve.v1, curve.v2, curve.v3];
  /** 按当前镜头把路线换到相机空间 */
  const layoutPath = (camera: THREE.PerspectiveCamera): void => {
    const tanH = 1 / camera.projectionMatrix.elements[0];
    const tanV = 1 / camera.projectionMatrix.elements[5];
    const desktop = window.innerWidth >= DESKTOP_BREAKPOINT;
    FLY_PATH.forEach(([x, y, depth], i) => {
      // 手机端太阳在上：(x, y) → (y, -x)
      const [sx, sy] = desktop ? [x, y] : [y, -x];
      controls[i].set(sx * tanH * depth, sy * tanV * depth, -depth);
    });
  };

  const flyBy = (camera: THREE.PerspectiveCamera, t: number): void => {
    layoutPath(camera);
    curve.getPoint(t, object.position);
    curve.getTangent(t, ahead).add(object.position);
    object.position.applyQuaternion(camera.quaternion).add(camera.position);
    ahead.applyQuaternion(camera.quaternion).add(camera.position);
    // 机背朝着镜头，看到的是俯视的剪影
    object.up.copy(up.set(0, 0, 1).applyQuaternion(camera.quaternion));
    object.lookAt(ahead);
  };

  orbit();
  scene.add(object);

  return {
    object,
    update: (delta, camera, fly) => {
      if (fly === undefined) {
        object.visible = true;
        angle += ANGULAR_SPEED * delta;
        orbit();
        return;
      }
      object.visible = fly > 0 && fly < 1;
      if (object.visible) {
        flyBy(camera, fly);
      }
    },
    dispose: () => {
      scene.remove(object);
      disposeObject(object);
    },
  };
}
