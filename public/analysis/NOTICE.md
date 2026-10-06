# Third-party analysis assets

MediaPipe Tasks Vision 1.0.1, WebAssembly runtimes, Hair Segmenter v1, and Face
Landmarker v1 are distributed under the Apache License 2.0. See
`LICENSE-MEDIAPIPE.txt` and the individual SDK/WASM copyright headers.

Copyright notices belong to the MediaPipe / Google authors. COLOR FUTURE AI is
not affiliated with Google or MediaPipe. No endorsement is implied.

## Local SDK modification — 2026-10-04

`vision_bundle.mjs` contains one reproducible modification: creation of the
default task-usage telemetry logger is disabled. No inference, model, or browser
network API is replaced. The worker and the main-thread fallback both load this
modified bundle from the same origin. The original SDK hash and all served asset
hashes are recorded in `asset-manifest.json`.

The patch is applied by `scripts/prepare-analysis-assets.mjs`, which accepts only
the pinned 1.0.1 upstream bundle hash and exactly one matching initializer.
Updating the SDK requires reviewing this patch again. The SDK is otherwise
unmodified. No customer photo needs to leave the browser for Phase 2 analysis.

Upstream sources:

- https://www.npmjs.com/package/@mediapipe/tasks-vision/v/1.0.1
- https://github.com/google-ai-edge/mediapipe
- https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/mediapipe/tasks/web/core/task_runner.ts
- https://storage.googleapis.com/mediapipe-models/image_segmenter/hair_segmenter/float32/1/hair_segmenter.tflite
- https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
- https://storage.googleapis.com/mediapipe-assets/Model%20Card%20-%20Hair%20Segmentation.pdf
- https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf

## Model limits

Hair Segmenter identifies image pixels that resemble hair; it does not measure
chemical pigments, damage, porosity, melanin, or natural versus artificial colour.
Side/back views, occlusions, hats, fine strands, light hair, and poor lighting need
stylist review. Face Landmarker outputs facial surface landmarks, not a skull
measurement or an actual hairline. Hairline, forehead boundaries, and hidden head
shape remain unknown. Pixel Lab/LCh values are uncalibrated image observations.
