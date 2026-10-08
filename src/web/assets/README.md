# AiRA trainer asset

`aira-trainer.glb` is an original character created for this repository by
`scripts/create-trainer.mjs`. It contains local geometry/materials and eight
named transform animation clips: idle, greet, ready, demonstrate, active,
encourage, recover and celebrate. It has no external buffers, textures or URLs.

Regenerate from the project root with `node scripts/create-trainer.mjs`.
The asset is checked in, so ordinary startup does not run the generator.
Three.js is an npm dependency under its MIT license; it is bundled locally.
