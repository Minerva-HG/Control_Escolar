export default [
  {
    files: ['src/**/*.js', 'test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { process: 'readonly', console: 'readonly', setTimeout: 'readonly', fetch: 'readonly' },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef': 'error',
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
    },
  },
  {
    files: ['public/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        document: 'readonly', window: 'readonly', fetch: 'readonly',
        localStorage: 'readonly', confirm: 'readonly', setTimeout: 'readonly',
        URLSearchParams: 'readonly', Date: 'readonly',
      },
    },
    rules: { 'no-unused-vars': 'warn', 'no-undef': 'error' },
  },
];
