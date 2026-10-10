import { mkdir, cp, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import { build } from 'esbuild';
import { resolve, dirname } from 'node:path';
const destination = resolve('public');
if (dirname(destination) !== resolve(process.cwd())) throw new Error('Static output must stay inside the project.');
// Only this fixed generated directory is recreated; server code never enters public/.
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp('dist/web', 'public/web', { recursive: true });
await cp('dist/shared', 'public/shared', { recursive: true });
await build({ entryPoints: ['src/web/analytics.ts'], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: 'public/web/analytics.js', minify: true });
const html = (await readFile('dist/web/index.html', 'utf8')).replace('</head>', '<script type="module" src="/web/analytics.js"></script></head>');
await writeFile('public/index.html', html);
await writeFile('public/web/index.html', html);
await copyFile('src/web/assets/aira-sticker.png', 'public/favicon.png');
console.log('Vercel static output ready; server source, prompts and secrets remain private.');
