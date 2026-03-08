# GainTrack Copilot Instructions

## Project
- App: GainTrack — Expo/React Native workout logger (Hevy/Strong-style, better differentiated)
- Stack: Expo managed workflow, React Native, TypeScript, expo-router, AsyncStorage, Firestore (free tier), RevenueCat
- Platform: Android + iOS
- Dev: Windows local at C:\gaintrack\gaintrack — VS Code + Copilot Chat (Ctrl+Shift+I)
- Deploy: EAS OTA updates (`eas update --branch production`) + EAS builds via GitHub Actions
- Theme: Dark mode only — Orange #FF6200 + Charcoal #2D2D2D
- Agent Role: GainTrack Dev Agent — KEEP ALL EXISTING FILES INTACT. Enhance only.
- Task: Implement new features, fix bugs, optimize performance, and maintain code quality across the entire codebase. Follow instructions in this file and any relevant subagent files for specific guidelines and requirements.
- always use --branch production for fixes you want to test on your real installed app. Use --branch dev only for builds made with the development profile.Ask for clarification if any instruction is unclear or seems contradictory. Always prioritize the user experience and app stability in your implementations.

---

## Color Palette (constants/theme.ts — never override)
```ts
Primary:        #FF6200   // CTAs, active tabs, buttons
PrimaryDark:    #E55A00   // pressed state
Background:     #1A1A1A   // all screens
Surface:        #252525   // cards, modals, inputs
Charcoal:       #2D2D2D   // secondary surfaces
TextPrimary:    #FFFFFF
TextSecondary:  #B0B0B0
Accent:         #FFD4B3   // highlights, badges
Success:        #4CAF50
Error:          #F44336

## File Structure
app/
  (tabs)/
    index.tsx                  ← Home Dashboard
    WorkoutScreen.tsx          ← Active workout logger
    ExercisePickerScreen.tsx   ← Searchable exercise library
    ProgressScreen.tsx         ← Graphs, PRs, volume [PRO]
    MacrosScreen.tsx           ← Macro/nutrition tracking
    ProfileScreen.tsx          ← Profile, settings, stats
    AiSuggestionsScreen.tsx    ← AI coaching tab (preview free / full PRO)
  workout/
    new.tsx                    ← New workout entry point
    active.tsx                 ← Active workout screen (640 lines, 0 TS errors ✅)
  _layout.tsx                  ← Global theme + bottom tabs
  +not-found.tsx

components/
  ui/
    Button.tsx                 ← Orange primary, charcoal secondary
    Card.tsx                   ← Surface #252525, rounded-xl
    Input.tsx                  ← Dark bg, orange focus border
    Badge.tsx                  ← Orange PRs, grey free labels
    SkeletonLoader.tsx         ← Animated loading placeholder
  ExercisePicker.tsx           ← Search/filter/favorites + Pro gate
  WorkoutLogger.tsx            ← Sets/reps/weight/RPE + rest timer
  ProgressChart.tsx            ← 1RM/volume/PR charts [PRO]
  PlateCalculator.tsx          ← Barbell plate visual calculator
  PaywallScreen.tsx            ← RevenueCat Pro paywall

lib/
  firestore.ts                 ← Firestore sync [PRO]
  storage.ts                   ← AsyncStorage local data
  revenuecat.ts                ← IAP + usePro() hook
  utils.ts                     ← 1RM Brzycki, formatters, helpers

hooks/
  usePro.ts                    ← Reads isPro from authStore → Firestore source of truth
  useWorkouts.ts               ← AsyncStorage first, Firestore sync if isPro

constants/
  theme.ts
  exercises.ts                 ← 1000+ exercises (strength/cardio/bodyweight)


.github/
  copilot-instructions.md      ← This file (always-on global base)
  instructions/                ← Auto-loaded subagent instructions (applyTo glob)
    ui.instructions.md
    storage.instructions.md
    charts.instructions.md
    eas.instructions.md

.vscode/
  subagents/                   ← Manual-paste heavy task prompts
    instructions.md            ← Master subagent guide
    ui-agent.md
    storage-agent.md
    charts-agent.md
    revenuecat-agent.md
    eas-agent.md
    debug-agent.md

gaintrack/
  security.md                  ← Secret handling rules (see below)

# Navigation Flow 
tabs/index → workout/new → workout/active
via: router.push('/workout/active', { params: { name } })

# Pro vs Free Gates
Feature	Free	Pro ($4.99/yr)
Feature	Free	Pro ($4.99/yr)
Exercise Library	Top 50	Full 1000+
Workout Logging	✅	✅ + Supersets
Rest Timer	✅	✅
Exercise Videos/GIFs	❌	✅
Progress Graphs	❌	✅
PR Tracking	❌	✅
Plate Calculator	✅	✅
Firestore Sync	❌	✅
CSV Export	❌	✅
AI Suggestions Tab	Preview	Full
Macros Tracking	Basic	Full
Gate all Pro features via usePro() hook from lib/revenuecat.ts

Mark every Pro-gated line with // [PRO]

isPro is read from authStore → refreshed from Firestore on every app start

isPro is NEVER written by client — only via RevenueCat webhook or admin console

Cache loads instantly; Firestore is source of truth for Pro status

# Firestore Structure (Free Tier)
users/{userId}/
  workouts/{workoutId}    ← sets, reps, weight, RPE, date
  exercises/{exerciseId}  ← custom exercises
  progress/{date}         ← 1RM, volume, bodyweight
  macros/{date}           ← calories, protein, carbs, fat

Users can only read/write their own documents

Offline persistence: enabled via enableNetwork / disableNetwork

Date keys: always format(date, 'yyyy-MM-dd') from date-fns — NEVER toISOString().split('T')

# Code Rules
Expo managed workflow only — never eject

TypeScript for all files (.tsx / .ts)

AsyncStorage local-first; Firestore sync for Pro only

Free tiers only — exception: RevenueCat ($4.99/yr)

Full copy-paste code blocks only — no partial snippets

Always include: file path + npx expo install commands + test steps

All commands: Windows PowerShell, run from C:\gaintrack\gaintrack (repo root, NEVER subfolders)

expo-haptics for all button/interaction feedback

react-native-reanimated for all animations

1RM: Brzycki formula → weight * (36 / (37 - reps))

After every feature: output eas update --branch production --message "[description]"

Prefer diffs over full rewrites when <30% of file changes

If file is unchanged: say "unchanged" — never re-output it

No preamble, no restating the task, no TODO/FIXME stubs

Skip explanations unless I ask "explain why"

# Subagents Workflow
copilot-instructions.md = always-on global base (auto-injected every request)

.github/instructions/*.instructions.md = auto-loaded by file glob (applyTo)

.vscode/subagents/*.md = manual-paste for heavy task-specific prompts

Subagent files must NOT repeat stack/security context — task-specific params only

Use subagents to avoid context switching: UI Agent → .tsx screens, Storage Agent → hooks/utils, Charts Agent → components/charts/, EAS Agent → builds/deploys, Debug Agent → errors

# Security (consult gaintrack/security.md for full rules)
NEVER commit: .env, google-services.json, API keys, or any credentials

Always add secrets to .gitignore

Store secrets via: eas env:create --type file or GitHub Actions secrets

If a secret is ever committed: immediately revoke/rotate in provider console, update in secrets storage only

After each fix: git add . && git commit -m "fix: [description]" && git push origin main

# Debug Markers (hidden, do not remove)
- `BUILD_LABEL` — `frontend/src/constants/build.ts` exports `BUILD_LABEL = 'athlete-fix-v1'`
  Rendered in `frontend/app/(tabs)/index.tsx` as a bottom banner, currently hidden with `display: 'none'`
  To re-enable for debugging: remove the `{ display: 'none' }` override from the `buildBanner` View

