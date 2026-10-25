import TerserPlugin from 'terser-webpack-plugin';
import webpack from 'webpack';
import type { Configuration } from 'webpack';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAppResolution } from './tools/app-resolution.ts';
import {
  applyUserAgent,
  COBALT_UA,
  resolveUaMode,
  type DeviceIdentity,
  type UaMode
} from './tools/app-ua.ts';
import { getVersionInfo } from './tools/version.ts';

const { version, gitSha, owner } = getVersionInfo();

function transformAppInfo(
  input: Buffer,
  resolution: string,
  ua: UaMode,
  device?: DeviceIdentity
): string {
  const appInfo = JSON.parse(input.toString()) as Record<string, unknown>;
  appInfo['version'] = version;
  appInfo['resolution'] = resolution;
  applyUserAgent(appInfo, ua, device);
  return JSON.stringify(appInfo, null, 2);
}

/** The TV's real model and firmware when deploy passes them (`--env model=... --env firmware=...`). */
function deviceIdentity(
  env: Record<string, string>
): DeviceIdentity | undefined {
  const { model, firmware } = env;
  return model && firmware
    ? { modelName: model, firmwareVersion: firmware }
    : undefined;
}

const makeConfig = (env: Record<string, string>): Configuration[] => [
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
                  resolveAppResolution(env['resolution']),
                  resolveUaMode(env['ua']),
                  deviceIdentity(env)
                );
              }
              return input;
            },
            cache: {
              keys: {
                version,
                resolution: resolveAppResolution(env['resolution']),
                ua: resolveUaMode(env['ua']),
                uaTemplate: COBALT_UA,
                model: env['model'] ?? '',
                firmware: env['firmware'] ?? ''
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
      },
      // Native Cobalt only: the full bundle, loading each feature module on its own.
      nativeMain: {
        import: './src/native-main',
        filename: 'native/[name].js'
      },
      // Native Cobalt only: response hooks that must run before the page.
      nativeEarly: {
        import: './src/native-early',
        filename: 'native/[name].js'
      }
    },

    resolve: {
      extensions: ['.mjs', '.cjs', '.js', '.json', '.ts'],

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
            {
              loader: 'style-loader',
              // Stamps the page's style nonce (needed under the Cobalt CSP).
              options: {
                insert: fileURLToPath(
                  new URL('./src/styles/insert-style.ts', import.meta.url)
                )
              }
            },
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
        __YTX_OWNER__: JSON.stringify(owner),
        __YTX_SPONSORBLOCK__: JSON.stringify(
          resolveUaMode(env['ua']) !== 'cobalt'
        )
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
