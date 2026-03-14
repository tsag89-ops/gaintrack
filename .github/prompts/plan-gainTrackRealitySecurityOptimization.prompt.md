## Plan: GainTrack Reality + Security Optimization

Harden immediate trust/compliance risks first (secrets, token validation, policy artifacts), then raise retention and paid conversion by closing top parity gaps versus Hevy/Strong/MyFitnessPal (engagement loops, integrations, analytics depth). Approach is phased to reduce legal/security exposure in weeks 1-4 while building product differentiation in parallel-safe tracks.

**Steps**
1. Phase 0 - Emergency trust hardening (week 0-1): rotate exposed keys, remove sensitive files from repository history and working tree, enforce secrets scanning in CI, and freeze release until verification completes. This blocks all later rollout work.
2. Phase 1 - Server-side auth and entitlement trust (week 1-2, depends on 1): verify Firebase ID tokens in backend for every protected route, stop trusting client-written pro flags, and enforce RevenueCat/Firebase-backed entitlement checks server-side for premium data paths.
3. Phase 1 - Firestore and API access control baseline (week 1-2, parallel with 2 after 1): add versioned Firestore rules with owner-only access and field validation; add request validation/rate limiting for AI endpoints and backend mutation endpoints.
4. Phase 1 - Compliance artifacts and user rights (week 1-2, parallel with 2 and 3 after 1): publish Privacy Policy and Terms, add in-app links, implement account deletion workflow, and expand export beyond workout CSV to full user data portability package.
5. Phase 2 - Retention infrastructure (week 3-5, depends on 2-4): implement backend-scheduled push jobs and lifecycle messaging (day 1/day 7/day 30), then add first-workout guided onboarding to increase activation.
6. Phase 2 - Engagement loops (week 4-7, parallel with 5): ship streak preservation UX, achievement badges, milestone prompts, and weekly recap mechanics tied to workout/macro consistency.
7. Phase 3 - Competitive integrations (week 6-10, depends on 2-4): implement HealthKit and Google Fit read sync first, then evaluate Strava and wearable extensions based on adoption telemetry.
8. Phase 3 - Analytics depth for advanced users (week 7-11, parallel with 7): add progression scoring, fatigue/deload recommendations, and periodization views to reduce experienced-user churn.
9. Phase 4 - Network effects (week 10-14, depends on 5-8): launch lightweight social layer (friends + private leaderboard + shareable workout cards) before full community feed.
10. Phase 4 - Security and quality operations (continuous from week 1): add mobile security test cadence mapped to OWASP MASVS categories (storage, auth, network, privacy), dependency/SCA checks, and release gates for policy/security regressions.

**Relevant files**
- C:/gaintrack/gaintrack/frontend/.env.prod.local - Remove and rotate exposed OPENROUTER key and any committed env secrets.
- C:/gaintrack/gaintrack/frontend/.env - Ensure no production secrets are committed; move sensitive values to managed secrets.
- C:/gaintrack/gaintrack/frontend/app/api/ai-chat+api.ts - Add server-side validation, abuse controls, and safer provider configuration.
- C:/gaintrack/gaintrack/backend/server.py - Enforce token verification and entitlement trust boundary on protected APIs.
- C:/gaintrack/gaintrack/frontend/src/store/authStore.ts - Prevent client authority over pro state; consume verified source of truth.
- C:/gaintrack/gaintrack/frontend/src/services/revenueCat.ts - Align entitlement refresh cadence and conflict handling with backend trust model.
- C:/gaintrack/gaintrack/frontend/src/services/firestore.ts - Apply stricter write/read constraints and schema checks.
- C:/gaintrack/gaintrack/frontend/src/services/notifications.ts - Integrate backend-triggered schedule strategy and reliability handling.
- C:/gaintrack/gaintrack/frontend/app/(tabs)/progress.tsx - Expand export from limited CSV to full portability scope.
- C:/gaintrack/gaintrack/frontend/app/(auth)/login.tsx - Add privacy/terms consent links and account-rights entry points.
- C:/gaintrack/gaintrack/SECURITY.md - Update operational runbook with rotation and incident checklist.
- C:/gaintrack/gaintrack/.gitignore - Normalize and enforce secret/binary exclusions.
- C:/gaintrack/gaintrack/frontend/app/(tabs)/ai-suggestions.tsx - Clarify data-sharing disclosure and explicit consent UX.
- C:/gaintrack/gaintrack/frontend/app/workout/active.tsx - Reference for advanced logging extensions and engagement hooks.
- C:/gaintrack/gaintrack/frontend/app/(tabs)/progress.tsx - Reference for advanced analytics expansion.

**Verification**
1. Security verification: confirm no live secrets in tracked files; run secret scanner in CI and verify zero high findings.
2. Auth verification: attempt API calls with invalid, expired, and forged Firebase tokens; ensure backend rejects all.
3. Entitlement verification: test pro-gated flows with mismatched client state vs backend/subscription state; verify server remains authoritative.
4. Firestore verification: run emulator/rules tests for cross-user read/write attempts and schema-violating payloads.
5. Compliance verification: verify in-app Privacy Policy/Terms availability, account deletion completion, and full user-data export package generation.
6. Retention verification: validate scheduled notification delivery in foreground/background and lifecycle campaign triggers.
7. Product impact verification: track D1/D7 retention, paywall conversion, and pro churn before/after each phase with release checkpoints.
8. Benchmark verification: re-score GainTrack against Hevy/Strong/MyFitnessPal parity matrix after Phase 2 and Phase 3.

**Decisions**
- Security/compliance work is treated as release-blocking until Phase 1 closes critical risks.
- RevenueCat/Firebase/backend entitlement reconciliation is prioritized over adding new premium features.
- Health integrations are prioritized ahead of social features due to stronger near-term retention impact for fitness users.
- Apple Watch/full wearable companion is deferred until core security, retention, and integration baselines are stable.
- Included scope: security, compliance, retention mechanics, parity integrations, analytics depth.
- Excluded for now: full social feed, coach marketplace, broad wearable app surface beyond initial integrations.

**Further Considerations**
1. Data residency and legal posture: Option A keep single-region now with clear disclosure; Option B move to regional controls before EU expansion.
2. AI provider policy: Option A continue OpenRouter with stricter controls and explicit consent; Option B proxy through backend model tier for tighter governance.
3. Monetization sequencing: Option A gate advanced analytics first; Option B gate integrations first; recommendation is Option A for faster conversion lift with lower engineering cost.

## Progress Tracker (updated 2026-03-14)

Legend: `COMPLETED`, `IN PROGRESS`, `BLOCKED`, `NOT STARTED`

1. Phase 0 - Emergency trust hardening: COMPLETED
	- Completed: `.gitignore` hardened for env/credential files, placeholders used for env templates, and CI secret scan workflow added at `.github/workflows/secret-scan.yml`.
	- Completed: tracked `frontend/GoogleService-Info.plist` is a placeholder (no live credential values) and is documented as EAS file-secret injected at build time.
	- Closure checklist:
	  - [x] Rotate OpenRouter/Firebase/RevenueCat and any other previously exposed credentials. (confirmed by operator)
	  - [x] Replace tracked sensitive artifacts with placeholders or EAS-injected files (`GoogleService-Info.plist` is tracked as placeholder only).
	  - [x] Run CI secret scan and confirm zero high findings on `main`.
	    - Evidence: tracked-HEAD secret scan passed (`gitleaks dir` on `git archive HEAD`) with `ExitCode=0` and `no leaks found`; report: `test_reports/secrets/gitleaks-head-tracked.json`.
	    - Note: direct GitHub Actions status query from this shell is unavailable (no `gh` CLI), but workflow is configured at `.github/workflows/secret-scan.yml`.
	  - [x] Record release-freeze signoff in `SECURITY.md` (who approved + date).

2. Phase 1 - Server-side auth and entitlement trust: COMPLETED
	- Completed: backend Firebase ID token verification is implemented in `backend/server.py` and protected routes depend on authenticated user context.
	- Completed: server-authoritative Pro entitlement checks now gate premium endpoints in `backend/server.py` (`/progression/suggestions`, `/progression/exercise/{exercise_name}`, `/measurements/stats/progress`, `/stats/workout-volume`, `/stats/nutrition-adherence`).
	- Completed: automated backend verification tests added at `tests/test_backend_auth_entitlement.py` for invalid/expired/forged token rejection paths and entitlement mismatch/fallback enforcement.
	- Completed: CI workflow added at `.github/workflows/backend-auth-entitlement-tests.yml` to run `tests/test_backend_auth_entitlement.py` and upload JUnit artifacts to `test_reports/pytest/backend-auth-entitlement.xml`.
	- Completed: workflow pass confirmed on `main` and evidence links captured in `SECURITY.md` (run: `23090680861`).

3. Phase 1 - Firestore and API access control baseline: COMPLETED
	- Completed: Firestore owner-only rules and `isPro` write protection exist in `frontend/firestore.rules`; AI route validation + rate limiting exists in `frontend/app/api/ai-chat+api.ts`.
	- Completed: mutation schema validation and abuse controls expanded in `backend/server.py` (strict constraints for goals/equipment/workouts/measurements/nutrition inputs, date key validation, and per-scope mutation rate limits).
	- Completed: Firestore emulator/rules tests added (`frontend/tests/firestore.rules.test.js`) and CI workflow added (`.github/workflows/firestore-rules-tests.yml`).
	- Completed: local emulator verification passed (`npm run test:firestore:rules:emulator`) for owner-only access, cross-user denial, unauthenticated denial, and `isPro` create/update protection.
	- Completed: CI workflow pass confirmed on `main` and evidence links captured in `SECURITY.md` (run: `23090680855`).

4. Phase 1 - Compliance artifacts and user rights: COMPLETED
	- Completed: Privacy Policy and Terms screens exist; in-app links are wired from login/profile; account deletion and full JSON export are available in `frontend/app/(tabs)/profile.tsx`.

5. Phase 2 - Retention infrastructure: COMPLETED
	- Completed: backend lifecycle notification infrastructure added in `backend/server.py` with internal cron-protected preview/dispatch endpoints and push token upsert (`/notifications/push-token`, `/notifications/lifecycle/jobs`, `/notifications/lifecycle/dispatch`).
	- Completed: day 1/day 7/day 30 lifecycle job generation rules implemented and covered with additional tests in `tests/test_backend_auth_entitlement.py`.
	- Completed: lifecycle dispatch now sends through Expo Push API in `backend/server.py` and writes per-job success/failure status.
	- Completed: frontend onboarding telemetry hook added to first successful workout completion in `frontend/app/workout/active.tsx` and posted via `frontend/src/services/notifications.ts` to `/notifications/lifecycle/first-workout`.
6. Phase 2 - Engagement loops: COMPLETED
	- Completed: Home dashboard engagement block added in `frontend/app/(tabs)/index.tsx` with weekly momentum (workout days + nutrition days + streak), milestone badge progress to next workout threshold, and weekly recap entry CTA.
	- Completed: milestone unlock prompt + success haptic on workout completion added in `frontend/app/workout/active.tsx` for thresholds (1, 5, 10, 25, 50, 100, 200).
	- Completed: streak-preservation intervention added on Home momentum card to detect "worked out today" and surface a "Protect" CTA when streak is at risk.
	- Completed: weekly recap CTA now provides in-app weekly summary (workout days, nutrition days, total volume, streak) before linking to full Progress analytics.
7. Phase 3 - Competitive integrations: COMPLETED
	- Completed: Pro-gated health integration baseline added in `frontend/src/services/healthSync.ts` with explicit consent state, provider enable/disable state, connection lifecycle, and sync result snapshots.
	- Completed: explicit permission UX and connect/sync controls added in `frontend/app/(tabs)/profile.tsx` for Apple Health (iOS) and Google Fit (Android).
	- Completed: native bridge packages installed in `frontend/package.json` (`react-native-health`, `react-native-health-connect`) and Expo config updated at `frontend/app.config.js` for Health Connect plugin + iOS HealthKit usage descriptions.
	- Completed: direct provider read baseline wired (`react-native-health` step count reads on iOS, `react-native-health-connect` steps reads on Android) and surfaced in sync results.
	- Completed: telemetry ingestion + Strava/wearable readiness evaluation added in `backend/server.py` (`/integrations/health/telemetry`, `/integrations/health/strava-readiness`) and surfaced in app UX through `frontend/src/services/healthSync.ts` + `frontend/app/(tabs)/profile.tsx`.
8. Phase 3 - Analytics depth for advanced users: COMPLETED
	- Completed: fatigue scoring and deload recommendation signals added in `frontend/app/progression.tsx` based on recent RPE and progression velocity.
	- Completed: periodization guidance card added in `frontend/app/progression.tsx` with 4-week phase rotation messaging (base/build/peak/deload).
	- Completed: progression insights now surface high-strain exercises to reduce advanced-user churn risk.
9. Phase 4 - Network effects: IN PROGRESS
	- Completed: backend social baseline added in `backend/server.py` with friend connection endpoint and private leaderboard endpoint (`/social/friends/connect`, `/social/friends`, `/social/leaderboard/private`).
	- Completed: shareable workout card flow added in `frontend/app/workout-history.tsx` via `frontend/src/services/social.ts`.
	- Completed: private leaderboard screen added in `frontend/app/social-leaderboard.tsx` and linked from `frontend/app/(tabs)/profile.tsx`.
	- Pending: fuller friend discovery/invites and richer share card formats.
10. Phase 4 - Security and quality operations: IN PROGRESS
	- Notes: secret scanning now added; OWASP MASVS cadence, SCA gates, and policy regression release gates still pending.

### Next Active Step
- Continue Phase 4 network effects: add friend discovery/invite flow and richer share card formats before community feed rollout.
