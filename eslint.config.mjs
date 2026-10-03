// ESLint flat config for the whole monorepo.
//
// Baseline is intentionally lenient: the codebase predates linting, so rules that
// flag existing patterns are warnings, not errors. Tighten rule-by-rule as code is
// cleaned up (see REVAMP_PLAN.md). `npm run lint` must exit 0 (no errors).
import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-ssr/**',
      '**/dist-electron/**',
      '**/out/**',
      '**/build/**',
      '**/coverage/**',
      '**/.vite/**',
      '**/*.min.js',
      // Deno edge functions: different runtime and import style.
      'packages/supabase/functions/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
    rules: {
      // Lenient baseline: existing patterns are warnings only.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'warn',
      '@typescript-eslint/no-this-alias': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      '@typescript-eslint/no-namespace': 'warn',
      'no-empty': 'warn',
      'no-extra-boolean-cast': 'warn',
      'no-useless-escape': 'warn',
      'no-control-regex': 'warn',
      'no-case-declarations': 'warn',
      'no-prototype-builtins': 'warn',
      'no-async-promise-executor': 'warn',
      'no-cond-assign': 'warn',
      'no-constant-condition': 'warn',
      'no-constant-binary-expression': 'warn',
      'no-fallthrough': 'warn',
      'no-inner-declarations': 'warn',
      'no-irregular-whitespace': 'warn',
      'no-misleading-character-class': 'warn',
      'no-useless-assignment': 'warn',
      'no-self-assign': 'warn',
      'no-sparse-arrays': 'warn',
      'no-unsafe-finally': 'warn',
      'no-unused-private-class-members': 'warn',
      'prefer-const': 'warn',
      'preserve-caught-error': 'warn',
    },
  },
  {
    files: ['apps/**/*.{js,jsx,ts,tsx}', 'packages/**/*.{jsx,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  // Must be last: turns off stylistic rules that conflict with Prettier.
  prettier,
);
