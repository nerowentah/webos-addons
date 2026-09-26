// Inspired by TizenTube's resolveCommand hook:
// https://github.com/reisxd/TizenTube/blob/522f83cc012d5b1c75181b651e084a3afa280323/mods/resolveCommand.js
// The ResolveCommandRegistry wrapping (getInstance/setHook/dispatchCommand) is
// original YTAF code.

declare global {
  interface Window {
    _yttv?: Record<string, unknown>;
  }
}

type ResolveCommandPayload = Record<string, unknown>;

interface ResolveCommand {
  (command: ResolveCommandPayload, extra?: unknown): unknown;
}

export interface ResolveCommandHook {
  (
    originalFn: ResolveCommand,
    payload: ResolveCommandPayload,
    extra: unknown
  ): unknown;
}

const HOOK_POLL_MS = 250;

let registry: ResolveCommandRegistry | null = null;
let pending: Promise<ResolveCommandRegistry> | null = null;
let disposed = false;

export class ResolveCommandRegistry {
  #originalFn: ResolveCommand;
  #cmds = new Map<string, ResolveCommandHook>();

  private resolveCommand = (
    command: Record<string, unknown>,
    extra?: unknown
  ) => {
    if (!command || Array.isArray(command) || typeof command !== 'object') {
      return this.#originalFn(command, extra);
    }

    if (window.__ytaf_debug__) {
      console.group(`[${this.constructor.name}] Resolving`);
      console.debug('Command:');
      console.debug(command);
      console.debug('Extra:');
      console.debug(extra);
      console.groupEnd();
    }

    for (const key of Object.keys(command)) {
      if (this.#cmds.has(key)) {
        return this.#cmds.get(key)!(this.#originalFn, command, extra);
      }
    }

    return this.#originalFn(command, extra);
  };

  private constructor(hookTargetName: string) {
    if (!ResolveCommandRegistry.checkHookTarget(hookTargetName)) {
      throw new Error(
        `Hook target "${hookTargetName}" not found in window._yttv`
      );
    }

    const hookTarget = window._yttv![hookTargetName] as {
      instance: { resolveCommand: ResolveCommand };
    };

    this.#originalFn = hookTarget.instance.resolveCommand.bind(
      hookTarget.instance
    );

    hookTarget.instance.resolveCommand = this.resolveCommand;

    console.debug(`[${this.constructor.name}] Hooked:`, this.#originalFn);
  }

  private static checkHookTarget(targetName: string) {
    const target = window._yttv?.[targetName];

    return !!(
      target &&
      typeof target === 'function' &&
      'instance' in target &&
      typeof target.instance === 'object' &&
      typeof (target.instance as Record<string, unknown>).resolveCommand ===
        'function'
    );
  }

  private static findHookTarget(exclude?: ReadonlySet<string>) {
    if (typeof window?._yttv !== 'object') return null;

    for (const key in window._yttv) {
      if (exclude?.has(key)) continue;
      if (this.checkHookTarget(key)) {
        return key;
      }
    }

    return null;
  }

  private static getHookTarget(exclude?: ReadonlySet<string>): Promise<string> {
    const hook = this.findHookTarget(exclude);

    if (hook) return Promise.resolve(hook);

    return new Promise((resolve) => {
      const poll = () => {
        if (disposed) return;
        const found = this.findHookTarget(exclude);

        if (found) {
          resolve(found);
        } else {
          setTimeout(poll, HOOK_POLL_MS);
        }
      };
      poll();
    });
  }

  private static init(): Promise<ResolveCommandRegistry> {
    const failed = new Set<string>();

    const attempt = (): Promise<ResolveCommandRegistry> =>
      this.getHookTarget(failed).then((key) => {
        try {
          registry = new ResolveCommandRegistry(key);
          return registry;
        } catch (err) {
          failed.add(key);
          console.error(
            `[${this.constructor.name}] Failed to hook "${key}", retrying...`,
            err
          );
          return attempt();
        }
      });

    return attempt();
  }

  static async getInstance() {
    if (registry) return registry;

    if (disposed) disposed = false;

    pending = pending ?? this.init();
    return pending;
  }

  static dispose() {
    disposed = true;
    pending = null;
  }

  setHook(command: string, fn: ResolveCommandHook) {
    this.#cmds.set(command, fn);
  }

  removeHook(command: string) {
    this.#cmds.delete(command);
  }

  dispatchCommand(payload: ResolveCommandPayload, extra?: unknown) {
    return this.#originalFn(payload, extra);
  }
}

ResolveCommandRegistry.getInstance();
