# GainTrack Workspace Instructions

## Scope
- This repository is a monorepo with a root workspace and a primary Expo app in frontend/.
- Prefer small, surgical edits. Do not rewrite large files unless requested.
- Keep existing files intact and enhance behavior incrementally.

## Stack and Architecture
- Frontend: Expo managed workflow, React Native, TypeScript, expo-router, Zustand, AsyncStorage.
- Pro sync and entitlements: Firestore + RevenueCat.
- Backend: FastAPI in backend/server.py.
- Route/app structure: frontend/app/ (expo-router), domain code in frontend/src/.
- Keep native/web splits when present (.native.ts and .web.ts).

## Autonomous Specialization Routing
- For every user prompt, infer the best-fit specialization before making edits or proposing commands.
- Use this primary routing map:
	- UI screens/components/styling/interaction/animation -> frontend-ui specialization.
	- AsyncStorage/Firestore/offline queue/usePro/authStore/data consistency -> storage-sync specialization.
	- FastAPI/auth/entitlement/security/policy tests -> backend-api specialization.
- For cross-cutting requests, split into small steps and choose one specialization per step.
- Prefer one primary specialization per response; add a secondary specialization only when required.
- Do not require the user to explicitly name an agent or specialization.

## Complementary Persona Sources
- When beneficial, consult matching persona guidance from .vscode/subagents and .agency-agents.
- Prefer engineering/testing personas for coding tasks, especially mobile app builder, frontend developer, rapid prototyper, code reviewer, security engineer, and reality checker.
- Use those personas as complementary guidance only; this workspace instruction set and scoped .github/instructions files remain the controlling rules.

## Build and Test Commands
Run from repo root unless noted.

```powershell
npm install
npm run start
npm run android
npm run ios
```

Frontend-specific:

```powershell
Set-Location frontend
npm run lint
npx tsc --noEmit
npm run test:firestore:rules
npm run test:firestore:rules:emulator
```

Backend tests:

```powershell
Set-Location C:\gaintrack\gaintrack
python -m pytest tests/test_backend_auth_entitlement.py -q
python -m pytest tests/test_policy_regression_gates.py -q
```

EAS:

```powershell
Set-Location frontend
npx eas build --platform android --profile production-apk --non-interactive
npx eas update --branch production --message "<description>"
```

## Coding Conventions
- TypeScript for frontend code; preserve strict typing.
- Expo managed workflow only; do not introduce eject/bare workflow changes.
- Dark-mode-only design language. Reuse tokens from frontend/src/constants/theme.ts.
- Use expo-haptics for user interactions where app patterns already use haptics.
- Use react-native-reanimated for non-trivial animations.
- Keep comments concise and meaningful.

## Pro Gating and Data Rules
- Gate paid features through frontend/src/hooks/usePro.ts.
- Treat Firestore user isPro as authoritative state; do not write isPro from client update paths.
- Mark Pro-gated logic with // [PRO] where feasible to keep behavior explicit.
- Firestore path conventions are user-scoped collections (workouts, exercises, progress, nutrition/programs).
- Date keys for Firestore documents should be stable and explicit; prefer date-fns format(date, 'yyyy-MM-dd') for keyed daily docs.
- 1RM formula standard is Brzycki: weight * (36 / (37 - reps)).

## Security and Secrets
- Never commit secrets or credential artifacts (.env, API keys, keystores, Firebase service config files).
- Use EAS/GitHub secret stores for build/runtime credentials.
- If a secret is exposed, rotate in provider first, then replace in managed secret storage.
- Keep Firestore rules owner-scoped and avoid widening read/write scope.

## Repo-Specific Pitfalls
- PowerShell paths containing parentheses must be quoted when used in commands like git add.
- Because frontend is a workspace package, running installs in frontend may still modify root lockfiles; review lockfile diffs before commit.
- EAS Android builds depend on frontend/eas-build-pre.sh and environment-provided Google services payloads; avoid bypassing this flow.

## Useful Reference Files
- frontend/app/_layout.tsx
- frontend/app/(tabs)/_layout.tsx
- frontend/src/constants/theme.ts
- frontend/src/hooks/usePro.ts
- frontend/src/store/authStore.ts
- frontend/src/services/firestore.ts
- frontend/src/services/revenueCat.ts
- frontend/src/services/storage.ts
- frontend/firestore.rules
- frontend/app.config.js
- backend/server.py
- SECURITY.md

## Optional Next Layer
If tasks get broad or noisy, add scoped instruction files under .github/instructions/ with applyTo patterns, for example:
- frontend-ui.instructions.md for frontend/app/** and frontend/src/components/**
- storage-sync.instructions.md for frontend/src/services/{storage,firestore,offlineQueue}*
- backend-api.instructions.md for backend/** and tests/test_backend_*.py
