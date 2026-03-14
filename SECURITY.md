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

## Phase 4 Security and Quality Operations Baseline

Status: IMPLEMENTED
Updated: 2026-03-14

Implemented release gates:

1. OWASP MASVS cadence artifact and category mapping:
	- `test_reports/security/masvs-cadence.md` (storage, authentication, network, privacy)
	- Enforced by workflow job `masvs-cadence-gate` in `.github/workflows/security-quality-ops.yml`
2. Policy regression release gate:
	- Tests at `tests/test_policy_regression_gates.py`
	- Enforced by workflow job `policy-regression-gate` in `.github/workflows/security-quality-ops.yml`
3. Dependency/SCA gates:
	- Frontend gate: `npm audit --omit=dev --audit-level=high` (`frontend-sca` job)
	- Backend gate: `pip-audit -r backend/requirements.txt` (`backend-sca` job)
	- Workflow: `.github/workflows/security-quality-ops.yml`

Verification notes:

- Local execution of new Python-based tests is blocked in this shell because no Python runtime is installed/configured.
- CI is configured to run all gates on pull requests, pushes to `main`, weekly schedule, and manual dispatch.

First main-branch evidence run (commit `ae39b64b0502a65184fb2b9b4c084791819ed078`):

- Security Quality Operations: https://github.com/tsag89-ops/gaintrack/actions/runs/23094523822
	- MASVS Cadence Gate: success
	- Policy Regression Gate: success
	- Frontend SCA Gate: failure
	- Backend SCA Gate: failure
- Artifacts API: https://api.github.com/repos/tsag89-ops/gaintrack/actions/runs/23094523822/artifacts

Follow-up required:

- Triage and remediate dependency/SCA failures (frontend npm audit + backend pip-audit) before enabling security-quality run status as a release-pass criterion.

Remediation progress (2026-03-14):

- Frontend SCA: high findings remediated via root workspace overrides in `package.json` (`tar` >= 7.5.11, `undici` >= 6.24.0).
- Local verification: `frontend` command `npm audit --omit=dev --audit-level=high` now passes with only moderate findings (`markdown-it` via `react-native-markdown-display`, no upstream fix available).
- Remaining blocker: backend `pip-audit` job still failing in CI and requires dependency triage/upgrade plan.

Latest CI validation after frontend remediation (commit `5ec4442b40f6a0346a96144f8e3a1880e1956a7b`):

- Security Quality Operations: https://github.com/tsag89-ops/gaintrack/actions/runs/23094626097
	- MASVS Cadence Gate: success
	- Policy Regression Gate: success
	- Frontend SCA Gate: success
	- Backend SCA Gate: failure

Backend remediation + full-pass validation (commit `c63ed3bfc6be397ccd881af93054f322b2ce2655`):

- Security Quality Operations: https://github.com/tsag89-ops/gaintrack/actions/runs/23094799454
	- MASVS Cadence Gate: success
	- Policy Regression Gate: success
	- Frontend SCA Gate: success
	- Backend SCA Gate: success
- Artifacts API: https://api.github.com/repos/tsag89-ops/gaintrack/actions/runs/23094799454/artifacts

Remediation summary:

- Backend dependencies trimmed to runtime scope in `backend/requirements.txt`.
- JWT verification migrated from `python-jose` to `PyJWT` in `backend/server.py`.
- Vulnerable/failing backend dependency pins upgraded (`fastapi`, `starlette`, `pymongo`, `PyJWT`) and CI auth test workflow pins aligned.
