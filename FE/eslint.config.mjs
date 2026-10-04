import tseslint from 'typescript-eslint';

// Deliberately focused correctness rules; TypeScript/Angular perform type/template checking.
export default [
  {ignores: ['node_modules/**', 'dist/**', '.angular/**', 'test-results/**', 'playwright-report/**']},
  {
    files: ['**/*.ts', '**/*.mjs', '**/*.js'],
    languageOptions: {parser: tseslint.parser, ecmaVersion: 'latest', sourceType: 'module'},
    plugins: {'@typescript-eslint': tseslint.plugin},
    linterOptions: {reportUnusedDisableDirectives: 'error'},
    rules: {
      'no-debugger': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-unreachable': 'error',
      'no-unsafe-finally': 'error',
      'no-constant-condition': ['error', {checkLoops: false}],
      'valid-typeof': 'error',
      'eqeqeq': ['error', 'always', {null: 'ignore'}],
      '@typescript-eslint/no-duplicate-enum-values': 'error',
      '@typescript-eslint/no-extra-non-null-assertion': 'error',
      '@typescript-eslint/no-misused-new': 'error',
    },
  },
];
