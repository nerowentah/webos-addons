// Preloaded by `npm test` (node --import). Resolves the extensionless relative
// imports src/ uses (bundler resolution) to the .ts / index.ts file Node can
// actually load, so tests import real modules instead of copies.
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (!/^\.\.?\//.test(specifier)) throw err;
      for (const suffix of ['.ts', '/index.ts']) {
        try {
          return nextResolve(specifier + suffix, context);
        } catch {
          // try the next candidate
        }
      }
      throw err;
    }
  }
});
