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
const MAX_RETRY_ATTEMPTS = 10;
const MAX_POLL_ATTEMPTS = 120; // 120 * 250ms = 30 seconds max polling

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

    return new Promise((resolve, reject) => {
      let attempts = 0;
      const poll = () => {
        if (disposed) {
          reject(new Error('ResolveCommandRegistry disposed during polling'));
          return;
        }
        attempts++;
        const found = this.findHookTarget(exclude);

        if (found) {
          resolve(found);
        } else if (attempts >= MAX_POLL_ATTEMPTS) {
          reject(
            new Error(
              `Failed to find hook target after ${attempts} polling attempts`
            )
          );
        } else {
          setTimeout(poll, HOOK_POLL_MS);
        }
      };
      poll();
    });
  }

  private static init(): Promise<ResolveCommandRegistry> {
    const failed = new Set<string>();
    let attempts = 0;

    const attempt = (): Promise<ResolveCommandRegistry> => {
      attempts++;
      if (attempts > MAX_RETRY_ATTEMPTS) {
        return Promise.reject(
          new Error(
            `ResolveCommandRegistry initialization failed after ${attempts - 1} attempts`
          )
        );
      }
      return this.getHookTarget(failed)
        .then((key) => {
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
        })
        .catch((err) => {
          console.error(
            `[${this.constructor.name}] Failed to get hook target, retrying...`,
            err
          );
          return attempt();
        });
    };

    return attempt();
  }

  static async getInstance() {
    if (registry) return registry;

    if (disposed) disposed = false;

    if (!pending) {
      pending = this.init().catch((err) => {
        pending = null;
        throw err;
      });
    }
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
