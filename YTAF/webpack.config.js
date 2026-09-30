import CopyPlugin from 'copy-webpack-plugin';
import { TransformAsyncModulesPlugin } from 'transform-async-modules-webpack-plugin';
import TerserPlugin from 'terser-webpack-plugin';
import pkgJson from './package.json' with { type: 'json' };
import webpack from 'webpack';
import { basename } from 'node:path';
import { getVersionInfo } from './tools/version.cjs';

const { version, gitSha } = getVersionInfo();

/**
 * The graphics canvas, overridable per build.
 *
 * webOS TV accepts only 1920x1080 and 1280x720 for a web app's `resolution` -
 * there is no UHD graphics canvas, so these two are the whole set. The appinfo
 * value decides the CSS layout box, and nothing about the video plane: the panel
 * still plays at its own output resolution regardless of which of these is
 * installed.
 *
 * Selected with `--env resolution=1280x720` rather than an environment variable,
 * so the choice works the same on every shell - a cross-env dependency and a
 * `set VAR=...` prefix per platform are a poor trade for one build-time string.
 *
 * @see https://webostv.developer.lge.com/develop/specifications/app-resolution
 */
const DEFAULT_APP_RESOLUTION = '1920x1080';
const APP_RESOLUTIONS = [DEFAULT_APP_RESOLUTION, '1280x720'];

/**
 * @param requested {string | undefined}
 * @returns {string}
 */
function resolveAppResolution(requested) {
  if (requested === undefined) return DEFAULT_APP_RESOLUTION;
  if (!APP_RESOLUTIONS.includes(requested)) {
    throw new Error(
      `--env resolution must be one of ${APP_RESOLUTIONS.join(', ')}; got ${requested}`
    );
  }
  return requested;
}

/**
 * @param input {Buffer<ArrayBufferLike>}
 * @param resolution {string}
 * @returns {string}
 */
function transformAppInfo(input, resolution) {
  const appInfo = JSON.parse(input.toString());
  appInfo.version = version;
  appInfo.resolution = resolution;
  return JSON.stringify(appInfo, null, 2);
}

/** @type {(env: Record<string, string>, argv: { mode?: string }) => (import('webpack').Configuration)[]} */
const makeConfig = (env, argv) => [
  {
    /**
     * Source maps are a development-only build product.
     *
     * Production used to ask for 'source-map', which cost twice over:
     *
     *   1. Two .map files landed in dist (index.js.map ~60 KB, userScript.js.map
     *      ~735 KB), and `npm run package` hands all of dist to ares-package -
     *      so every install carried roughly 795 KB of dev-only payload, about
     *      two thirds of the unpacked application directory.
     *
     *   2. A devtool also switches css-loader into source-map mode, and it then
     *      passes style-loader a third argument per stylesheet: that
     *      stylesheet's own source map, whose sourcesContent array carries the
     *      raw CSS a second time. Every rule therefore appeared twice inside
     *      the JS bundle - once as the string that gets injected, once as
     *      embedded source - which was 30 KB, 13.5% of userScript.js.
     *
     * Neither is read at runtime; only devtools consume a sourceMappingURL.
     * To debug on a TV, build with `npm run build:dev`, which inlines its maps
     * into the bundle that gets deployed.
     */
    devtool: argv.mode === 'development' ? 'inline-source-map' : false,

    output: {
      /**
       * webpack's default hash function (md4) is unsupported by OpenSSL 3 and
       * causes the build to fail on Node.js >= 17 with
       * ERR_OSSL_EVP_UNSUPPORTED. "xxhash64" is implemented in pure JS (no
       * OpenSSL), so it works on any Node.js version.
       * See https://github.com/webpack/webpack/issues/14532
       */
      hashFunction: 'xxhash64',

      /**
       * Wipe the output directory before emitting.
       *
       * webpack only writes an asset when its content changed, so it never
       * removes a file that a *previous* build produced. That matters now that
       * production sets devtool to false: a build made before this change left
       * index.js.map and userScript.js.map sitting in dist, and `npm run
       * package` hands the whole directory to ares-package, so those stale maps
       * would keep shipping - ~795 KB of dev-only payload - with no trace in
       * the build output to explain where they came from.
       *
       * Only emitted assets survive, so the copied icons, index.html and the
       * transformed appinfo.json are all rewritten on every run.
       */
      clean: true
    },

    optimization: {
      /**
       * terser doesn't pickup browserlist config
       * See: https://github.com/terser/terser/issues/235
       *
       * Kept in step with the chrome 79 floor in .browserslistrc, which is the
       * oldest engine we support.
       */
      minimizer: [new TerserPlugin({ terserOptions: { ecma: 2019 } })]
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
                  return transformAppInfo(
                    input,
                    resolveAppResolution(env.resolution)
                  );
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
