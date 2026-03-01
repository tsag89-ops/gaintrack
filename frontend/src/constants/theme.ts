// GainTrack Design System Tokens
// File: src/constants/theme.ts
// Dark-mode only — never override with a light palette

import { Platform } from 'react-native';

// ─── Colors ──────────────────────────────────────────────────────────────────

export const colors = {
  // Brand
  primary:        '#FF6200',  // orange CTAs, active tabs, buttons
  primaryDark:    '#E55A00',  // pressed / active state
  primaryMuted:   'rgba(255, 98, 0, 0.18)', // tinted surfaces

  // Backgrounds
  background:     '#1A1A1A',  // root screen background
  surface:        '#252525',  // cards, modals, sheet backgrounds
  charcoal:       '#2D2D2D',  // secondary surfaces, nav bars
  overlay:        'rgba(0, 0, 0, 0.65)', // modal scrim

  // Text
  textPrimary:    '#FFFFFF',
  textSecondary:  '#B0B0B0',
  textDisabled:   '#555555',
  textInverse:    '#1A1A1A',

  // Accents & semantic
  accent:         '#FFD4B3',  // highlights, tier badges
  success:        '#4CAF50',
  successMuted:   'rgba(76, 175, 80, 0.15)',
  error:          '#F44336',
  errorMuted:     'rgba(244, 67, 54, 0.15)',
  warning:        '#FFC107',
  warningMuted:   'rgba(255, 193, 7, 0.15)',
  info:           '#2196F3',

  // Borders & dividers
  border:         '#303030',
  borderFocus:    '#FF6200',
  divider:        '#2A2A2A',

  // Transparent
  transparent:    'transparent',
} as const;

// ─── Typography ──────────────────────────────────────────────────────────────

export const typography = {
  fontFamily: Platform.select({
    ios:     'System',
    android: 'Roboto',
    default: 'System',
  }),

  // Font sizes (sp)
  fontSize: {
    xs:   11,
    sm:   13,
    base: 15,
    md:   16,
    lg:   18,
    xl:   22,
    '2xl': 26,
    '3xl': 32,
  },

  // Font weights
  fontWeight: {
    regular:     '400' as const,
    medium:      '500' as const,
    semibold:    '600' as const,
    bold:        '700' as const,
    extrabold:   '800' as const,
  },

  lineHeight: {
    tight:   1.2,
    normal:  1.5,
    relaxed: 1.75,
  },

  letterSpacing: {
    tight:  -0.3,
    normal:  0,
    wide:    0.4,
    wider:   0.8,
  },
} as const;

// ─── Spacing ─────────────────────────────────────────────────────────────────

export const spacing = {
  0:   0,
  1:   4,
  2:   8,
  3:   12,
  4:   16,
  5:   20,
  6:   24,
  8:   32,
  10:  40,
  12:  48,
  16:  64,
} as const;

// ─── Border radii ─────────────────────────────────────────────────────────────

export const radii = {
  sm:   6,
  md:   10,
  lg:   12,   // rounded-xl
  xl:   16,
  '2xl': 24,
  full: 9999,
} as const;

// ─── Shadows ─────────────────────────────────────────────────────────────────

export const shadows = {
  sm: {
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius:  3,
    elevation:     2,
  },
  md: {
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius:  6,
    elevation:     4,
  },
  lg: {
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 5 },
    shadowOpacity: 0.55,
    shadowRadius:  12,
    elevation:     10,
  },
} as const;

// ─── Convenience flat object (backward-compat with existing imports) ──────────

export const theme = {
  // Colors (flat)
  ...colors,

  // Sub-namespaces for new code
  colors,
  typography,
  spacing,
  radii,
  shadows,
} as const;

export type Theme = typeof theme;
export default theme;
