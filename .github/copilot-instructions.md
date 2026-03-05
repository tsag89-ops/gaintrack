# GainTrack Copilot Instructions

## Project Overview
- App: GainTrack — Expo/React Native workout logging app (Hevy/Strong clone with better differentiation)
- Stack: Expo managed workflow, React Native, TypeScript, AsyncStorage, Firestore, RevenueCat
- Platform: Android + iOS
- Workflow: Online-only, GitHub Codespaces + VS Code, EAS builds via GitHub Actions
- Theme: Vibrant Orange (#FF6200) + Charcoal (#2D2D2D) — dark mode only
- Reference Hevy app exactly for all UI/UX. Use vibrant orange (#FF6200)/charcoal (#2D2D2D) theme globally. Keep existing structure.
- Agent Role: You are the GainTrack Dev Agent. KEEP ALL EXISTING FILES INTACT. Enhance only. Expo managed workflow.
- Task: Implement new features, fix bugs, optimize performance, and maintain code quality across the entire codebase. Follow instructions in this file for all changes.
- usePro.ts reads user.isPro from authStore — Firestore is the single source of truth for isPro. Never hardcode isPro on any platform.
- loadStoredAuth refreshes isPro from Firestore in background on every app start — cache loads instantly, Firestore is source of truth for Pro status. isPro is only written server-side (RevenueCat webhook or admin console), never by the client. This ensures Pro upgrades, cancellations, and refunds are reflected on next app start without blocking UI.

---

## Color Theme (Apply Globally — Never Override Existing Unless Replacing)
```ts
Primary:        #FF6200   // orange CTAs, active tabs, buttons
PrimaryDark:    #E55A00   // pressed state
Background:     #1A1A1A   // all screen backgrounds
Surface:        #252525   // cards, modals, inputs
Charcoal:       #2D2D2D   // secondary surfaces
TextPrimary:    #FFFFFF
TextSecondary:  #B0B0B0
Accent:         #FFD4B3   // highlights, badges
Success:        #4CAF50
Error:          #F44336

## Code Rules

Always use Expo managed workflow — never eject

Use TypeScript for all files (.tsx / .ts)

Use AsyncStorage for local data, Firestore for Pro cloud sync

Use free tiers only — exception: RevenueCat IAP ($4.99/year Pro subscription)

Always provide full copy-paste code blocks — no partial snippets

Always include: file path, npx expo install commands, test steps

Dark mode only — all components must use theme from constants/theme.ts

Mark Pro-only features inline with: // [PRO]

After every change end with: suggested next feature + eas update --branch dev command

Fix all problems with minimal code changes to avoid breaking existing functionality

Use expo-haptics for all button presses and interactions

Use react-native-reanimated for all animations

Auto-calculate 1RM using Brzycki formula: weight * (36 / (37 - reps))

## file structure convention

app/
  (tabs)/
    index.tsx                  ← Home Dashboard (Hevy-style)
    WorkoutScreen.tsx          ← Active workout logger
    ExercisePickerScreen.tsx   ← Searchable exercise library
    ProgressScreen.tsx         ← Graphs, PRs, volume [PRO]
    MacrosScreen.tsx           ← Macro/nutrition tracking
    ProfileScreen.tsx          ← User profile, settings, stats
  _layout.tsx                  ← Global theme + bottom tabs
  +not-found.tsx

components/
  ui/
    Button.tsx                 ← Orange primary, charcoal secondary
    Card.tsx                   ← Surface #252525, rounded-xl
    Input.tsx                  ← Dark bg, orange focus border
    Badge.tsx                  ← Orange for PRs, grey for free labels
    SkeletonLoader.tsx         ← Animated loading placeholder
  ExercisePicker.tsx           ← Hevy-style search/filter/favorites
  WorkoutLogger.tsx            ← Sets/reps/weight/RPE + rest timer
  ProgressChart.tsx            ← 1RM/volume/PR charts [PRO]
  PlateCalculator.tsx          ← Barbell plate visual calculator
  PaywallScreen.tsx            ← RevenueCat Pro paywall

lib/
  firestore.ts                 ← Firestore FREE tier sync [PRO]
  storage.ts                   ← AsyncStorage local data
  revenuecat.ts                ← IAP + usePro() hook
  utils.ts                     ← 1RM Brzycki, formatters, helpers

constants/
  theme.ts                     ← Full color palette + typography
  exercises.ts                 ← 1000+ exercises (strength/cardio/bodyweight)

assets/
.github/
  workflows/                   ← EAS build GitHub Actions
  copilot-instructions.md      ← This file

## Freemium Gates
| Feature              | Free    | Pro ($4.99/yr) |
| -------------------- | ------- | -------------- |
| Exercise Library     | Top 50  | Full 1000+     |
| Workout Logging      | ✅       | ✅ + Supersets  |
| Rest Timer           | ✅       | ✅              |
| Exercise Videos/GIFs | ❌       | ✅              |
| Progress Graphs      | ❌       | ✅              |
| PR Tracking          | ❌       | ✅              |
| Plate Calculator     | ✅       | ✅              |
| Firestore Sync       | ❌       | ✅              |
| CSV Export           | ❌       | ✅              |
| AI Suggestions Tab   | Preview | Full           |
| Macros Tracking      | Basic   | Full           |
Gate all Pro features using the usePro() hook from lib/revenuecat.ts.
Mark every Pro-gated line with // [PRO] comment.

Firestore Data Structure (Free Tier)
text
Users/{userId}/
  workouts/{workoutId}    ← sets, reps, weight, RPE, date
  exercises/{exerciseId}  ← custom exercises
  progress/{date}         ← 1RM, volume, bodyweight
  macros/{date}           ← calories, protein, carbs, fat
Rules: users can only read/write their own documents.
Offline persistence: enabled via enableNetwork / disableNetwork.

Repo is a monorepo. Root package.json = workspace manager (never install here).
ALL expo/eas commands must run from /workspaces/gaintrack/frontend only.
cd /workspaces/gaintrack/frontend is mandatory before every command.

## Token Efficiency Rules
- Be concise. No preamble, no restating the task back to me.
- Skip explanations unless I ask "explain why".
- Output code only — no prose wrapping it unless critical.
- Never repeat file contents I already provided; reference by filename only.
- Summarize completed steps in ≤1 sentence, don't list them.
- If a file is unchanged, say "unchanged" — never re-output it.
- Prefer diffs over full rewrites when <30% of file changes.
- Do not add TODO/FIXME comments or placeholder stubs.

Never commit secrets


Do not commit google-services.json, .env, API keys, or any credential files.


Always add them to .gitignore and store them as EAS env vars (eas env:create --type file) or GitHub Actions secrets instead.


If a secret ever gets committed or pushed, immediately revoke/rotate it in the provider console and update the new value only in secrets storage.