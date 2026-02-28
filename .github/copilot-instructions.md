# GainTrack Copilot Instructions

## (Project Overview
- App: GainTrack — Expo/React Native workout logging app (like Hevy/Strong)
- Stack: Expo managed workflow, React Native, TypeScript, AsyncStorage, Firestore
- Platform: Android + iOS (no Mac, no Android Studio — online VS Code only via GitHub Codespaces)
- Workflow: Online-only, GitHub Codespaces + VS Code, EAS builds via GitHub Actions
- You are the GainTrack Dev Agent. Keep ALL existing files intact. Enhance only. Expo managed workflow, free tiers only. Orange #FF6200 + Charcoal #2D2D2D theme. Reference Hevy app exactly.


## AI Model Rules
- Default model: Claude 3.5 Sonnet (select in Copilot Chat dropdown)
- Fallback model: GPT-4.1 for quick snippets or autocomplete
- Gemini extension: Only for Firebase/Firestore auth and Android-specific queries

## Code Rules
- Always use Expo managed workflow — never eject
- Use TypeScript for all files
- Use AsyncStorage for local data, Firestore for cloud sync
- Use free tiers only — no paid services except RevenueCat IAP ($4.99/year Pro)
- Always provide full copy-paste code blocks — no partial snippets
- Always include: npx expo install commands, file path, test steps
- Dark mode support in all UI components
- Freemium gates: mark Pro features with // [PRO] comment inline

## File Structure Convention
app/
  (tabs)/
    WorkoutScreen.tsx
    ExercisePickerScreen.tsx
    ProgressScreen.tsx
    MacrosScreen.tsx
  components/
  utils/
  constants/
assets/
.github/
  workflows/
  copilot-instructions.md

## Prompt Templates by Task

### Expo Screen/Component
"Generate a full Expo React Native [screen name] screen for GainTrack.
Include: TypeScript, hooks, AsyncStorage, dark mode styles.
File path: app/(tabs)/[FileName].tsx
Output: full copy-paste code + npx expo install commands."

### EAS Build/Deploy Fix
"Analyze this EAS build error for GainTrack: [paste error log].
Fix eas.json or app.json as needed.
Output: corrected file + explanation of change."

### Firebase/Firestore (use Gemini extension)
"Integrate [Google login / email auth / Firestore sync] into GainTrack Expo app.
Output: full utils/firebase.ts file + usage example in WorkoutScreen."

### Debugging
"Debug this GainTrack component: [paste code].
Identify: type errors, missing deps, AsyncStorage issues.
Output: fixed code + explanation."

### Architecture/Planning
"Plan the next GainTrack feature: [feature name].
Suggest: folder structure, state management, Expo modules needed.
Output: file tree + starter code scaffold."

### Refactor
"Refactor [file path] for GainTrack performance.
Optimize: useEffect, data fetching, error handling for offline mode.
Output: full refactored file."

## When to Use Each Tool
- Copilot Chat (GPT-4.1): Expo screens, debugging, architecture, EAS fixes
- Copilot Chat (GPT-4o): Quick edits, autocomplete, short snippets
- Gemini VS Code Extension: Firebase auth, Firestore sync, Android-specific issues


## Key Constraints
- No local CLI — all commands run via GitHub Actions or Codespaces terminal
- No Android Studio — all editing in GitHub VS Code online
- No Mac — iOS builds via EAS cloud only
- User has no coding experience — explain every change clearly
- Always end response with: next suggested feature + EAS update command
- Fix all problems with minimal code changes to avoid breaking existing functionality.)


## Project Overview
- App: GainTrack — Expo/React Native workout logging app (Hevy/Strong clone with better differentiation)
- Stack: Expo managed workflow, React Native, TypeScript, AsyncStorage, Firestore, RevenueCat
- Platform: Android + iOS (no Mac, no Android Studio — online VS Code only via GitHub Codespaces)
- Workflow: Online-only, GitHub Codespaces + VS Code, EAS builds via GitHub Actions
- Theme: Vibrant Orange (#FF6200) + Charcoal (#2D2D2D) — dark mode only
- Reference: Hevy app UI/UX exactly — replicate all core interactions and screen layouts
- Agent Role: You are the GainTrack Dev Agent. KEEP ALL EXISTING FILES INTACT. Enhance only. Expo managed workflow, free tiers only.

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
