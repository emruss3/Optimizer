// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

/** @type {import('tailwindcss').Config} */
import { colors, spacing, typography, borderRadius, boxShadow } from './src/theme';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors,
      spacing,
      fontFamily: typography.fontFamily,
      fontSize: typography.fontSize,
      fontWeight: typography.fontWeight,
      lineHeight: typography.lineHeight,
      borderRadius,
      boxShadow,
    },
  },
  plugins: [],
};
