import { copyFile, mkdir, cp } from 'node:fs/promises';
import { build } from 'esbuild';
await mkdir('dist/web', { recursive: true });
await Promise.all(['index.html', 'styles.css'].map(file => copyFile(`src/web/${file}`, `dist/web/${file}`)));
await cp('src/web/assets', 'dist/web/assets', { recursive: true });
await build({ entryPoints: ['src/web/trainer.ts'], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: 'dist/web/trainer.js', minify: true });
console.log('Built local server and browser assets.');
