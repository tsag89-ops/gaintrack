import React, { createContext, useContext } from 'react';
import { theme } from '../constants/theme';

export const ThemeContext = createContext(theme);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => (
  <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
);

export const useTheme = () => useContext(ThemeContext);
