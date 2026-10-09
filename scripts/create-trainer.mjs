// Original AiRA character and animation asset; generated locally, no external media.
import { SphereGeometry, CapsuleGeometry, Quaternion, Euler } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
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
  ['Forest performance fabric', [0.055, 0.17, 0.105, 1], 0, 0.8], ['Espresso hair and eyes', [0.035, 0.022, 0.017, 1], 0, 0.6],
  ['Warm ivory trainers', [0.87, 0.85, 0.73, 1], 0, 0.65], ['Graphite gym pants', [0.06, 0.085, 0.075, 1], 0, 0.85],
  ['Cream character skin', [0.90, 0.86, 0.60, 1], 0, 0.8], ['Eye glints', [0.99, 0.99, 0.96, 1], 0, 0.3],
  ['Hazel iris', [0.14, 0.22, 0.09, 1], 0, 0.35], ['Cheek warmth', [0.65, 0.22, 0.15, 1], 0, 0.8],
  ['Sage trim', [0.40, 0.53, 0.28, 1], 0, 0.75],
  ['Reference red cap', [0.65, 0.003, 0.005, 1], 0, 0.72], ['Burgundy cap visor', [0.30, 0.008, 0.016, 1], 0, 0.75],
  ['Blue cap emblem', [0.045, 0.11, 0.29, 1], 0, 0.8], ['Warm face outline', [0.58, 0.32, 0.15, 1], 0, 0.8],
  ['Soft eye accent', [0.095, 0.095, 0.085, 1], 0, 0.8],
]) gltf.materials.push({ name, pbrMetallicRoughness: { baseColorFactor: color, metallicFactor: metalness, roughnessFactor: roughness } });
const geometries = [new SphereGeometry(1, 32, 20), new CapsuleGeometry(0.18, 0.35, 8, 24), new RoundedBoxGeometry(1, 1, 1, 4, 0.16)];
const meshCache = new Map();
function mesh(geometry, material) {
  const key = `${geometry}:${material}`; if (meshCache.has(key)) return meshCache.get(key);
  const g = geometries[geometry];
  const primitive = { attributes: { POSITION: accessor(g.attributes.position.array, 'VEC3', 5126, true), NORMAL: accessor(g.attributes.normal.array, 'VEC3') },
    ...(g.index ? { indices: accessor(g.index.array, 'SCALAR', 5123) } : {}), material };
  const index = gltf.meshes.push({ primitives: [primitive] }) - 1; meshCache.set(key, index); return index;
}
function node(name, parent, translation = [0, 0, 0], scale = [1, 1, 1], geometry, material = 0) {
  const index = gltf.nodes.push({ name, translation, scale, children: [], ...(geometry !== undefined ? { mesh: mesh(geometry, material) } : {}) }) - 1;
  if (parent !== null) gltf.nodes[parent].children.push(index); return index;
}
const root = node('AiRA', null);
const body = node('Body', root, [0, 0, 0]);
node('AthleticTop', body, [0, 1.35, 0], [0.36, 0.43, 0.25], 0);
node('Waistband', body, [0, 1.01, 0], [0.31, 0.12, 0.235], 0, 3);
node('Collar', body, [0, 1.68, 0], [0.18, 0.075, 0.15], 0, 8);
node('Neck', body, [0, 1.76, 0], [0.125, 0.17, 0.12], 0, 4);
// Small original A mark, built into the local model rather than an external texture.
for (const [x, angle] of [[-0.12, -0.4], [-0.08, 0.4]]) {
  const stripe = node('AiRA badge stroke', body, [x, 1.46, 0.246], [0.013, 0.065, 0.012], 0, 2);
  gltf.nodes[stripe].rotation = new Quaternion().setFromEuler(new Euler(0, 0, angle)).toArray();
}
node('AiRA badge bar', body, [-0.10, 1.45, 0.252], [0.035, 0.009, 0.012], 0, 2);
const head = node('HeadPivot', body, [0, 2.04, 0]);
// Reference identity: rounded cream face, two dark eyes and red baseball cap.
node('Face outline', head, [0, 0, 0], [0.91, 0.86, 0.66], 2, 12);
node('Face', head, [0, 0.008, 0.035], [0.86, 0.81, 0.64], 2, 4);
node('Cap crown', head, [0, 0.32, -0.02], [0.49, 0.25, 0.39], 0, 9);
node('Cap fitted band', head, [0, 0.315, 0], [0.98, 0.18, 0.76], 2, 9);
node('Cap back strap', head, [0, 0.20, -0.32], [0.34, 0.055, 0.04], 0, 10);
node('Cap brim', head, [0, 0.265, 0.30], [0.51, 0.065, 0.30], 0, 10);
node('Cap top seam', head, [0, 0.545, -0.02], [0.035, 0.018, 0.035], 0, 10);
node('Cap emblem blue', head, [0, 0.409, 0.357], [0.07, 0.077, 0.022], 0, 11);
node('Cap emblem cream', head, [0, 0.407, 0.379], [0.035, 0.05, 0.008], 0, 4);
node('Cap emblem red', head, [0, 0.405, 0.389], [0.011, 0.01, 0.006], 0, 9);
const arms = [], elbows = [], legs = [], knees = [], ankles = [], eyes = [];
for (const [side, sign] of [['Left', -1], ['Right', 1]]) {
  node(`Ear outline${side}`, head, [sign * 0.455, -0.03, 0], [0.080, 0.13, 0.10], 0, 12);
  node(`Ear${side}`, head, [sign * 0.466, -0.03, 0.025], [0.065, 0.115, 0.09], 0, 4);
  const eye = node(`EyePivot${side}`, head, [sign * 0.175, 0.015, 0.365]); eyes.push(eye);
  node(`Dark eye${side}`, eye, [0, 0, 0], [0.23, 0.25, 0.056], 2, 1);
  node(`Eye lower accent${side}`, eye, [0, -0.074, 0.030], [0.074, 0.025, 0.008], 0, 13);
  node(`Catchlight${side}`, eye, [0.022, 0.044, 0.035], [0.042, 0.049, 0.009], 0, 5);
  node(`Small glint${side}`, eye, [-0.035, -0.063, 0.039], [0.014, 0.010, 0.004], 0, 5);
  const arm = node(`Arm${side}`, body, [sign * 0.33, 1.59, 0]); arms.push(arm);
  node(`Sleeve${side}`, arm, [sign * 0.035, -0.11, 0], [0.145, 0.20, 0.15], 0);
  node(`UpperArm${side}`, arm, [sign * 0.06, -0.23, 0], [0.11, 0.18, 0.115], 0, 4);
  const elbow = node(`Elbow${side}`, arm, [sign * 0.065, -0.34, 0]); elbows.push(elbow);
  node(`Forearm${side}`, elbow, [0, -0.13, 0], [0.09, 0.19, 0.10], 0, 4);
  node(`Cuff${side}`, elbow, [0, -0.25, 0], [0.093, 0.035, 0.102], 0, side === 'Left' ? 3 : 8);
  node(`Hand${side}`, elbow, [0, -0.32, 0.018], [0.105, 0.12, 0.08], 0, 4);
  node(`Thumb${side}`, elbow, [-sign * 0.073, -0.30, 0.06], [0.038, 0.065, 0.038], 0, 4);
  const leg = node(`Hip${side}`, body, [sign * 0.18, 1.0, 0]); legs.push(leg);
  node(`Thigh${side}`, leg, [0, -0.19, 0], [0.16, 0.29, 0.175], 0, 3);
  node(`Pant stripe${side}`, leg, [sign * 0.147, -0.19, 0], [0.012, 0.22, 0.035], 0, 8);
  const knee = node(`Knee${side}`, leg, [0, -0.43, 0]); knees.push(knee);
  node(`Calf${side}`, knee, [0, -0.18, 0], [0.12, 0.27, 0.13], 0, 3);
  node(`Sock${side}`, knee, [0, -0.34, 0], [0.105, 0.065, 0.11], 0, 2);
  const ankle = node(`Ankle${side}`, knee, [0, -0.43, 0]); ankles.push(ankle);
  node(`Shoe${side}`, ankle, [0, -0.005, 0.065], [0.15, 0.115, 0.23], 0, 2);
  node(`Sole${side}`, ankle, [0, -0.07, 0.065], [0.158, 0.041, 0.236], 0, 8);
  for (let i = 0; i < 3; i++) node(`Lace${side}${i}`, ankle, [0, 0.085 - i * 0.008, 0.065 + i * 0.039], [0.075, 0.012, 0.012], 0, 5);
}
const frames = 65;
function animation(name, duration) {
  const times = Float32Array.from({ length: frames }, (_, i) => i * duration / (frames - 1));
  const samplers = [], channels = [];
  function track(target, path, values, type) {
    const sampler = samplers.push({ input: accessor(times, 'SCALAR', 5126, true), output: accessor(new Float32Array(values), type), interpolation: 'LINEAR' }) - 1;
    channels.push({ sampler, target: { node: target, path } });
  }
  const rotations = (fn) => Array.from(times).flatMap((t, i) => new Quaternion().setFromEuler(new Euler(...fn(t, i))).toArray());
  const cycle = t => t / duration * Math.PI * 2;
  const bend = t => (1 - Math.cos(cycle(t))) / 2;
  const squat = name.endsWith('_squat'), lunge = name.endsWith('_lunge'), march = name.endsWith('_march') || name === 'active';
  const frontLeg = (t, n) => n === (Math.sin(cycle(t)) >= 0 ? 0 : 1);
  const lungeBend = t => (1 - Math.cos(cycle(t) * 2)) / 2;
  const hipAngle = (t, n) => squat ? -0.8 * bend(t) : lunge ? (frontLeg(t, n) ? -0.85 : 0.45) * lungeBend(t) : march ? -Math.max(0, Math.sin(cycle(t)) * (n ? -1 : 1)) * 0.6 : 0;
  const kneeAngle = (t, n) => squat ? 1.6 * bend(t) : lunge ? (frontLeg(t, n) ? 0.85 : 0.4) * lungeBend(t) : march ? Math.max(0, Math.sin(cycle(t)) * (n ? -1 : 1)) * 0.8 : 0;
  track(body, 'translation', Array.from(times).flatMap(t => {
    const hip = hipAngle(t, 0), knee = kneeAngle(t, 0);
    return [Math.sin(cycle(t)) * (squat || lunge ? 0 : 0.009), squat || lunge ? (Math.cos(hip) - 1) * 0.43 + (Math.cos(hip + knee) - 1) * 0.43 : 0,
      squat ? -0.08 * bend(t) : lunge ? 0.12 * bend(t) : 0];
  }), 'VEC3');
  track(body, 'scale', Array.from(times).flatMap(t => [1 + Math.sin(cycle(t)) * 0.004, 1 + Math.sin(cycle(t)) * 0.004, 1]), 'VEC3');
  track(head, 'rotation', rotations(t => [Math.sin(cycle(t)) * (name === 'encourage' ? 0.10 : 0.025), Math.sin(cycle(t)) * (name === 'greet' ? 0.10 : 0.025), 0]), 'VEC4');
  eyes.forEach(eye => track(eye, 'scale', Array.from(times).flatMap(t => [1, 1 - Math.max(0, 1 - Math.abs(t / duration - 0.72) / 0.025) * 0.92, 1]), 'VEC3'));
  arms.forEach((arm, n) => track(arm, 'rotation', rotations(t => {
    const wave = Math.sin(cycle(t));
    const sign = n === 0 ? -1 : 1;
    if ((name === 'greet' || name === 'end') && n === 1) return [-0.05, 0, (name === 'end' ? 1.0 : 1.65) + wave * 0.08];
    if (name === 'celebrate') return [-0.12, 0, sign * (2.35 + wave * 0.055)];
    if (name === 'encourage' && n === 1) return [-0.3, 0, 0.55 + wave * 0.07];
    if (squat || lunge) return [-0.8 - bend(t) * 0.4, 0, sign * 0.1];
    if (name.endsWith('_warmup') || name === 'demonstrate') return [wave * 0.15, 0, sign * (0.12 + bend(t) * 0.18)];
    return [march ? wave * (n ? 0.25 : -0.25) : 0, 0, sign * (0.07 + wave * 0.008)];
  }), 'VEC4'));
  elbows.forEach((elbow, n) => track(elbow, 'rotation', rotations(t => [name === 'encourage' && n === 1 ? -1.1 : squat || lunge ? -0.25 : -0.08, 0, (name === 'greet' || name === 'end') && n === 1 ? (name === 'end' ? 0.9 : 1.15) + Math.sin(cycle(t)) * 0.18 : 0]), 'VEC4'));
  legs.forEach((leg, n) => track(leg, 'rotation', rotations(t => [hipAngle(t, n), 0, squat ? (n ? 0.06 : -0.06) * bend(t) : 0]), 'VEC4'));
  knees.forEach((knee, n) => track(knee, 'rotation', rotations(t => [kneeAngle(t, n), 0, 0]), 'VEC4'));
  ankles.forEach((ankle, n) => track(ankle, 'rotation', rotations(t => [-hipAngle(t, n) - kneeAngle(t, n), 0, 0]), 'VEC4'));
  gltf.animations.push({ name, samplers, channels });
}
for (const name of ['idle', 'greet', 'ready', 'demonstrate', 'active', 'encourage', 'recover', 'pause', 'celebrate', 'end']) animation(name, name === 'active' ? 2 : 4);
for (const mode of ['demonstrate', 'active']) for (const movement of ['warmup', 'march', 'squat', 'lunge']) animation(`${mode}_${movement}`, mode === 'demonstrate' ? 5 : movement === 'march' ? 2 : 4);
gltf.buffers = [{ byteLength: offset }];
const json = Buffer.from(JSON.stringify(gltf)); const jsonPadding = (4 - json.length % 4) % 4;
const jsonChunk = Buffer.concat([json, Buffer.alloc(jsonPadding, 32)]); const binary = Buffer.concat(chunks);
const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + jsonChunk.length + binary.length, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonChunk.length); jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(binary.length); bh.writeUInt32LE(0x004e4942, 4);
await mkdir('src/web/assets', { recursive: true });
await writeFile('src/web/assets/aira-trainer.glb', Buffer.concat([header, jh, jsonChunk, bh, binary]));
console.log(`Created original human AiRA trainer with ${gltf.animations.length} local animation clips.`);
