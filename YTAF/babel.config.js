import Module from 'node:module';

const require = Module.createRequire(import.meta.url);

// From: https://github.com/babel/babel-polyfills/blob/a5db9c31c5b5474b4018e6178bc40882fc3eb5bf/packages/babel-plugin-polyfill-corejs3/README.md#version

const {
  version: babelruntimeVersion
} = require('@babel/runtime-corejs3/package.json');
const { version: corejspureVersion } = require('core-js-pure/package.json');

/** @typedef {import('@babel/core').ConfigAPI} ConfigAPI */
/** @typedef {Record<string, any>} BabelConfig */

/** @type {(api: ConfigAPI) => BabelConfig} */
function makeConfig(api) {
  const cfg = {
    // Fixes "TypeError: __webpack_require__(...) is not a function"
    // https://github.com/webpack/webpack/issues/9379#issuecomment-509628205
    // https://babel.dev/docs/options#sourcetype
    sourceType: 'unambiguous',
    // https://babel.dev/docs/assumptions
    assumptions: {
      noNewArrows: true
    },
    plugins: [
      [
        '@babel/plugin-transform-runtime',
        {
          version: babelruntimeVersion
        }
      ],
      [
        'polyfill-corejs3',
        {
          method: 'usage-pure',
          version: corejspureVersion,
          /**
           * Core-js pure polyfills would replace direct JSON.parse/stringify
           * calls with imports, bypassing the hooks we install in
           * src/hooks and src/adblock.js.
           * See https://github.com/babel/babel-polyfills/blob/a5db9c31c5b5474b4018e6178bc40882fc3eb5bf/packages/babel-plugin-polyfill-corejs3/README.md#version
           */
          exclude: ['es.json.parse', 'esnext.json.parse']
        }
      ],
      [
        'polyfill-regenerator',
        {
          method: 'usage-pure'
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
