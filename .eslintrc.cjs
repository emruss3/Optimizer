module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'standard-with-typescript',
    'plugin:react-hooks/recommended'
  ],
  parserOptions: { 
    project: ['./tsconfig.app.json'],
    ecmaVersion: 2020,
    sourceType: 'module'
  },
  rules: {
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/consistent-type-imports': 'error',
    '@typescript-eslint/strict-boolean-expressions': 'off',
    '@typescript-eslint/no-floating-promises': 'warn'
  },
  env: {
    browser: true,
    es2020: true
  }
}
