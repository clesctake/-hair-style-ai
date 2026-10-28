# DEV-01 Codex source-recovery manifest (metadata only)

Status: **PARTIAL — full archive NOT transferred into Codex or public GitHub**.
This document contains no source code, customer images or private Visual Master.

## Verified local archive in originating ChatGPT session
- filename: DEV01_FINAL_SOURCE_FOR_CODEX.zip
- byte length: 167973482
- SHA256: c6079ec3846c838686038c8f8a9eb15838fe5721fada315cd6a027cb2dcd9cb6
- ZIP entries: 2525
- ZIP testzip: no CRC failures
- companion: DEV01_CODEX_HANDOFF_MANIFEST.md
- Verified locally in the originating ChatGPT container, **not** in Codex.

## Source provenance (from companion manifest)
- WORK_COUNSELING_VERSION21: cd3dc7791b2883bd0acd67937e2c18718a66419b
- WORK_V22_VERSION19: 1843821e5bcc2d2f8fdf242269dad1bbab683b96
- LATEST_WORK_TOPIC local Git commit: 6ecc84979890a60ad7862665ef7038ad2434198d
- Latest remote Sites topic: 9fa76946d9220ca75aa942dd83e7b4f881370369
- The source manifest reports that 6ecc849 and 9fa7694 contain the same application code; Codex has not independently verified this.

## Safety and completion gate
1. Public repository is NOT a safe destination for the full archive, approved Visual Master, sample/person images without rights review, internal logs or secrets.
2. Only security-reviewed, license-reviewed, buildable source may enter this public feature branch.
3. Codex must obtain the archive via an authorized **private** mechanism and independently validate hash, ZIP and source inventory before declaring REAL.
4. Do not modify main, production, DEV-02, DEV-03 or approved Page 3 design.
5. No paid AI API tests without authorization.
6. Existing repository contains older, incomplete source; **a successful build is not a verified complete DEV-01 migration**.
