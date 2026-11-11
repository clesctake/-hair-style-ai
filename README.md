# DEV-01 public source recovery subset

This branch contains seven original helper/test files selected from the recorded source commit. It is a code-only recovery subset, not a complete application, deployment, private-asset backup, or copy of the original development history. See PUBLIC_A_MANIFEST.json for exact paths and SHA-256 values.

The single bootstrap ancestor contains only an already-public README and package.json. Its historical model/setup instructions are not the specification for this subset or the current application.

Two self-contained tests run with Node 24+ and no dependency installation:

```sh
node --experimental-strip-types --test --test-isolation=none --test-concurrency=1 tests/verification-digest.test.mjs tests/after-review-upload-gate.test.mjs
```

The remaining helper files refer to application contracts not included here. Do not treat these files as a runnable full app or a production authentication/spending implementation. No image-generation API execution is part of this snapshot.
