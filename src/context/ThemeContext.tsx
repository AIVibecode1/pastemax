import { createContext, useState, useEffect, useContext } from 'react';

type ThemeType = 'light' | 'dark';

interface ThemeContextType {
  theme: ThemeType;
  setTheme: (theme: ThemeType) => void;
}

// Create context with proper typing
const defaultThemeContext: ThemeContextType = {
  theme: 'light',
  setTheme: () => {},
};

const ThemeContext = createContext(defaultThemeContext);

type ThemeProviderProps = { children: JSX.Element | JSX.Element[] };

export const ThemeProvider = ({ children }: ThemeProviderProps): JSX.Element => {
  // Initialize theme from localStorage or detect system preference
  const [theme, setThemeState] = useState<ThemeType>(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light' || savedTheme === 'dark') {
      return savedTheme as ThemeType;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  // Function to set theme
  const setTheme = (newTheme: ThemeType) => {
    setThemeState(newTheme);
  };

  // Effect to apply theme changes
  useEffect(() => {
    if (theme === 'dark') {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
};

// Custom hook to use the theme context
// eslint-disable-next-line react-refresh/only-export-components -- context modules legitimately export hooks next to providers
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
