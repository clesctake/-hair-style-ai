# DEV-01 / Public code staging review — 2026-10-28

Status: **PARTIAL / source not uploaded**.

Recovered source candidate: `sources/SITES_LATEST_9fa7694/` from `DEV01_FINAL_SOURCE_FOR_CODEX.zip`.

A conservative local scan of all **757** files produced:
- **272** included in a code-only review ZIP (1,313,089 bytes).
- **485** excluded or quarantined pending review; 483 matched visual/binary extension rules, 484 contained binary bytes, one matched an OpenAI-key-like string.
- The key-pattern match was in `tests/auth-recovery-v22.test.mjs`, within a test that explicitly checks redacted and placeholder credential formats. No credential value is reproduced here.
- The ZIP is a **review candidate, not a runnable complete application**. Assets, models and approved visual masters are intentionally not included.
- Public distribution of any person photographs or third-party assets remains **UNVERIFIED**.
- No application code or visual assets have been uploaded to GitHub in this action.

Candidate SHA-256 and file inventory are available in the local `DEV01_PUBLIC_CODE_REVIEW_REPORT.json` generated in ChatGPT, not committed here.

Blockers: bulk transfer channel for local files to GitHub, rights/PII review of media, clean Node >=24 install and tests.

Do not merge/deploy or alter main, existing branches, DEV-02 or DEV-03.