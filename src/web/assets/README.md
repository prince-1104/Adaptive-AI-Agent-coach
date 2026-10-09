# AiRA trainer asset

`aira-trainer.glb` is an original character created for this repository by
`scripts/create-trainer.mjs`. It contains local geometry/materials and 18
named transform animation clips: ten state clips (idle, greet, ready, demonstrate,
active, encourage, recover, pause, celebrate and end), plus warm-up, march,
squat and lunge clips for both demonstrate and active states. It has no external buffers, textures or URLs.

Regenerate from the project root with `node scripts/create-trainer.mjs`.
The asset is checked in, so ordinary startup does not run the generator.
Three.js is an npm dependency under its MIT license; it is bundled locally.

`aira-sticker.png` is the local transparent mascot sticker used throughout the UI.
The GLB embeds its geometry and materials; it has no external texture or buffer files.
No prerecorded audio files are required: optional voice captures and plays PCM in
browser memory. Packaging supports local GLTF, buffer, texture and audio files if added.
