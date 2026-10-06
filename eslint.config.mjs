import tsParser from '@typescript-eslint/parser';
export default [
  { ignores: ['node_modules/**', '.next/**', 'public/**', 'docs/**', 'journey-screens/**', 'test-artifacts/**', '.codespaces-runtime/**'] },
  { files: ['app/**/*.{js,jsx,ts,tsx}', 'src/**/*.{js,jsx,ts,tsx}', 'scripts/**/*.mjs', 'tests/**/*.mjs', 'eslint.config.mjs'],
    languageOptions: { parser: tsParser, ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: { 'constructor-super': 'error', 'no-async-promise-executor': 'error', 'no-cond-assign': ['error', 'except-parens'], 'no-debugger': 'error', 'no-dupe-args': 'error', 'no-dupe-else-if': 'error', 'no-duplicate-case': 'error', 'no-duplicate-imports': ['error', { allowSeparateTypeImports: true }], 'no-unsafe-finally': 'error', 'no-unsafe-optional-chaining': 'error', 'no-unreachable': 'error', 'use-isnan': 'error', 'valid-typeof': 'error' }
  }
];
