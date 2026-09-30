/** @type {import('tailwindcss').Config} */
import { color, spacing, radius, fontSize, fontWeight, shadow } from '@scf/design-tokens';

export default {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    colors: color,
    spacing,
    borderRadius: radius,
    fontSize,
    fontWeight,
    boxShadow: shadow,
    extend: {},
  },
  plugins: [],
};
