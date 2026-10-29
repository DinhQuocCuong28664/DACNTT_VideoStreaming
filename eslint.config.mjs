// Flat ESLint config for every workspace. eslint-plugin-security is the SAST gate in CI:
// any warning fails the build until it is fixed or justified with an inline comment.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import security from 'eslint-plugin-security';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.terraform/**',
      'report/**',
      'scripts/**',
      'samples/**',
      'backup-aws/**',
      '.local-notes/**',
      '.claude/**',
      '.agents/**',
      'docs/diagrams/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  security.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },
  {
    // The Playwright harness reads the accounts file named by its configuration and writes
    // session files into its own .auth folder; no path comes from a user.
    files: ['e2e/**/*.ts'],
    rules: { 'security/detect-non-literal-fs-filename': 'off' },
  },
  {
    // The web app runs in the browser.
    files: ['web/**/*.{ts,tsx,js}'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // The transcoder container only touches files under its own mkdtemp scratch directory,
    // joined with rung names from the validated plan; no path comes from a user. The rule
    // stays on for the API, which handles user input.
    files: ['transcoder/src/**/*.ts'],
    rules: {
      'security/detect-non-literal-fs-filename': 'off',
    },
  },
);
