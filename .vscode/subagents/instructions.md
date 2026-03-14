## GainTrack Context Override
- Stack: Expo managed workflow, React Native, TypeScript
- No eject, no paid services, free tiers only
- Local path: C:\gaintrack\gaintrack\frontend\
- Navigation: Expo Router file-based (app/ folder)
- State: AsyncStorage local + Firestore free tier
- Monetization: RevenueCat, isPro flag gates Pro features
- Never commit secrets (.env, google-services.json)

---
# GainTrack VS Code Subagents β€” Master Guide

## What Are Subagents?
Subagents are specialized AI prompt templates that give GitHub Copilot a focused role for a specific part of your app. Instead of asking a general question, you paste the relevant agent prompt first so Copilot understands exactly what you're building and how.

---

## 6 Subagents at a Glance

| # | Agent File | Slash Trigger | Role | When to Use |
|---|-----------|---------------|------|-------------|
| 1 | `ui-agent.md` | `/ui` | Screen & component designer | New screens, layouts, modals, dark-mode polish |
| 2 | `storage-agent.md` | `/storage` | AsyncStorage + Firestore sync | New data keys, schema migrations, offline-first logic |
| 3 | `charts-agent.md` | `/charts` | Progress graphs (Pro) | 1RM trend, weekly volume, PR highlights |
| 4 | `revenuecat-agent.md` | `/iap` | Freemium gates & IAP | Pro paywalls, usePro() hook, feature locks |
| 5 | `eas-agent.md` | `/eas` | Builds & OTA deploys | Publishing updates, preview builds, CI/CD |
| 6 | `debug-agent.md` | `/debug` | Error diagnosis & fixes | TS errors, crash logs, broken navigation |

---

## Universal Context Block Template

Paste this block at the TOP of every Copilot Chat message before describing your task.
Replace the values inside `< >` with your actual context.

```
CONTEXT:
  Project:  GainTrack β€” Expo managed workflow, React Native, TypeScript
  Repo:     C:\gaintrack\gaintrack
  Frontend: C:\gaintrack\gaintrack\frontend
  Platform: Android + iOS, dark mode only
  Theme:    Primary #FF6200, Background #1A1A1A, Surface #252525, Text #FFFFFF

STACK:
  expo-router 4.x
  react-native-reanimated 3.x
  @react-native-async-storage/async-storage
  firebase (Firestore free tier)
  react-native-purchases (RevenueCat)
  expo-haptics
  react-native-chart-kit





OUTPUT_FORMAT:
  - Full .tsx / .ts file(s) β€” no partial snippets
  - npx expo install commands for any new dependencies
  - 3-step test instructions
  

---

## GainTrack Feature Status Table

| Feature | Free | Pro ($4.99/yr) | Status |
|---------|------|----------------|--------|
| Exercise Library | Top 50 | Full 1000+ | β… Free done, Pro locked |
| Workout Logging | Basic sets/reps | + Supersets, RPE | β… Basic done |
| Rest Timer | β… | β… | β… Done |
| Exercise Videos/GIFs | β | β… | π”„ Component built, Pro gate needed |
| Progress Graphs (1RM) | β | β… | β Not started |
| PR Tracking | β | β… | β Not started |
| Plate Calculator | β… | β… | β… Done |
| Firestore Sync | β | β… | β… Sync logic done |
| CSV Export | β | β… | β Not started |
| AI Suggestions | Preview (3/day) | Unlimited | π”„ Basic done |
| Macros Tracking | Basic | Full history + charts | π”„ In progress |
| Supersets | β | β… | β Not started |
| Body Measurements | β… | β… + Charts | π”„ Input done |

---

## Suggested Next 2 Features

### 1. 1RM Progress Chart (High Impact β€” Pro Upsell)
- **Why:** The #1 reason users pay for fitness apps is to see their progress visually.
- **Agent:** `/charts` then `/iap` for the Pro gate paywall.
- **Files:** `components/charts/OneRMChart.tsx`, `app/(tabs)/progress.tsx`
- **Formula:** `weight * (36 / (37 - reps))` (Brzycki)

### 2. Superset Support in Active Workout (Differentiator)
- **Why:** Hevy supports supersets β€” it's a top user request and a strong Pro upsell.
- **Agent:** `/ui` for the UI, `/storage` for the schema update.
- **Files:** `app/workout/active.tsx` (update), `src/store/workoutStore.ts` (schema)
- **Schema change:** Add `superset_id?: string` to `WorkoutSet` type.

---

## File Locations Quick Reference

```
.vscode/subagents/
  instructions.md       β† This file (master guide)
  ui-agent.md           β† /ui
  storage-agent.md      β† /storage
  charts-agent.md       β† /charts
  revenuecat-agent.md   β† /iap
  eas-agent.md          β† /eas
  debug-agent.md        β† /debug
```

---

## Golden Rules (Never Break These)

1. **Never run `git` from `frontend/`** β€” always run git from `C:\gaintrack\gaintrack`.
2. **Never run `expo` / `eas` from repo root** β€” always `cd frontend` first.
3. **Never commit secrets** β€” `.env`, `google-services.json`, API keys go in EAS secrets only.
4. **Always AsyncStorage first, Firestore second** β€” offline-first architecture.
5. **Never hardcode `isPro = true`** β€” always read from `authStore` β†’ Firestore.
6. **Always use `format(date, 'yyyy-MM-dd')` from date-fns** β€” never `.toISOString().split('T')[0]`.

