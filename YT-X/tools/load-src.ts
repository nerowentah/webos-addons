/**
 * Loads a module from src/ by runtime URL. tsconfig.tooling.json cannot list
 * src/ files (they are DOM code, this project is Node-only), so tests describe
 * the slice they use with a local interface instead of a static import.
 */
export function loadSrc<T>(relativePath: string): Promise<T> {
  return import(
    new URL(`../src/${relativePath}`, import.meta.url).href
  ) as Promise<T>;
}
