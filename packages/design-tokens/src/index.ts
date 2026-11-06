export const color = {
  brand: {
    50: '#eef6ff',
    100: '#d9eaff',
    200: '#bcdaff',
    300: '#8ec1ff',
    400: '#5a9dff',
    500: '#3477ff',
    600: '#1e57f5',
    700: '#1743dc',
    800: '#1737b0',
    900: '#17348b',
  },
  success: {
    50: '#eefbf2',
    100: '#d6f5df',
    200: '#afebc2',
    300: '#7bda9a',
    400: '#46c16e',
    500: '#22a552',
    600: '#158441',
    700: '#116937',
    800: '#10542f',
    900: '#0e4528',
  },
  warning: {
    50: '#fff8ec',
    100: '#fff0d3',
    200: '#ffdea5',
    300: '#ffc56d',
    400: '#ffa132',
    500: '#ff850a',
    600: '#f06a00',
    700: '#c75002',
    800: '#9d3e08',
    900: '#7e330a',
  },
  danger: {
    50: '#fef2f2',
    100: '#fee2e2',
    200: '#fecaca',
    300: '#fca5a5',
    400: '#f87171',
    500: '#ef4444',
    600: '#dc2626',
    700: '#b91c1c',
    800: '#991b1b',
    900: '#7f1d1d',
  },
  neutral: {
    0: '#ffffff',
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
    950: '#020617',
  },
  // A paleta substitui a padrão do Tailwind (`colors: color`), então `white`
  // precisa existir explicitamente para `bg-white`/`text-white` funcionarem.
  white: '#ffffff',
} as const;

// A escala substitui a padrão do Tailwind (`spacing`), então os passos usados
// na UI precisam existir aqui: os fracionários (0.5/1.5/2.5) e os valores
// deslocados (9/64) que não fazem parte da escala customizada original.
export const spacing = {
  px: '1px',
  0: '0',
  0.5: '0.125rem',
  1: '0.25rem',
  1.5: '0.375rem',
  2: '0.5rem',
  2.5: '0.625rem',
  3: '0.75rem',
  4: '1rem',
  5: '1.25rem',
  6: '1.5rem',
  8: '2rem',
  9: '2.25rem',
  10: '2.5rem',
  12: '3rem',
  14: '3.5rem',
  16: '4rem',
  20: '5rem',
  24: '6rem',
  64: '16rem',
} as const;

export const radius = {
  // A escala substitui a padrão do Tailwind (`borderRadius: radius`), então
  // `DEFAULT` precisa existir para a classe `rounded` funcionar.
  DEFAULT: '0.25rem',
  sm: '0.25rem',
  md: '0.5rem',
  lg: '0.75rem',
  xl: '1rem',
  '2xl': '1.5rem',
  full: '9999px',
} as const;

export const fontSize = {
  xs: '0.75rem',
  sm: '0.875rem',
  base: '1rem',
  lg: '1.125rem',
  xl: '1.25rem',
  '2xl': '1.5rem',
  '3xl': '1.875rem',
  '4xl': '2.25rem',
  '5xl': '3rem',
} as const;

export const fontWeight = {
  thin: 100,
  light: 300,
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
} as const;

export const shadow = {
  sm: '0 1px 2px 0 rgb(15 23 42 / 0.05)',
  md: '0 4px 6px -1px rgb(15 23 42 / 0.10), 0 2px 4px -2px rgb(15 23 42 / 0.10)',
  lg: '0 10px 15px -3px rgb(15 23 42 / 0.10), 0 4px 6px -4px rgb(15 23 42 / 0.10)',
  xl: '0 20px 25px -5px rgb(15 23 42 / 0.10), 0 8px 10px -6px rgb(15 23 42 / 0.10)',
} as const;

export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

export const transition = {
  fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
  normal: '250ms cubic-bezier(0.4, 0, 0.2, 1)',
  slow: '400ms cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

export const categoriesPalette = [
  { name: 'Moradia', color: '#1e57f5', icon: 'home' },
  { name: 'Alimentacao', color: '#22a552', icon: 'utensils' },
  { name: 'Transporte', color: '#ff850a', icon: 'car' },
  { name: 'Saude', color: '#ef4444', icon: 'heart' },
  { name: 'Educacao', color: '#8b5cf6', icon: 'book' },
  { name: 'Lazer', color: '#ec4899', icon: 'smile' },
  { name: 'Salario', color: '#158441', icon: 'wallet' },
  { name: 'Outros', color: '#64748b', icon: 'tag' },
];

export const designTokens = {
  color,
  spacing,
  radius,
  fontSize,
  fontWeight,
  shadow,
  breakpoints,
  transition,
  categoriesPalette,
};

export type DesignTokens = typeof designTokens;
