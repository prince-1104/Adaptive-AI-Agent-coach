// Original AiRA character and animation asset; generated locally, no external media.
import { SphereGeometry, CapsuleGeometry, Quaternion, Euler } from 'three';
import { mkdir, writeFile } from 'node:fs/promises';
const gltf = { asset: { version: '2.0', generator: 'AiRA original mascot generator' }, scene: 0, scenes: [{ nodes: [0] }],
  nodes: [], meshes: [], materials: [], accessors: [], bufferViews: [], buffers: [], animations: [] };
const chunks = []; let offset = 0;
function accessor(array, type, componentType = 5126, bounds = false) {
  const bytes = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
  const view = gltf.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length }) - 1;
  chunks.push(bytes); offset += bytes.length;
  const padding = (4 - offset % 4) % 4; if (padding) { chunks.push(Buffer.alloc(padding)); offset += padding; }
  const size = { SCALAR: 1, VEC3: 3, VEC4: 4 }[type];
  const entry = { bufferView: view, componentType, count: array.length / size, type };
  if (bounds) {
    entry.min = Array.from({ length: size }, (_, n) => Math.min(...Array.from(array).filter((_, i) => i % size === n)));
    entry.max = Array.from({ length: size }, (_, n) => Math.max(...Array.from(array).filter((_, i) => i % size === n)));
  }
  return gltf.accessors.push(entry) - 1;
}
for (const [name, color, metalness, roughness] of [
  ['Sage ceramic', [0.42, 0.67, 0.51, 1], 0.12, 0.35], ['Obsidian visor', [0.025, 0.07, 0.055, 1], 0.4, 0.2],
  ['Ivory details', [0.9, 0.95, 0.85, 1], 0.05, 0.4], ['Dark joints', [0.10, 0.17, 0.14, 1], 0.2, 0.4],
]) gltf.materials.push({ name, pbrMetallicRoughness: { baseColorFactor: color, metallicFactor: metalness, roughnessFactor: roughness } });
const geometries = [new SphereGeometry(1, 32, 20), new CapsuleGeometry(0.18, 0.35, 8, 24)];
const meshCache = new Map();
function mesh(geometry, material) {
  const key = `${geometry}:${material}`; if (meshCache.has(key)) return meshCache.get(key);
  const g = geometries[geometry];
  const primitive = { attributes: { POSITION: accessor(g.attributes.position.array, 'VEC3', 5126, true), NORMAL: accessor(g.attributes.normal.array, 'VEC3') },
    indices: accessor(g.index.array, 'SCALAR', 5123), material };
  const index = gltf.meshes.push({ primitives: [primitive] }) - 1; meshCache.set(key, index); return index;
}
function node(name, parent, translation = [0, 0, 0], scale = [1, 1, 1], geometry, material = 0) {
  const index = gltf.nodes.push({ name, translation, scale, children: [], ...(geometry !== undefined ? { mesh: mesh(geometry, material) } : {}) }) - 1;
  if (parent !== null) gltf.nodes[parent].children.push(index); return index;
}
const root = node('AiRA', null);
const body = node('Body', root, [0, 0, 0]);
node('Torso', body, [0, 1.3, 0], [0.49, 0.59, 0.33], 0);
node('ChestBadge', body, [0, 1.47, 0.32], [0.13, 0.13, 0.04], 0, 2);
const head = node('HeadPivot', body, [0, 2.03, 0]);
node('Head', head, [0, 0, 0], [0.58, 0.49, 0.4], 0);
node('Visor', head, [0, 0.015, 0.325], [0.45, 0.255, 0.15], 0, 1);
node('EyeLeft', head, [-0.17, 0.035, 0.459], [0.046, 0.082, 0.02], 0, 2);
node('EyeRight', head, [0.17, 0.035, 0.459], [0.046, 0.082, 0.02], 0, 2);
node('EarLeft', head, [-0.58, 0, 0], [0.065, 0.15, 0.15], 0, 2);
node('EarRight', head, [0.58, 0, 0], [0.065, 0.15, 0.15], 0, 2);
const arms = [], legs = [];
for (const [side, sign] of [['Left', -1], ['Right', 1]]) {
  const arm = node(`Arm${side}`, body, [sign * 0.48, 1.68, 0]); arms.push(arm);
  node(`Shoulder${side}`, arm, [sign * 0.06, -0.06, 0], [0.19, 0.19, 0.19], 0, 3);
  node(`Sleeve${side}`, arm, [sign * 0.11, -0.35, 0], [1, 1, 1], 1);
  node(`Hand${side}`, arm, [sign * 0.11, -0.70, 0], [0.20, 0.22, 0.20], 0, 2);
  const leg = node(`Leg${side}`, body, [sign * 0.24, 0.9, 0]); legs.push(leg);
  node(`Trouser${side}`, leg, [0, -0.3, 0], [1.05, 1.1, 1.05], 1, 3);
  node(`Shoe${side}`, leg, [0, -0.72, 0.08], [0.23, 0.17, 0.36], 0, 2);
}
const frames = 25;
function animation(name, duration, amplitude, armLift = 0) {
  const times = Float32Array.from({ length: frames }, (_, i) => i * duration / (frames - 1));
  const samplers = [], channels = [];
  function track(target, path, values, type) {
    const sampler = samplers.push({ input: accessor(times, 'SCALAR', 5126, true), output: accessor(new Float32Array(values), type), interpolation: 'LINEAR' }) - 1;
    channels.push({ sampler, target: { node: target, path } });
  }
  const rotations = (fn) => Array.from(times).flatMap((t, i) => new Quaternion().setFromEuler(new Euler(...fn(t, i))).toArray());
  track(body, 'translation', Array.from(times).flatMap(t => [0, Math.sin(t / duration * Math.PI * 2) * amplitude, 0]), 'VEC3');
  track(head, 'rotation', rotations(t => [Math.sin(t / duration * Math.PI * 2) * 0.04, Math.sin(t / duration * Math.PI * 2) * (name === 'greet' ? 0.12 : 0.045), 0]), 'VEC4');
  arms.forEach((arm, n) => track(arm, 'rotation', rotations(t => {
    const wave = Math.sin(t / duration * Math.PI * 2);
    const sign = n === 0 ? -1 : 1;
    if (name === 'greet' && n === 1) return [0, 0, 2.1 + wave * 0.25];
    return [name === 'active' ? wave * (n ? 0.45 : -0.45) : 0, 0, sign * (armLift + wave * amplitude * 1.5)];
  }), 'VEC4'));
  legs.forEach((leg, n) => track(leg, 'rotation', rotations(t => [name === 'active' ? Math.sin(t / duration * Math.PI * 2) * (n ? -0.25 : 0.25) : 0, 0, 0]), 'VEC4'));
  gltf.animations.push({ name, samplers, channels });
}
animation('idle', 4, 0.025, 0.04); animation('greet', 2.5, 0.025, 0.08);
animation('ready', 3, 0.035, 0.15); animation('demonstrate', 3, 0.035, 0.75);
animation('active', 1.8, 0.055, 0.12); animation('encourage', 2, 0.04, 1.0);
animation('recover', 4.5, 0.018, 0.05); animation('celebrate', 1.8, 0.075, 2.5);
gltf.buffers = [{ byteLength: offset }];
const json = Buffer.from(JSON.stringify(gltf)); const jsonPadding = (4 - json.length % 4) % 4;
const jsonChunk = Buffer.concat([json, Buffer.alloc(jsonPadding, 32)]); const binary = Buffer.concat(chunks);
const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + jsonChunk.length + binary.length, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonChunk.length); jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(binary.length); bh.writeUInt32LE(0x004e4942, 4);
await mkdir('src/web/assets', { recursive: true });
await writeFile('src/web/assets/aira-trainer.glb', Buffer.concat([header, jh, jsonChunk, bh, binary]));
console.log('Created original AiRA GLB with eight animation clips.');
