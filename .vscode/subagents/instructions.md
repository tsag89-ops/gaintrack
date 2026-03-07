# GainTrack VS Code Subagents — Master Guide

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
  Project:  GainTrack — Expo managed workflow, React Native, TypeScript
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

CURRENT_PROGRESS:
  ✅ Active workout screen (app/workout/active.tsx — 640 lines, 0 TS errors)
  🔄 Exercise picker (app/(tabs)/exercises.tsx — in progress)
  ❌ Progress charts (not started)
  ❌ CSV export (not started)
  ❌ Supersets (not started)

TASK:
  <Describe exactly what you need — one sentence is fine>

OUTPUT_FORMAT:
  - Full .tsx / .ts file(s) — no partial snippets
  - npx expo install commands for any new dependencies
  - 3-step test instructions
  - One-line summary of what changed
```

---

## How to Switch Subagents Mid-Conversation

1. Type `/clear` in Copilot Chat to reset the conversation context.
2. Open the new agent file (e.g., `.vscode/subagents/charts-agent.md`).
3. Copy the entire file contents.
4. Paste it as your first message in the new Copilot Chat session.
5. Follow immediately with the Universal Context Block above.
6. State your task.

You do NOT need to re-paste the agent prompt for follow-up questions in the same session — Copilot remembers it.

---

## Workflow: Start to Deployed Feature (6 Steps)

```
1. OPEN    → VS Code → Copilot Chat (Ctrl+Alt+I)
2. PASTE   → Agent prompt from .vscode/subagents/<agent>.md
3. CONTEXT → Paste Universal Context Block with your task filled in
4. REVIEW  → Read the output, check for placeholder text
5. TEST    → Follow the 3-step test instructions from the output
6. DEPLOY  → Run: eas update --branch dev --message "feat: <what you built>"
```

---

## GainTrack Feature Status Table

| Feature | Free | Pro ($4.99/yr) | Status |
|---------|------|----------------|--------|
| Exercise Library | Top 50 | Full 1000+ | ✅ Free done, Pro locked |
| Workout Logging | Basic sets/reps | + Supersets, RPE | ✅ Basic done |
| Rest Timer | ✅ | ✅ | ✅ Done |
| Exercise Videos/GIFs | ❌ | ✅ | 🔄 Component built, Pro gate needed |
| Progress Graphs (1RM) | ❌ | ✅ | ❌ Not started |
| PR Tracking | ❌ | ✅ | ❌ Not started |
| Plate Calculator | ✅ | ✅ | ✅ Done |
| Firestore Sync | ❌ | ✅ | ✅ Sync logic done |
| CSV Export | ❌ | ✅ | ❌ Not started |
| AI Suggestions | Preview (3/day) | Unlimited | 🔄 Basic done |
| Macros Tracking | Basic | Full history + charts | 🔄 In progress |
| Supersets | ❌ | ✅ | ❌ Not started |
| Body Measurements | ✅ | ✅ + Charts | 🔄 Input done |

---

## Suggested Next 2 Features

### 1. 1RM Progress Chart (High Impact — Pro Upsell)
- **Why:** The #1 reason users pay for fitness apps is to see their progress visually.
- **Agent:** `/charts` then `/iap` for the Pro gate paywall.
- **Files:** `components/charts/OneRMChart.tsx`, `app/(tabs)/progress.tsx`
- **Formula:** `weight * (36 / (37 - reps))` (Brzycki)

### 2. Superset Support in Active Workout (Differentiator)
- **Why:** Hevy supports supersets — it's a top user request and a strong Pro upsell.
- **Agent:** `/ui` for the UI, `/storage` for the schema update.
- **Files:** `app/workout/active.tsx` (update), `src/store/workoutStore.ts` (schema)
- **Schema change:** Add `superset_id?: string` to `WorkoutSet` type.

---

## File Locations Quick Reference

```
.vscode/subagents/
  instructions.md       ← This file (master guide)
  ui-agent.md           ← /ui
  storage-agent.md      ← /storage
  charts-agent.md       ← /charts
  revenuecat-agent.md   ← /iap
  eas-agent.md          ← /eas
  debug-agent.md        ← /debug
```

---

## Golden Rules (Never Break These)

1. **Never run `git` from `frontend/`** — always run git from `C:\gaintrack\gaintrack`.
2. **Never run `expo` / `eas` from repo root** — always `cd frontend` first.
3. **Never commit secrets** — `.env`, `google-services.json`, API keys go in EAS secrets only.
4. **Always AsyncStorage first, Firestore second** — offline-first architecture.
5. **Never hardcode `isPro = true`** — always read from `authStore` → Firestore.
6. **Always use `format(date, 'yyyy-MM-dd')` from date-fns** — never `.toISOString().split('T')[0]`.
