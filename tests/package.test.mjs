import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collect, zip } from '../scripts/package.mjs';
test('submission export allowlist excludes environment, dependencies and history', async t => {
  const root = await mkdtemp(join(tmpdir(), 'workout-package-')); t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'src')); await mkdir(join(root, 'node_modules')); await mkdir(join(root, '.git'));
  await writeFile(join(root, '.env'), 'PRIVATE_VALUE=do-not-export');
  await writeFile(join(root, 'src/app.ts'), 'export const hello = 1;');
  await writeFile(join(root, '.env.example'), 'OPENAI_API_KEY=\n');
  const files = await collect(root);
  assert.deepEqual(files.map(f => f.path), ['.env.example', 'src/app.ts']);
  const archive = zip(files); assert(!archive.includes(Buffer.from('do-not-export'))); assert.equal(archive.readUInt32LE(0), 0x04034b50);
});
test('submission export rejects known credential patterns', async t => {
  const root = await mkdtemp(join(tmpdir(), 'workout-package-')); t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'src')); await writeFile(join(root, 'src/app.ts'), 'const key="sk-' + 'x'.repeat(30) + '";');
  await assert.rejects(collect(root), /Possible credential/);
});

test('submission export rejects symlinks', async t => {
  const root = await mkdtemp(join(tmpdir(), 'workout-package-')); t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'src')); await writeFile(join(root, 'target.ts'), 'export const fixture = true;');
  try { await symlink(join(root, 'target.ts'), join(root, 'src/app.ts')); }
  catch (error) { if (process.platform === 'win32' && error.code === 'EPERM') { t.skip('Windows requires symlink privileges; Linux CI exercises this check.'); return; } throw error; }
  await assert.rejects(collect(root), /symbolic link/);
});
test('submission export rejects a CLI credential assignment in candidate source', async t => {
  const root = await mkdtemp(join(tmpdir(), 'workout-package-')); t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'src')); await writeFile(join(root, 'src/app.ts'), 'CLAUDE_CODE_OAUTH_TOKEN' + '=do-not-export');
  await assert.rejects(collect(root), /Possible secret assignment/);
});


test('submission includes local model buffers, textures, audio and CI configuration without caches', async t => {
  const root = await mkdtemp(join(tmpdir(), 'workout-assets-')); t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'src/web/assets'), { recursive: true });
  await mkdir(join(root, '.github/workflows'), { recursive: true });
  await mkdir(join(root, 'api/voice'), { recursive: true });
  await writeFile(join(root, 'api/voice/token.mjs'), 'export default () => {};');
  await writeFile(join(root, 'vercel.json'), '{}');
  await mkdir(join(root, 'src/cache'), { recursive: true });
  const assets = ['trainer.gltf', 'trainer.bin', 'texture.jpg', 'texture.webp', 'texture.ktx2', 'voice.wav', 'voice.mp3', 'icon.svg'];
  for (const asset of assets) await writeFile(join(root, 'src/web/assets', asset), asset === 'trainer.bin' ? Buffer.alloc(3_000_000) : 'synthetic fixture');
  await writeFile(join(root, '.github/workflows/ci.yml'), 'name: CI\n');
  await writeFile(join(root, 'src/cache/stale.json'), '{}');
  await writeFile(join(root, 'src/web/assets/temp.tmp'), 'temporary');
  const files = await collect(root);
  for (const asset of assets) assert(files.some(file => file.path === `src/web/assets/${asset}`));
  assert(files.some(file => file.path === '.github/workflows/ci.yml'));
  assert(files.some(file => file.path === 'api/voice/token.mjs'));
  assert(files.some(file => file.path === 'vercel.json'));
  assert(!files.some(file => /cache|temp\.tmp/.test(file.path)));
});
