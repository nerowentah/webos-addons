import TerserPlugin from 'terser-webpack-plugin';
import webpack from 'webpack';
import { basename } from 'node:path';
import { getVersionInfo } from './tools/version.cjs';

const { version, gitSha, owner } = getVersionInfo();

/**
 * The graphics canvas; webOS accepts only these two values. Picked via
 * `--env resolution=` (not an env var) so it is shell-independent.
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

/** @type {(env: Record<string, string>) => (import('webpack').Configuration)[]} */
const makeConfig = (env) => [
  {
    // Read .browserslistrc explicitly rather than relying on the cwd-relative
    // default, so the ES floor is fixed wherever webpack is invoked from.
    target: 'browserslist',

    // Maps would ship as stray .map files and force css-loader to duplicate
    // every rule's raw CSS into the JS bundle; none are ever emitted.
    devtool: false,

    output: {
      // webpack's default (md4) is unsupported by OpenSSL 3 / Node >= 17;
      // xxhash64 is pure JS and works everywhere.
      // See https://github.com/webpack/webpack/issues/14532
      hashFunction: 'xxhash64',

      // Wipe dist before emitting: webpack never removes assets a previous
      // build left behind (e.g. stale .map files that ares-package would ship).
      clean: true,

      // Copy static assets without a plugin. appinfo.json is rewritten per
      // build; its transform is cached on the inputs that change it.
      copy: [
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
            },
            cache: {
              keys: {
                version,
                resolution: resolveAppResolution(env.resolution)
              }
            }
          }
        },
        { context: 'src', from: 'index.html' }
      ]
    },

    optimization: {
      // terser ignores browserslist, so set the output level explicitly;
      // 2019 tracks the Chrome 79 floor. See terser/terser#235
      // console/debugger are stripped so builds ship no debug output.
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            ecma: 2019,
            compress: { drop_console: true, drop_debugger: true }
          }
        })
      ],

      // Pin the production defaults explicitly so repeated builds over the same
      // sources emit byte-identical, hash-stable files (integrity comparisons).
      moduleIds: 'deterministic',
      chunkIds: 'deterministic',
      realContentHash: true
    },

    entry: {
      index: './src/index.ts',
      userScript: {
        import: './src/userScript',
        filename: 'webOSUserScripts/[name].js'
      }
    },

    resolve: {
      extensions: ['.mjs', '.cjs', '.js', '.json', '.ts'],

      // Sources import migrated modules by their .js specifier (what TS
      // resolves); try the .ts file first.
      extensionAlias: { '.js': ['.ts', '.js'] },

      // The app only runs in the webOS webview. Node-only core modules have no
      // legitimate use in src, so resolve them to an empty module rather than
      // silently pulling a browser stub (or a transitive polyfill) into the
      // shipped bundle if one is ever imported by accident.
      fallback: {
        fs: false,
        child_process: false,
        net: false,
        tls: false,
        dgram: false,
        dns: false,
        http: false,
        https: false,
        http2: false,
        cluster: false,
        worker_threads: false,
        vm: false,
        inspector: false,
        repl: false,
        readline: false,
        perf_hooks: false,
        module: false
      }
    },

    module: {
      rules: [
        {
          test: /\.[mc]?[jt]s$/i,

          loader: 'babel-loader',
          // core-js ships pre-lowered code, so re-transpiling it is wasted work.
          // [\\/] handles Windows and POSIX paths.
          // See https://github.com/zloirock/core-js/issues/743#issuecomment-572074215
          exclude: [/node_modules[\\/]core-js/],
          options: {
            cacheDirectory: true
          },
          resolve: {
            // Extensions are optional in a bundler.
            fullySpecified: false
          }
        },
        {
          test: /\.css$/i,
          use: [
            { loader: 'style-loader' },
            {
              loader: 'css-loader',
              options: { importLoaders: 1 }
            },
            'postcss-loader'
          ]
        },
        {
          // Bundled images (e.g. the SponsorBlock popup icon) inline as data
          // URLs: the webview navigates to youtube.com at launch (core/utils.js
          // handleLaunch), so an emitted file's auto publicPath would resolve
          // against youtube.com.
          test: /\.(png|jpe?g|gif|svg)$/i,
          type: 'asset/inline'
        },
        {
          test: /\.(woff2?|eot|ttf|otf)$/i,
          type: 'asset/resource'
        }
      ]
    },

    plugins: [
      // Only public compile-time constants are safe here; a secret handed to
      // DefinePlugin (or EnvironmentPlugin) would be inlined into the shipped
      // bundle, so none are read or injected.
      new webpack.DefinePlugin({
        __YTX_VERSION__: JSON.stringify(version),
        __YTX_GITSHA__: JSON.stringify(gitSha),
        __YTX_OWNER__: JSON.stringify(owner)
      })
    ],

    // Size hints would only beat the noise floor for a single large bundle,
    // so report them as stats rather than failing or warning on them.
    performance: { hints: 'stats' },

    // Keep build logs to failures; the default dumps the whole module tree.
    stats: 'errors-warnings',
    infrastructureLogging: { level: 'warn' },

    // Persistent build cache; babel-loader's cacheDirectory only covers Babel.
    // Budget-sized caches break as sources change, so reset with
    // `npm run cache:clean` if a rebuild behaves oddly.
    cache: { type: 'filesystem', version: gitSha ?? 'nogit' }
  }
];

export default makeConfig;
