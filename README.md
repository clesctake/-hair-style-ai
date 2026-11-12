# DEV-01 public source recovery subset

This branch preserves eleven individually reviewed original helper/test files, including four isolated security test implementation files. It is a code-only recovery subset, not a complete application, deployment, private-asset backup, or copy of the original development history. See PUBLIC_A_MANIFEST.json for exact source revisions, file paths and SHA-256 values.

The bootstrap ancestor contains only an already-public README and package.json. Historical model/setup instructions in that ancestor are not the specification for the current application. Subsequent commits on this branch contain only reviewed public snapshots.

Download or clone this dedicated branch, then compare the exact bytes of the eleven files against PUBLIC_A_MANIFEST.json. Do not restore this subset over a complete working application. Restore to a separate directory.

Two self-contained tests run with Node 24+ and no dependency installation:

```sh
node --experimental-strip-types --test --test-isolation=none --test-concurrency=1 tests/verification-digest.test.mjs tests/after-review-upload-gate.test.mjs
```

The other files refer to application contracts omitted from this subset. Their original test results require those contracts and cannot be reproduced from this subset alone. The SQLite fixture is TEST_ONLY, not production authentication, authorization or spending control. No image-generation API execution is authorized by this snapshot.
