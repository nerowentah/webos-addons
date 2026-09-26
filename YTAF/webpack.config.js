import CopyPlugin from 'copy-webpack-plugin';
import { TransformAsyncModulesPlugin } from 'transform-async-modules-webpack-plugin';
import TerserPlugin from 'terser-webpack-plugin';
import pkgJson from './package.json' with { type: 'json' };
import webpack from 'webpack';
import { basename } from 'node:path';
import { getVersionInfo } from './tools/version.cjs';

const { version, gitSha } = getVersionInfo();

/**
 * @param input {Buffer<ArrayBufferLike>}
 * @returns {string}
 */
function transformAppInfo(input) {
  const appInfo = JSON.parse(input.toString());
  appInfo.version = version;
  return JSON.stringify(appInfo, null, 2);
}

/** @type {(env: Record<string, string>, argv: { mode?: string }) => (import('webpack').Configuration)[]} */
const makeConfig = (_env, argv) => [
  {
    /**
     * NOTE: Builds with devtool = 'eval' contain very big eval chunks which seem
     * to cause segfaults (at least) on nodeJS v0.12.2 used on webOS 3.x.
     */
    devtool: argv.mode === 'development' ? 'inline-source-map' : 'source-map',

    output: {
      /**
       * webpack's default hash function (md4) is unsupported by OpenSSL 3 and
       * causes the build to fail on Node.js >= 17 with
       * ERR_OSSL_EVP_UNSUPPORTED. "xxhash64" is implemented in pure JS (no
       * OpenSSL), so it works on any Node.js version.
       * See https://github.com/webpack/webpack/issues/14532
       */
      hashFunction: 'xxhash64'
    },

    optimization: {
      /**
       * terser doesn't pickup browserlist config
       * See: https://github.com/terser/terser/issues/235
       */
      minimizer: [new TerserPlugin({ terserOptions: { ecma: 5 } })]
    },

    entry: {
      index: './src/index.js',
      userScript: {
        import: './src/userScript',
        filename: 'webOSUserScripts/[name].js'
      }
    },

    resolve: {
      extensions: ['.mjs', '.cjs', '.js', '.json', '.ts']
    },

    module: {
      rules: [
        {
          test: /\.[mc]?[jt]s$/i,

          loader: 'babel-loader',
          exclude: [
            // Some module should not be transpiled by Babel
            // See https://github.com/zloirock/core-js/issues/743#issuecomment-572074215
            // \\ for Windows, / for macOS and Linux
            /node_modules[\\/]core-js/,
            /node_modules[\\/]webpack[\\/]buildin/
          ],
          options: {
            cacheDirectory: true
          },
          resolve: {
            // File extension DON'T MATTER in a bundler.
            fullySpecified: false
          }
        },
        {
          test: /\.css$/i,
          use: [
            { loader: 'style-loader' },
            {
              loader: 'css-loader',
              options: { esModule: false, importLoaders: 1 }
            },
            'postcss-loader'
          ]
        },
        {
          // Bundled images (e.g. the SponsorBlock popup icon) are emitted as
          // static assets and referenced by URL, like the app icon PNGs.
          test: /\.(png|jpe?g|gif|svg)$/i,
          type: 'asset/resource'
        }
      ]
    },

    plugins: [
      new CopyPlugin({
        patterns: [
          {
            context: 'assets',
            from: '**/*',
            transform: {
              transformer(input, absolutePath) {
                if (basename(absolutePath) === 'appinfo.json') {
                  return transformAppInfo(input);
                }
                return input;
              }
            }
          },
          { context: 'src', from: 'index.html' }
        ]
      }),
      // babel doesn't transform top-level await.
      // webpack transforms it to async modules.
      // This plugin calls babel again to transform remove the `async` keyword usage after the fact.
      // Options are typed against Babel 7 (plugin-transform-runtime option names
      // changed on Babel 8); the object is inert here since the bundle contains
      // no top-level `await`.
      new TransformAsyncModulesPlugin(
        /** @type {any} */ ({
          runtime: {
            version: pkgJson.dependencies['@babel/runtime-corejs3'],
            absoluteRuntime: './node_modules/@babel/runtime-corejs3'
          }
        })
      ),
      new webpack.DefinePlugin({
        __YTAF_VERSION__: JSON.stringify(version),
        __YTAF_GITSHA__: JSON.stringify(gitSha)
      })
    ]
  }
];

export default makeConfig;
