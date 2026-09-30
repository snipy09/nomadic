import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Lenient baseline: real errors fail CI, style/legacy debt only warns.
// Tighten rule by rule as the revamp phases land.
export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/dist-electron/**', '**/out/**', '**/build/**', 'packages/supabase/functions/**', '**/*.cjs', '**/*.mjs', '**/*.js'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      'no-empty': 'off',
      'no-useless-escape': 'off',
      'no-control-regex': 'off',
      'no-async-promise-executor': 'off',
      'no-case-declarations': 'off',
      'no-prototype-builtins': 'off',
      'prefer-const': 'off',
      'no-useless-assignment': 'off',
      'no-extra-boolean-cast': 'off',
    },
  },
);
