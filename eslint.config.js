// ESLint (flat config) voor WidgetFabriek.
//
// Pragmatisch afgesteld: de codebase bestaat al en telt tienduizenden regels.
// Regels die ECHTE bugs vangen staan op 'error' (kapotte hooks, onbereikbare
// code, dubbele keys …); stijlkwesties staan op 'warn' zodat ze zichtbaar zijn
// zonder de CI-poort te blokkeren. Doel: nul errors op de bestaande code.

import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      // Playwright-rooktest: ander runtime-profiel (browser + node-script), draait lokaal.
      'tests/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2021 },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    // jsx-a11y wordt alleen geregistreerd (niet in bulk aangezet): de codebase
    // gebruikt er een eslint-disable-comment van, en een onbekende regelnaam in
    // zo'n comment is op zich al een fout.
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: {
      // ── Echte bugs ──────────────────────────────────────────────────────
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'jsx-a11y/media-has-caption': 'warn',

      // ── Ruis temperen op een bestaande codebase ─────────────────────────
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/ban-ts-comment': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
  {
    // Configuratiebestanden draaien in Node.
    files: ['*.{js,ts}'],
    languageOptions: { globals: { ...globals.node } },
  },
);
