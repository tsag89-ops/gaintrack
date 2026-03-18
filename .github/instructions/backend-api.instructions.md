---
description: "Use when editing FastAPI backend routes, auth, entitlement checks, or backend policy/security tests under backend and tests/test_backend_*.py."
name: "GainTrack Backend API"
applyTo: "backend/**/*.py, tests/test_backend_*.py, tests/test_policy_regression_gates.py"
---
# Backend API Instructions

## API and Security Baseline
- Keep auth and entitlement validation server-side for protected operations.
- Maintain owner-scoped data access and avoid widening trust boundaries.
- Prefer explicit validation and defensive error handling in API inputs.

## Testing Expectations
- Update or add focused tests when backend behavior changes.
- Prioritize regression coverage for auth and entitlement logic.
- Keep policy regression tests passing when route strings or policy links are touched.

## Implementation Style
- Favor small, targeted edits to backend/server.py and related helpers.
- Preserve existing endpoint contracts unless a task explicitly calls for a breaking change.
- Do not introduce secrets into code or committed configuration.
