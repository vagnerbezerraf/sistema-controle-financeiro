/** @type {import('tailwindcss').Config} */
import { color, spacing, radius, fontSize, fontWeight, shadow, breakpoints } from '@scf/design-tokens';

export default {
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    screens: breakpoints,
    colors: color,
    spacing: {
      ...spacing,
      auto: 'auto',
    },
    borderRadius: radius,
    fontSize,
    fontWeight,
    boxShadow: shadow,
    transitionTimingFunction: {
      DEFAULT: 'cubic-bezier(0.4, 0, 0.2, 1)',
    },
    extend: {
      transitionDuration: {
        fast: '150ms',
        normal: '250ms',
        slow: '400ms',
      },
    },
  },
  plugins: [],
};
