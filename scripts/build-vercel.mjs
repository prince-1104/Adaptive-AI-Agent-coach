import { mkdir, cp, copyFile, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
const destination = resolve('public');
if (dirname(destination) !== resolve(process.cwd())) throw new Error('Static output must stay inside the project.');
// Only this fixed generated directory is recreated; server code never enters public/.
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp('dist/web', 'public/web', { recursive: true });
await cp('dist/shared', 'public/shared', { recursive: true });
await copyFile('dist/web/index.html', 'public/index.html');
console.log('Vercel static output ready; server source, prompts and secrets remain private.');
