import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/*
 * 舱内行走的男人：tevy.dev 的 Race Marshal（CC0），LOD1（LOD2 面数太少，走起来两条腿粘成一块）。
 * 去掉了材质、法线、UV，只留骨骼和走路动画，用 meshopt 压缩。
 * 平涂纯黑当剪影。模型面朝 +z，走路动画是原地踏步，按 1.3 m/s 做的。
 * 动画时间跟着走过的距离，走到头钉在最后一帧，不进待机。
 */

const MODEL_URL = '/models/walker.glb';
const MODEL_HEIGHT = 1.78;
const WALK_SPEED = 1.3;
/** 侧面看迈步时的大致宽度（米），用来算从画面外多远开始走 */
const STRIDE_WIDTH = 0.9;
/** 原动画手臂只在身前小幅摆、手肘一直弯着，像停在半空：摆幅放大，手肘伸直一些 */
const ARM_SWING = 2;
const ELBOW_BEND = 0.45;
const ARMS = ['upperarm_L', 'upperarm_R'] as const;
const ELBOWS = ['forearm_L', 'forearm_R'] as const;

interface ArmSwing {
  readonly bone: THREE.Object3D;
  /** 摆动的中间姿态和摆动轴（骨骼局部） */
  readonly middle: THREE.Quaternion;
  readonly axis: THREE.Vector3;
}

const swingDelta = new THREE.Quaternion();
const swingAxis = new THREE.Quaternion();
const IDENTITY = new THREE.Quaternion();

/** 把整段走路动画里这根骨头的姿态采样一遍，求出中间姿态和摆动轴 */
function measureSwing(mixer: THREE.AnimationMixer, action: THREE.AnimationAction, bone: THREE.Object3D): ArmSwing {
  const duration = action.getClip().duration;
  const samples: THREE.Quaternion[] = [];
  for (let i = 0; i < 24; i += 1) {
    action.time = duration * i / 24;
    mixer.update(0);
    samples.push(bone.quaternion.clone());
  }
  const middle = new THREE.Quaternion(0, 0, 0, 0);
  for (const q of samples) {
    const sign = q.dot(samples[0]) < 0 ? -1 : 1;
    middle.set(middle.x + q.x * sign, middle.y + q.y * sign, middle.z + q.z * sign, middle.w + q.w * sign);
  }
  middle.normalize();

  // 离中间姿态最远的那一帧，决定摆动轴
  const inverse = middle.clone().invert();
  let axis = new THREE.Vector3(1, 0, 0);
  let widest = 0;
  for (const q of samples) {
    const d = inverse.clone().multiply(q);
    const v = new THREE.Vector3(d.x, d.y, d.z);
    if (v.length() > widest) {
      widest = v.length();
      axis = v.normalize();
    }
  }
  return { bone, middle, axis };
}

function amplify({ bone, middle, axis }: ArmSwing): void {
  swingDelta.copy(middle).invert().multiply(bone.quaternion);
  // q 和 -q 是同一个姿态，统一到 w ≥ 0，不然角度会绕一整圈变成大风车
  if (swingDelta.w < 0) {
    swingDelta.set(-swingDelta.x, -swingDelta.y, -swingDelta.z, -swingDelta.w);
  }
  const angle = 2 * Math.atan2(swingDelta.x * axis.x + swingDelta.y * axis.y + swingDelta.z * axis.z, swingDelta.w);
  swingAxis.setFromAxisAngle(axis, angle * ARM_SWING);
  bone.quaternion.copy(middle).multiply(swingAxis);
}

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
  let arms: ArmSwing[] = [];
  let elbows: THREE.Object3D[] = [];
  let tuned: THREE.Object3D[] = [];
  let raw: THREE.Quaternion[] = [];
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
    const clip = gltf.animations.find((a) => a.name === 'walk');
    if (clip) {
      const action = mixer.clipAction(clip).play();
      const mx = mixer;
      action.timeScale = 0;
      arms = ARMS.flatMap((name) => {
        const bone = model.getObjectByName(name);
        return bone ? [measureSwing(mx, action, bone)] : [];
      });
      elbows = ELBOWS.flatMap((name) => model.getObjectByName(name) ?? []);
      tuned = [...arms.map((arm) => arm.bone), ...elbows];
      raw = tuned.map((bone) => bone.quaternion.clone());
      walk = action;
    }
  }).catch((err) => console.warn('[Solar] 行走模型加载失败:', err));

  return {
    object,
    strideFor: (height) => height / MODEL_HEIGHT * STRIDE_WIDTH,
    setStage: (next) => {
      stage = next;
      object.scale.setScalar(next.height / MODEL_HEIGHT);
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

      // mixer 只在值变了的时候才写骨骼：先还原成动画原本的姿态，再在上面放大摆臂，不会一帧帧叠加
      tuned.forEach((bone, i) => bone.quaternion.copy(raw[i]));
      mixer.update(0);
      tuned.forEach((bone, i) => raw[i].copy(bone.quaternion));
      arms.forEach(amplify);
      for (const elbow of elbows) {
        elbow.quaternion.slerp(IDENTITY, 1 - ELBOW_BEND);
      }
    },
    dispose: () => {
      mixer?.stopAllAction();
      material.dispose();
      object.traverse((child) => (child as THREE.Mesh).geometry?.dispose());
    },
  };
}
