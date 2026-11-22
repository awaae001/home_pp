import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/*
 * 舱内行走的男人：Quaternius 的 Smooth Male Casual（CC0）。
 * 去掉材质、法线、UV，只留骨骼和走路动画，平涂纯黑当剪影。
 * 模型面朝 +z，走路动画是原地踏步，按 1.3 m/s 播放。
 */

const MODEL_URL = '/models/walker.glb';
const MODEL_HEIGHT = 1.78;
const WALK_SPEED = 1.3;
/** 侧面看迈步时的大致宽度（米），用来算从画面外多远开始走 */
const STRIDE_WIDTH = 0.9;
const WALK_CLIP = 'Man_Walk';

export interface WalkerStage {
  /** 站在地板上的高度 */
  readonly floorY: number;
  /** 离窗口平面往舱里多远（局部 -z） */
  readonly z: number;
  readonly height: number;
  /** 起点、终点（局部 x） */
  readonly fromX: number;
  readonly toX: number;
}

export interface Walker {
  readonly object: THREE.Object3D;
  /** 一个人在画面上多宽（世界单位），用来摆起点 */
  readonly strideFor: (height: number) => number;
  readonly setStage: (stage: WalkerStage) => void;
  /** progress 0 → 1：从起点走到终点 */
  readonly update: (progress: number) => void;
  readonly dispose: () => void;
}

export function createWalker(): Walker {
  const object = new THREE.Group();
  // 地板的光带、砖缝是半透明的，男人也放进半透明队列，才能排在它们后面画
  const material = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true });
  let mixer: THREE.AnimationMixer | undefined;
  let walk: THREE.AnimationAction | undefined;
  let lastTime = -1;
  let stage: WalkerStage | undefined;

  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(MODEL_URL).then((gltf) => {
    const model = gltf.scene;
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.material = material;
        mesh.frustumCulled = false;
        mesh.renderOrder = 5;
      }
    });
    // 面朝 +z 转到面朝局部 -x（画面右边）
    model.rotation.y = -Math.PI / 2;
    object.add(model);

    mixer = new THREE.AnimationMixer(model);
    const clip = gltf.animations.find((a) => a.name === WALK_CLIP);
    if (clip) {
      walk = mixer.clipAction(clip).play();
      walk.timeScale = 0;
    }
  }).catch((err) => console.warn('[Solar] 行走模型加载失败:', err));

  return {
    object,
    strideFor: (height) => height / MODEL_HEIGHT * STRIDE_WIDTH,
    setStage: (next) => {
      stage = next;
      object.scale.setScalar(next.height / MODEL_HEIGHT);
      // 模型默认面朝局部 -x，往 +x 走就掉个头
      object.rotation.y = next.toX > next.fromX ? Math.PI : 0;
      lastTime = -1;
    },
    update: (progress) => {
      if (!stage) {
        return;
      }
      object.position.set(THREE.MathUtils.lerp(stage.fromX, stage.toX, progress), stage.floorY, stage.z);
      if (!mixer || !walk) {
        return;
      }

      // 动画时间跟着走过的距离（凑成整数个步子，脚基本不打滑），走到头正好落在最后一帧
      const duration = walk.getClip().duration;
      const meters = Math.abs(stage.toX - stage.fromX) / (stage.height / MODEL_HEIGHT);
      const cycles = Math.max(1, Math.round(meters / WALK_SPEED / duration));
      walk.time = progress >= 1 ? duration - 1e-3 : (progress * cycles * duration) % duration;
      if (walk.time === lastTime) {
        return;
      }
      lastTime = walk.time;
      mixer.update(0);
    },
    dispose: () => {
      mixer?.stopAllAction();
      material.dispose();
      object.traverse((child) => (child as THREE.Mesh).geometry?.dispose());
    },
  };
}
