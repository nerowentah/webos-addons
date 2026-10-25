// The persisted option store, free of window/DOM access: storage and the
// migration are injected so it runs under `node --test`.

/** The slice of Storage the store uses. */
interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ConfigChangeDetail<V, K extends keyof V = keyof V> {
  key: K;
  newValue: V[K];
  oldValue: V[K];
}

export interface ConfigStoreOptions<V extends object> {
  defaults: V;
  /** Allowed values for string options that are enums. */
  enumValues: Partial<Record<keyof V, readonly string[]>>;
  storageKey: string;
  storage: StorageLike;
  /** Turns the parsed stored JSON into the current shape, or null to discard it. */
  migrate: (raw: unknown) => Partial<V> | null;
}

export interface ConfigStore<V extends object> {
  read<K extends keyof V>(key: K): V[K];
  write<K extends keyof V>(key: K, value: V[K]): void;
  addChangeListener<K extends keyof V>(
    key: K,
    callback: (evt: CustomEvent<ConfigChangeDetail<V, K>>) => void
  ): void;
  removeChangeListener<K extends keyof V>(
    key: K,
    callback: (evt: CustomEvent<ConfigChangeDetail<V, K>>) => void
  ): void;
}

export function createConfigStore<V extends object>(
  opts: ConfigStoreOptions<V>
): ConfigStore<V> {
  const { defaults, enumValues, storageKey, storage, migrate } = opts;
  const keys = Object.keys(defaults) as (keyof V & string)[];

  const targets = Object.fromEntries(keys.map((k) => [k, new EventTarget()]));
  const targetFor = (key: keyof V): EventTarget => {
    const target = targets[key as string];
    if (!target) throw new Error('unknown config key: ' + String(key));
    return target;
  };

  function isValidValue(key: keyof V, value: unknown): boolean {
    if (typeof value !== typeof defaults[key]) return false;
    const allowed = enumValues[key];
    return allowed === undefined || allowed.includes(value as string);
  }

  function load(): Partial<V> | null {
    const raw = storage.getItem(storageKey);
    if (raw === null) return null;

    try {
      const migrated = migrate(JSON.parse(raw));
      if (migrated === null) return null;

      // A hand-edited or downgraded value of the wrong type would break the panel; fall back to the default instead.
      for (const key of keys) {
        if (migrated[key] !== undefined && !isValidValue(key, migrated[key])) {
          delete migrated[key];
        }
      }
      return migrated;
    } catch {
      return null;
    }
  }

  // Use defaults as a prototype so writes to the local copy don't change them.
  const local: Partial<V> = load() ?? (Object.create(defaults) as Partial<V>);

  const assertKnown = (verb: string, key: keyof V): void => {
    if (!Object.hasOwn(defaults, key)) {
      throw new Error(`tried to ${verb} unknown config key: ${String(key)}`);
    }
  };

  return {
    read(key) {
      assertKnown('read', key);

      const stored = local[key];
      if (stored !== undefined) return stored;

      local[key] = defaults[key];
      return defaults[key];
    },

    write(key, value) {
      assertKnown('write', key);

      const oldValue: V[typeof key] = local[key] ?? defaults[key];

      local[key] = value;
      storage.setItem(storageKey, JSON.stringify(local));

      targetFor(key).dispatchEvent(
        new CustomEvent<ConfigChangeDetail<V, typeof key>>('ytxConfigChange', {
          detail: { key, newValue: value, oldValue }
        })
      );
    },

    addChangeListener(key, callback) {
      targetFor(key).addEventListener(
        'ytxConfigChange',
        callback as EventListener
      );
    },

    removeChangeListener(key, callback) {
      targetFor(key).removeEventListener(
        'ytxConfigChange',
        callback as EventListener
      );
    }
  };
}
