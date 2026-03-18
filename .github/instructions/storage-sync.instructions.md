---
description: "Use when editing AsyncStorage, Firestore sync, offline queue, or Pro-gated data flows in frontend services and hooks, including storage.ts, firestore.ts, offlineQueue.ts, useOfflineSync, and related state handling."
name: "GainTrack Storage and Sync"
applyTo: "frontend/src/services/storage*.ts, frontend/src/services/firestore*.ts, frontend/src/services/offlineQueue*.ts, frontend/src/services/workoutFirestore*.ts, frontend/src/hooks/useOfflineSync*.ts, frontend/src/hooks/usePro*.ts, frontend/src/store/authStore*.ts"
---
# Storage and Sync Instructions

## Source of Truth and Pro Gating
- Gate paid cloud features through frontend/src/hooks/usePro.ts.
- Treat Firestore user isPro as authoritative; do not add client write paths that mutate isPro.
- Mark Pro-gated logic with // [PRO] where practical.

## Data Shape and Paths
- Keep Firestore collections user-scoped using the established workouts, exercises, progress, nutrition, and programs paths.
- Maintain existing native/web split implementations when present.
- Preserve local-first behavior: AsyncStorage should remain responsive even when network services are unavailable.

## Date and Metrics Conventions
- Prefer date-fns format(date, 'yyyy-MM-dd') for keyed daily docs.
- Keep 1RM calculations aligned with Brzycki: weight * (36 / (37 - reps)).

## Reliability and Safety
- Keep offline queue and retry logic idempotent where possible.
- Avoid broad refactors across sync services unless requested; small compatibility-preserving edits are preferred.
