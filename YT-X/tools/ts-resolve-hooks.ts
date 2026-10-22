import type { ResolveHook } from 'node:module';

/**
 * Resolves the extensionless relative imports src/ uses (bundler resolution)
 * to the .ts / index.ts file Node can actually load, so tests can import real
 * modules instead of copies.
 */
export const resolve: ResolveHook = async (specifier, context, next) => {
  try {
    return await next(specifier, context);
  } catch (err) {
    if (!/^\.\.?\//.test(specifier)) throw err;
    for (const suffix of ['.ts', '/index.ts']) {
      try {
        // eslint-disable-next-line no-await-in-loop -- sequential fallbacks
        return await next(specifier + suffix, context);
      } catch {
        // try the next candidate
      }
    }
    throw err;
  }
};
