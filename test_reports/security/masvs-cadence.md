# GainTrack MASVS Security Cadence

Last updated: 2026-03-14
Owner: Security + Mobile Engineering
Cadence: Every release candidate + weekly CI schedule

## Scope Mapping

- Storage: validate no plaintext sensitive data in AsyncStorage keys containing auth/session material; verify secure secret delivery through EAS managed secrets.
- Authentication: verify backend Firebase token checks reject invalid/expired/forged tokens.
- Network: verify TLS-only endpoints, API auth required on protected routes, and AI/mutation rate limits remain enforced.
- Privacy: verify Privacy Policy and Terms remain linked in login/profile flows and account deletion/export rights remain reachable.

## Release Gate Checklist

- [ ] Secret scanner workflow passes on main and release branch.
- [ ] Policy regression tests pass for legal links and rights-entry points.
- [ ] Backend auth/entitlement tests pass.
- [ ] Firestore rules tests pass.
- [ ] Dependency/SCA checks pass for frontend and backend.

## Evidence Sources

- `.github/workflows/secret-scan.yml`
- `.github/workflows/backend-auth-entitlement-tests.yml`
- `.github/workflows/firestore-rules-tests.yml`
- `.github/workflows/security-quality-ops.yml`
- `tests/test_policy_regression_gates.py`
