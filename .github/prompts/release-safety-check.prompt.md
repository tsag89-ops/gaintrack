---
description: "Run a focused pre-merge release safety checklist for GainTrack covering frontend quality gates, backend gate tests, and result summary."
name: "GainTrack Release Safety Check"
argument-hint: "Scope or changed files (optional)"
agent: "agent"
---
Run the GainTrack release safety check for this workspace.

Required checks:
1. Frontend lint from frontend: npm run lint
2. Frontend typecheck from frontend: npx tsc --noEmit
3. Firestore rules tests from frontend: npm run test:firestore:rules
4. Backend auth and entitlement gate from repo root: python -m pytest tests/test_backend_auth_entitlement.py -q
5. Backend policy regression gate from repo root: python -m pytest tests/test_policy_regression_gates.py -q

Execution rules:
- Use PowerShell commands appropriate for Windows.
- If a tool is missing, report the exact blocker and continue with remaining checks.
- Keep output concise and structured as pass, fail, or blocked per check.

Return format:
- Overall status: pass, fail, or blocked
- Checks:
  - Name
  - Status
  - Command used
  - Key result summary
- Risk notes: short list of release-impacting issues only
- Recommended next action: one concrete next step
