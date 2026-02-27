# GainTrack Copilot Instructions

## Project Overview
- App: GainTrack — Expo/React Native workout logging app (like Hevy/Strong)
- Stack: Expo managed workflow, React Native, TypeScript, AsyncStorage, Firestore
- Platform: Android + iOS (no Mac, no Android Studio — online VS Code only via GitHub Codespaces)
- Workflow: Online-only, GitHub Codespaces + VS Code, EAS builds via GitHub Actions

## AI Model Rules
- Default model: Claude 3.5 Sonnet (select in Copilot Chat dropdown)
- Fallback model: GPT-4o for quick snippets or autocomplete
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
- Always end response with: next suggested feature + EAS update command and fix all problems with minimal code changes to avoid breaking existing functionality.
