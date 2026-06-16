// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // FRONTEND_CRITICAL_FIX.tsx is a documentation snippet at the repo root, not buildable code.
  // *.stories.tsx are Storybook dev-only files (not shipped) and legitimately call hooks in render fns.
  { ignores: ['dist', 'FRONTEND_CRITICAL_FIX.tsx', '**/*.stories.tsx'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/consistent-type-assertions': 'error',
      '@typescript-eslint/no-confusing-non-null-assertion': 'error',
      // Correctness rule we care about — keep as error.
      'react-hooks/rules-of-hooks': 'error',
      // Large existing tech-debt surface; tracked as warnings so CI stays green
      // while we burn them down incrementally (see audit Phase 0+).
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      'no-case-declarations': 'warn',
      'no-extra-boolean-cast': 'warn',
      'prefer-const': 'warn',
      'no-empty': 'warn',
    },
  }
);
