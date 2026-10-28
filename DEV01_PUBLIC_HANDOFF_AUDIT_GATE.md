# DEV-01 public handoff — audit gate

Status: HOLD — no source has been approved for public upload.

Source snapshot: SITES_LATEST_9fa7694
Archive inventory: 2,525 entries; target snapshot: 757 files.
Preliminary filename-based candidates: 245; further review/hold: 512.
These counts are NOT a security approval.

The original 168MB archive, approved Visual Masters, client images, fonts, internal histories, credentials and sensitive data MUST NOT be pushed to this public repository.

Before transferring source:
1. Review every candidate's actual content for secrets, PII, licensed assets, embedded base64, URLs and runtime configuration.
2. Confirm all dependencies, build inputs and licensing; inspect all 512 held files for required dependencies.
3. Generate a reproducible sanitized staging tree and per-file hashes.
4. Run tests and build without production credentials.
5. Only commit approved sanitized code to this dedicated branch.
6. Preview deploy only after successful validation. Never modify main or production.

This is an audit marker, not a complete Codex source handoff.
