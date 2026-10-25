import type { Config } from 'postcss-load-config';

/**
 * webpack's default mode is production, so only an explicit development flag
 * opts out of minification: `webpack --mode=production`, `--mode development`
 * and a bare `webpack` all resolve correctly.
 */
function isDevelopment(): boolean {
  const argv = process.argv;
  const index = argv.findIndex(
    (arg) => arg === '--mode' || arg.startsWith('--mode=')
  );
  const flag = argv[index];
  if (flag === undefined) return false;
  const eq = flag.indexOf('=');
  const value = eq === -1 ? argv[index + 1] : flag.slice(eq + 1);
  return value === 'development';
}

const config: Config = {
  plugins: {
    'postcss-preset-env': {},
    // cssnano runs last (object key order is plugin order) and only for
    // production: there is no cssminimizer-webpack-plugin stage, because
    // style-loader keeps CSS as JS strings in the bundle, so the loader chain
    // is the only place to minify. This is what stops the source comments and
    // whitespace from shipping in userScript.js.
    //
    // colormin is off: it rewrites rgba() as 8-digit hex (#141414f2), which
    // Cobalt's CSS parser rejects, so the native build lost every translucent
    // background and border. The few bytes saved are not worth that.
    ...(isDevelopment()
      ? {}
      : { cssnano: { preset: ['default', { colormin: false }] } })
  }
};

export default config;
