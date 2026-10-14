// eslint-plugin-no-unsanitized ships no type declarations.
declare module 'eslint-plugin-no-unsanitized' {
  import type { ESLint } from 'eslint';

  const plugin: ESLint.Plugin;
  export default plugin;
}
