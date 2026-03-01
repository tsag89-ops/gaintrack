import React, { createContext, useContext } from 'react';
import { theme, type Theme } from '../constants/theme';

export const ThemeContext = createContext<Theme>(theme);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => (
  <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
);

/** Returns the full GainTrack design-system theme object. */
export const useTheme = (): Theme => useContext(ThemeContext);
