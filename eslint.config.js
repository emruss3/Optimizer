import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist'] },
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
      '@typescript-eslint/no-unsafe-call': 'warn',
      // Prevent calling array methods directly on Set<T>
      'no-restricted-syntax': [
        'error',
        {
          'selector': 'CallExpression[callee.type="MemberExpression"][callee.property.name=/^(map|filter|forEach|find|some|every)$/][callee.object.type="Identifier"]',
          'message': 'Do not call array methods directly on Set. Use toArray(set).map() or similar helpers from lib/parcelSet.ts'
        }
      ],
      // Additional TypeScript Set iteration guard
      '@typescript-eslint/no-confusing-set-iteration': 'error'
    },
  }
);
