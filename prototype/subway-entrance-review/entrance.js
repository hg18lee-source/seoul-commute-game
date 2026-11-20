import * as T from '../dist/vendor/three.module.js';
import { GLTFLoader } from '../dist/hero/vendor/loaders/GLTFLoader.js';

export const entrance = Object.freeze({ x: 5.25, z: -12.38, scale: .86 });
export const worldX = x => entrance.x + x * entrance.scale;
export const worldZ = z => entrance.z + z * entrance.scale;
const localX = x => (x - entrance.x) / entrance.scale;
const localZ = z => (z - entrance.z) / entrance.scale;
const radius = .29 / entrance.scale;

// Cross sections measured on the top faces in the GLB's y-up scene coordinates.
const treads = [
  [3.846, .087], [3.599, .229], [3.362, .390], [1.926, .312],
  ...Array.from({ length: 30 }, (_, i) => [1.616 - i * .2697, .143 - i * .16926]),
  [-6.471, -4.707],
];

export function insideEntrance(x, z) {
  return Math.abs(localX(x)) < 2.25 && localZ(z) < 3.85 && localZ(z) > -9.95;
}

export function entranceBlocked(x, z) {
  const u = Math.abs(localX(x)), v = localZ(z);
  if (u >= 2.33 + radius || v >= 3.846 + radius || v <= -9.982 - radius) return false;
  if (v <= -9.90 + radius) return true;
  if (u >= 1.80 - radius && v >= -7.31 - radius && v <= 1.98 + radius) return true;
  if (u >= 2.20 - radius) return true;
  return u <= .253 + radius && v >= -7.31 - radius && v <= 3.07 + radius;
}

export function walkHeight(x, z, smooth = true) {
  if (!insideEntrance(x, z)) return 0;
  const v = localZ(z);
  let top = 0;
  for (const [edge, height] of treads) {
    if (smooth && Math.abs(v - edge) < .083) {
      top = T.MathUtils.lerp(height, top, T.MathUtils.smoothstep(v, edge - .083, edge + .083));
      break;
    }
    if (v > edge) break;
    top = height;
  }
  return top * entrance.scale;
}

export function constrainEntranceCamera(point, player) {
  if (!insideEntrance(player.x, player.z) || !insideEntrance(point.x, point.z)) return;
  const v = localZ(point.z);
  const roof = v > -2.27 ? T.MathUtils.lerp(.55, 3.40, T.MathUtils.smoothstep(v, -2.27, 1.04)) : -.13;
  point.y = Math.min(point.y, roof * entrance.scale - .08);
}

function cleanGlass(material) {
  const atlas = document.createElement('canvas');
  atlas.width = material.map.image.width;
  atlas.height = material.map.image.height;
  const context = atlas.getContext('2d', { willReadFrequently: true });
  context.drawImage(material.map.image, 0, 0);
  // Two baked station decals occupy flat tint patches in the shared base-color atlas.
  for (const [x, y, w, h] of [[425, 47, 105, 46], [27, 408, 105, 48]]) {
    const tint = context.getImageData(x, y, 1, 1).data;
    const patch = context.createImageData(w, h);
    for (let i = 0; i < patch.data.length; i += 4) patch.data.set(tint, i);
    context.putImageData(patch, x, y);
  }
  const map = material.map.clone();
  map.image = atlas;
  map.needsUpdate = true;
  material.map = map;
}

export async function loadEntrance() {
  const { scene: model } = await new GLTFLoader().loadAsync('./assets/entrance.glb');
  model.position.set(entrance.x, 0, entrance.z);
  model.scale.setScalar(entrance.scale);
  const glass = model.getObjectByName('Glass').children[0];
  glass.material = glass.material.clone();
  glass.material.forceSinglePass = true;
  cleanGlass(glass.material);
  model.traverse(mesh => {
    if (!mesh.isMesh || mesh === glass) return;
    const decal = mesh.parent.name.startsWith('Plane');
    if (!decal) {
      mesh.material.transparent = false;
      mesh.material.depthWrite = true;
      mesh.castShadow = mesh.parent.name !== 'Floor';
      if (mesh.parent.name === 'Floor_Underground') {
        mesh.material = mesh.material.clone();
        mesh.material.roughness = 1;
        mesh.material.metalness = .38;
      }
    } else {
      mesh.material = glass.material.clone();
      mesh.material.map = glass.material.map;
      mesh.material.polygonOffset = true;
      mesh.material.polygonOffsetFactor = -1;
    }
    mesh.receiveShadow = true;
  });
  return model;
}
