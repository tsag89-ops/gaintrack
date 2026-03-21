---
description: "Use when building or editing Expo React Native screens and UI components in frontend app routes or frontend/src/components, including styling, interaction feedback, and animation behavior."
name: "GainTrack Frontend UI"
applyTo: "frontend/app/**/*.tsx, frontend/src/components/**/*.tsx"
---
# Frontend UI Instructions

## Design System
- Reuse tokens from frontend/src/constants/theme.ts for color, spacing, radius, and typography.
- Keep the app dark-mode-only. Do not introduce light-mode branches.
- Prefer existing UI primitives in frontend/src/components/ui before adding new variants.

## Interaction and Motion
- Add expo-haptics feedback for meaningful taps and state transitions where nearby patterns already do so.
- Use react-native-reanimated for non-trivial animation flows and transitions.
- Keep motion purposeful and short; avoid decorative animation that slows interactions.

## Navigation and Screen Patterns
- Follow expo-router route patterns used in frontend/app and nested groups like (tabs), (auth), and workout.
- Keep edits surgical in existing screens unless the task explicitly asks for broader refactors.

## Localization
- Every user-visible string in a new screen or component must use `t()` from `useLanguage()` from the very first commit.
- Raw English string literals visible to the user are not allowed, except for domain-standard acronyms/units (RPE, 1RM, kg, lb/lbs, cm, in, kcal, cal, g, W, km, mi, BPM, VO2max, CSV, %, KG, REPS) and the `PRO`/`FREE` badges.
- When adding a new key under `en` in `src/i18n/translations.ts`, add non-empty translations for el, de, fr, and it in the same change. Do not leave any locale relying on the English fallback for newly introduced text.

## Quality Gates
- Keep TypeScript strict-safe and avoid any-casts unless there is no practical typed alternative.
- Before closing UI tasks, run frontend lint and typecheck when feasible.
