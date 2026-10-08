import { copyFile, mkdir, cp, rm } from 'node:fs/promises';
import { build } from 'esbuild';
await mkdir('dist/web', { recursive: true });
// Retire the previous provider's generated modules without deleting other build assets.
await Promise.all(['dist/server/voice.js', 'dist/web/voice.js'].map(file => rm(file, { force: true })));
await Promise.all(['index.html', 'styles.css'].map(file => copyFile(`src/web/${file}`, `dist/web/${file}`)));
await cp('src/web/assets', 'dist/web/assets', { recursive: true });
await build({ entryPoints: ['src/web/trainer.ts'], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: 'dist/web/trainer.js', minify: true });
await build({ entryPoints: ['src/web/gemini-sdk.ts'], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: 'dist/web/gemini-sdk.js', minify: true });
console.log('Built local server and browser assets.');
