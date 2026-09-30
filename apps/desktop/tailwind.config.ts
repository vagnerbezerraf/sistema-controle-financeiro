/** @type {import('tailwindcss').Config} */
import { color, spacing, radius, fontSize, fontWeight, shadow, breakpoints, transition } from '@scf/design-tokens';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    screens: breakpoints,
    colors: color,
    spacing,
    borderRadius: radius,
    fontSize,
    fontWeight,
    boxShadow: shadow,
    extend: {
      transitionTimingFunction: { DEFAULT: 'cubic-bezier(0.4, 0, 0.2, 1)' },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
