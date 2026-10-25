// Response hooks can be installed by two bundles in the native Cobalt build: an
// early one (before the page's scripts, hooks only) and the full one after load.
// Each hook installs once per page; the later bundle sees the marker and skips.

type HookFlags = Record<string, true | undefined>;

const flags = (): HookFlags => {
  const holder = globalThis as typeof globalThis & { __ytxHooks?: HookFlags };
  return (holder.__ytxHooks ??= {});
};

/** True the first time `name` is claimed on this page, false afterwards. */
export function claimHook(name: string): boolean {
  const claimed = flags();
  if (claimed[name]) return false;
  claimed[name] = true;
  return true;
}
