import assert from 'node:assert';

import eslintJs from '@eslint/js';
import type { Linter } from 'eslint';
import { defineConfig } from 'eslint/config';
import stylistic from '@stylistic/eslint-plugin';
import prettierConfig from 'eslint-config-prettier/flat';
import noUnsanitized from 'eslint-plugin-no-unsanitized';
import regexpPlugin from 'eslint-plugin-regexp';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import pkgJson from './package.json' with { type: 'json' };

const defaultSourceType: Linter.SourceType = 'module';
assert(pkgJson.type === defaultSourceType);

const tsFiles = ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'];

const configs = [
  eslintJs.configs.recommended,
  prettierConfig,
  regexpPlugin.configs['flat/recommended'],

  // TypeScript: parser + TS-aware rules, scoped to TS files (flat config lints
  // nothing else by default).
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...(config as Linter.Config),
    files: tsFiles
  })),

  {
    plugins: {
      '@stylistic': stylistic,
      'no-unsanitized': noUnsanitized
    },

    linterOptions: {
      reportUnusedDisableDirectives: 'error',
      reportUnusedInlineConfigs: 'error'
    },

    languageOptions: {
      sourceType: defaultSourceType,
      parserOptions: {
        projectService: true,
        ecmaVersion: 2025,
        ecmaFeatures: { impliedStrict: true }
      },
      globals: { ...globals.nodeBuiltin }
    },

    // eslint-plugin-security is deliberately not used: detect-object-injection
    // fires on every computed key, and dynamic JSON keys are this codebase's
    // core idiom (payload scrubbing, path lookups). Its Node-specific rules
    // would only apply to tools/. Don't re-add it without revisiting that.
    rules: {
      'no-var': 'error',
      'no-await-in-loop': 'error',
      'no-implicit-globals': ['error'],
      'no-unused-vars': ['error', { vars: 'local', argsIgnorePattern: '^_' }],
      'no-useless-rename': ['error'],
      'no-useless-computed-key': 'error',
      'no-useless-constructor': 'error',
      'no-useless-return': 'error',
      'arrow-body-style': ['error', 'as-needed'],
      'no-lonely-if': 'error',
      'prefer-object-has-own': 'error',
      'prefer-exponentiation-operator': 'error',
      'prefer-regex-literals': ['error', { disallowRedundantWrapping: true }],
      'array-callback-return': [
        'error',
        { checkForEach: true, allowVoid: true }
      ],
      'no-constructor-return': 'error',
      'no-unmodified-loop-condition': 'error',
      'no-useless-assignment': 'error',
      'no-shadow-restricted-names': ['error', { reportGlobalThis: true }],
      'no-unassigned-vars': 'error',
      'preserve-caught-error': 'error',

      // Code-execution sinks. The app patches a live YouTube DOM, so
      // unwrapping these lands untrusted script.
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',

      // @stylistic rules - needed as prettier doesn't handle these
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],

      /* eslint-plugin-regexp - the following are 'warn' in the recommended config */
      'regexp/prefer-character-class': ['error', { minAlternatives: 2 }],
      'regexp/no-empty-alternative': 'error',
      'regexp/no-lazy-ends': 'error',
      'regexp/no-potentially-useless-backreference': 'error',
      'regexp/confusing-quantifier': 'error',
      'regexp/no-useless-flag': 'error',
      'regexp/optimal-lookaround-quantifier': 'error'
    }
  },

  // On TS files the core rules are handled by their TS-aware equivalents.
  {
    files: tsFiles,
    rules: {
      'no-unused-vars': 'off',
      'no-useless-constructor': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      // Off: typescript-eslint analyses with TS 6 while tsc -b runs TS 7, and
      // the two disagree on which casts are no-ops (removing them breaks tsc).
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',

      // Cherry-picked from strictTypeChecked rather than adopting the preset:
      // - no-dynamic-delete (off): deleting payload keys is how adblock and
      //   members-only filtering work.
      // - prefer-nullish-coalescing (off): empty-string fallbacks are
      //   deliberate (`segmentColors[category] || '#0072ff'`).
      // - no-unnecessary-condition (off): defensive checks against untyped
      //   YouTube internals look "unnecessary" to the types.
      // - no-deprecated (off): KeyboardEvent.keyCode is the only reliable key
      //   signal on Chrome 79 TV remotes.
      // - restrict-template-expressions / no-confusing-void-expression: style.
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unnecessary-boolean-literal-compare': 'error',
      '@typescript-eslint/no-unnecessary-type-arguments': 'error',
      '@typescript-eslint/no-meaningless-void-operator': 'error',
      '@typescript-eslint/use-unknown-in-catch-callback-variable': 'error',
      // AbortSignal.reason is typed `any` and is already a DOMException by
      // default; forwarding it unchanged is the point.
      '@typescript-eslint/prefer-promise-reject-errors': [
        'error',
        { allowThrowingAny: true, allowThrowingUnknown: true }
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          vars: 'local',
          args: 'after-used',
          argsIgnorePattern: '^_',
          caughtErrors: 'none'
        }
      ]
    }
  },

  {
    // node:test's test()/describe() return promises the runner collects, and
    // assert.* is routinely used unbound; neither is a defect in tests.
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/unbound-method': 'off'
    }
  },

  {
    files: ['src/**/*'],
    languageOptions: { globals: { ...globals.browser } },

    // DOM-injection sinks, scoped to the browser code. `method` flags dynamic
    // script/import sinks, so it would misfire on the Node tools' runtime
    // `import()` of built modules.
    rules: {
      'no-console': 'error',
      'no-unsanitized/method': 'error',
      'no-unsanitized/property': 'error'
    }
  },

  {
    // Why doesn't ESLint do this by default is beyond me.
    files: ['**/*.m[jt]s'],
    languageOptions: { sourceType: 'module' }
  },

  {
    // `ignores` field must be in the very bottom config.
    ignores: ['dist/**/*']
  }
] as const satisfies Linter.Config[];

export default defineConfig(configs);
