import Module from 'node:module';
import type { ConfigAPI, InputOptions } from '@babel/core';

const require = Module.createRequire(import.meta.url);

// From: https://github.com/babel/babel-polyfills/blob/a5db9c31c5b5474b4018e6178bc40882fc3eb5bf/packages/babel-plugin-polyfill-corejs3/README.md#version

const {
  version: babelruntimeVersion
} = require('@babel/runtime-corejs3/package.json');
const { version: corejspureVersion } = require('core-js-pure/package.json');

function makeConfig(api: ConfigAPI): InputOptions {
  const cfg: InputOptions = {
    // Webpack emits both CJS and ESM; auto-detect avoids
    // "__webpack_require__(...) is not a function". See
    // https://github.com/webpack/webpack/issues/9379
    sourceType: 'unambiguous',
    plugins: [
      [
        '@babel/plugin-transform-runtime',
        {
          version: babelruntimeVersion
        }
      ],
      [
        // structuredClone (src/youtube/hooks/json-stringify.ts) predates the Chrome 79 floor.
        'polyfill-corejs3',
        {
          method: 'usage-pure',
          version: corejspureVersion,
          // Pure polyfills would rewrite JSON.parse/stringify into imports,
          // bypassing the hooks in src/youtube/hooks and src/features/adblock/adblock.ts.
          exclude: ['es.json.parse', 'esnext.json.parse']
        }
      ]
    ],
    presets: [
      // Babel 8: bugfix plugins are always enabled.
      ['@babel/preset-env', {}],
      ['@babel/preset-typescript', {}]
    ]
  };

  // Invalidate the cache whenever a dependency version or the config changes.
  api.cache.invalidate(
    () => babelruntimeVersion + corejspureVersion + JSON.stringify(cfg)
  );

  return cfg;
}

export default makeConfig;
