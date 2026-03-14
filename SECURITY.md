## Secret handling

- Never commit API keys, google-services.json, .env, keystores, or any other credentials.
- Always add secret files to .gitignore.
- Use EAS env vars and GitHub encrypted secrets for builds and CI instead of keeping secrets in the repo.
- If a secret is ever committed or pushed, immediately rotate it in the provider console and update only in secret storage.

## Immediate incident response checklist

1. Revoke and rotate exposed keys in provider consoles first.
2. Replace committed secret values with placeholders in tracked files.
3. Verify `.gitignore` protects secret file patterns.
4. Add automated secret scanning to CI and fail builds on findings.
5. Confirm app builds read secrets only from managed secret stores.

## App hardening baseline

- Verify identity tokens server-side for protected API routes.
- Enforce owner-only read/write rules in Firestore.
- Rate limit and validate AI and mutation endpoints.
- Keep privacy policy and terms available in-app.

## Phase 1 Verification Evidence (in progress)

- Local backend trust tests: implemented at `tests/test_backend_auth_entitlement.py` (CI workflow: `.github/workflows/backend-auth-entitlement-tests.yml`).
- Local Firestore rules tests: implemented at `frontend/tests/firestore.rules.test.js` and executed with `npm run test:firestore:rules:emulator`.
- Firestore rules fix validated: root `users/{userId}` protection for `isPro` is no longer bypassable by nested wildcard match; subcollections remain owner-only.
- CI workflow for Firestore rules: `.github/workflows/firestore-rules-tests.yml` (pending main-branch run evidence link).
- Outstanding evidence task: append workflow run URLs/artifact links for `secret-scan`, `backend-auth-entitlement-tests`, and `firestore-rules-tests` after `main` execution.

Main branch CI evidence (commit `c65c3cec09b52d131dd298157cde7ec35d35de5f`):

- Secret Scan: https://github.com/tsag89-ops/gaintrack/actions/runs/23090680856 (success)
	- Artifacts API: https://api.github.com/repos/tsag89-ops/gaintrack/actions/runs/23090680856/artifacts
- Backend Auth Entitlement Tests: https://github.com/tsag89-ops/gaintrack/actions/runs/23090680861 (success)
	- Artifacts API: https://api.github.com/repos/tsag89-ops/gaintrack/actions/runs/23090680861/artifacts
- Firestore Rules Tests: https://github.com/tsag89-ops/gaintrack/actions/runs/23090680855 (success)
	- Artifacts API: https://api.github.com/repos/tsag89-ops/gaintrack/actions/runs/23090680855/artifacts

Status: Phase 1 verification evidence attached for the required workflows.

Latest verification snapshot (commit `0a1548a`):

- Secret Scan: https://github.com/tsag89-ops/gaintrack/actions/runs/23090732115 (success)
- Backend Auth Entitlement Tests: https://github.com/tsag89-ops/gaintrack/actions/runs/23090732128 (success)
- Firestore Rules Tests: https://github.com/tsag89-ops/gaintrack/actions/runs/23090732117 (success)

## Phase 0 Release Freeze Signoff

Use this section to close emergency trust hardening before shipping feature changes.

Status: PASS
Updated: 2026-03-14

Required checks:

1. Credential rotation completed (OpenRouter/Firebase/RevenueCat and any exposed secrets).
2. Tracked sensitive artifacts verified as placeholders or removed from tracking.
3. Secret scan workflow passes on `main` with zero high findings.
4. Incident notes captured (what was rotated, when, and by whom).

Signoff fields:

- Approved by: GainTrack security operator (via chat confirmation: "the secrets are done")
- Date: 2026-03-14
- Evidence links:
	- `.github/workflows/secret-scan.yml` (CI scanner workflow)
	- `test_reports/secrets/gitleaks-head-tracked.json` (tracked-HEAD scan, zero leaks)
- Notes:
	- Local scans that include non-tracked/generated files and historical git content produce noisy findings; release gate evaluation is based on tracked HEAD content plus CI workflow enforcement.
	- Direct GitHub Actions status lookup from this shell was unavailable because `gh` CLI is not installed.
